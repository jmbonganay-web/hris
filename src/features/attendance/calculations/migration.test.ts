import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";

const sql = await readFile(
  new URL(
    "../../../../supabase/migrations/202607150001_attendance_policy_calculations.sql",
    import.meta.url,
  ),
  "utf8",
);

test("migration creates policy, groups, revisions, and finalization runs", () => {
  for (const table of [
    "attendance_policy_versions",
    "attendance_calculation_groups",
    "attendance_calculation_revisions",
    "attendance_finalization_runs",
  ]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, "i"));
  }
});

test("calculation revisions are append-only and groups are not directly writable", () => {
  assert.doesNotMatch(sql, /create policy[^;]+attendance_calculation_revisions[^;]+for update/i);
  assert.doesNotMatch(sql, /create policy[^;]+attendance_calculation_revisions[^;]+for delete/i);
  assert.doesNotMatch(sql, /create policy[^;]+attendance_calculation_groups[^;]+for insert/i);
});

test("revision constraints encode approved status combinations", () => {
  assert.match(sql, /missing_clock_out/i);
  assert.match(sql, /worked_minutes is null/i);
  assert.match(sql, /undertime_minutes is null/i);
  assert.match(sql, /base_status <> 'absent' or attendance_record_id is null/i);
  assert.match(sql, /base_status not in \('absent', 'missing_clock_out'\)/i);
});

test("policy and revisions cannot be updated or deleted through RLS", () => {
  assert.doesNotMatch(sql, /create policy[^;]+attendance_policy_versions[^;]+for update/i);
  assert.doesNotMatch(sql, /create policy[^;]+attendance_policy_versions[^;]+for delete/i);
});

test("migration configures a daily Manila finalization cron job", () => {
  assert.match(sql, /create extension if not exists pg_cron/i);
  assert.match(sql, /finalize-attendance-daily/i);
  assert.match(sql, /Asia\/Manila/i);
});

test("policy creation validates backdating and writes safe organization audit", () => {
  assert.match(sql, /create or replace function public\.create_attendance_policy_version/i);
  assert.match(sql, /POLICY_REASON_REQUIRED/i);
  assert.match(sql, /POLICY_EFFECTIVE_DATE_EXISTS/i);
  assert.match(sql, /attendance_policy\.created/i);
  assert.doesNotMatch(sql, /write_employee_audit\([^;]+p_change_reason/i);
});

test("revision writer locks the group and atomically activates the new revision", () => {
  assert.match(sql, /create or replace function public\.write_attendance_calculation_revision/i);
  assert.match(sql, /from public\.attendance_calculation_groups[\s\S]+for update/i);
  assert.match(sql, /coalesce\(max\(revision_number\), 0\) \+ 1/i);
  assert.match(sql, /update public\.attendance_calculation_groups[\s\S]+active_revision_id/i);
  assert.doesNotMatch(sql, /write_employee_audit\([^;]+p_recalculation_reason/i);
});

test("internal policy and revision helpers are not executable by authenticated users", () => {
  assert.match(sql, /resolve_attendance_policy/i);
  assert.match(sql, /revoke all on function public\.resolve_attendance_policy/i);
  assert.match(sql, /revoke all on function public\.write_attendance_calculation_revision/i);
});

test("single-day calculator resolves attendance, assignment, version, and policy", () => {
  assert.match(sql, /create or replace function public\.calculate_attendance_day_internal/i);
  assert.match(sql, /from public\.attendance_records/i);
  assert.match(sql, /from public\.employee_schedule_assignments/i);
  assert.match(sql, /from public\.work_schedule_versions/i);
  assert.match(sql, /resolve_attendance_policy/i);
});

test("single-day calculator uses whole minutes, grace, break deduction, and approved statuses", () => {
  assert.match(sql, /floor\(extract\(epoch from/i);
  assert.match(sql, /late_grace_minutes/i);
  assert.match(sql, /break_minutes/i);
  for (const status of ["present", "absent", "missing_clock_out", "rest_day_worked", "unscheduled_attendance"]) {
    assert.match(sql, new RegExp(`'${status}'`, "i"));
  }
  assert.match(sql, /v_worked_minutes := null/i);
  assert.match(sql, /v_undertime_minutes := null/i);
});

test("public calculator limits employees to their own clock sources", () => {
  assert.match(sql, /create or replace function public\.calculate_attendance_day\(/i);
  assert.match(sql, /p_source not in \('clock_in', 'clock_out'\)/i);
  assert.match(sql, /employee\.profile_id = v_actor/i);
  assert.match(sql, /FUTURE_ATTENDANCE_NOT_ALLOWED/i);
});

test("pg_cron uses its fixed extension schema", () => {
  assert.match(sql, /create extension if not exists pg_cron\s*;/i);
  assert.doesNotMatch(sql, /create extension if not exists pg_cron with schema/i);
});

test("scheduled workday inputs are resolved before absence classification", () => {
  const start = sql.indexOf(
    "create or replace function public.calculate_attendance_day_internal",
  );
  const end = sql.indexOf(
    "revoke all on function public.calculate_attendance_day_internal",
    start,
  );
  const body = sql.slice(start, end);
  const scheduleConstruction = body.indexOf("v_scheduled_start_at :=");
  const absenceBranch = body.indexOf("elsif not v_attendance_exists then");

  assert.ok(scheduleConstruction >= 0, "scheduled timestamps must be constructed");
  assert.ok(absenceBranch >= 0, "absence branch must exist");
  assert.ok(
    scheduleConstruction < absenceBranch,
    "scheduled timestamps and minutes must be available to absence revisions",
  );
});

const phase5b2bMigration = readFileSync(
  new URL("../../../../supabase/migrations/202607150002_overtime_holidays.sql", import.meta.url),
  "utf8",
).toLowerCase();

test("phase 5b-2b snapshots holiday context on attendance revisions", () => {
  assert.match(phase5b2bMigration, /add column if not exists holiday_version_id uuid/);
  assert.match(phase5b2bMigration, /add column if not exists holiday_name text/);
  assert.match(phase5b2bMigration, /add column if not exists holiday_type text/);
  assert.match(phase5b2bMigration, /add column if not exists is_holiday boolean not null default false/);
  assert.match(phase5b2bMigration, /check \(holiday_type is null or holiday_type in \(/);
});

test("holiday is resolved before absence and rest-day classification", () => {
  const resolveAt = phase5b2bMigration.indexOf("from public.resolve_active_holiday(p_attendance_date)");
  const holidayBranchAt = phase5b2bMigration.indexOf("if v_is_holiday then");
  const normalBranchAt = phase5b2bMigration.indexOf("elsif not v_assignment_exists then");
  assert.ok(resolveAt >= 0);
  assert.ok(holidayBranchAt > resolveAt);
  assert.ok(normalBranchAt > holidayBranchAt);
  assert.match(
    phase5b2bMigration,
    /v_base_status := 'holiday';[\s\S]*v_worked_minutes := 0;[\s\S]*v_late_minutes := null;[\s\S]*v_undertime_minutes := null;/,
  );
});

test("holiday work cannot retain late or undertime", () => {
  assert.match(
    phase5b2bMigration,
    /if v_is_holiday then[\s\S]*v_late_minutes := null;[\s\S]*v_undertime_minutes := null;[\s\S]*v_is_late := false;[\s\S]*v_is_undertime := false;/,
  );
});

test("attendance calculation invokes overtime only after writing the revision", () => {
  const writeAt = phase5b2bMigration.indexOf(
    "v_revision_id := public.write_attendance_calculation_revision(",
  );
  const overtimeAt = phase5b2bMigration.indexOf(
    "perform public.calculate_overtime_for_attendance_day(",
  );
  assert.ok(writeAt >= 0);
  assert.ok(overtimeAt > writeAt);
});


test("every attendance mutation path reaches overtime through the internal calculator", () => {
  const internal = phase5b2bMigration.match(
    /create or replace function public\.calculate_attendance_day_internal[\s\S]*?\$\$;/i,
  )?.[0] ?? "";
  assert.match(internal, /calculate_overtime_for_attendance_day/);
  for (const source of [
    "clock_in",
    "clock_out",
    "hr_create",
    "hr_correction",
    "correction_approval",
    "daily_finalization",
    "manual_recalculation",
    "manual_finalization",
  ]) {
    assert.match(internal, new RegExp(`'${source}'`));
  }
});
