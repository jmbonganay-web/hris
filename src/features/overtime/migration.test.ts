import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL(
    "../../../supabase/migrations/202607150002_overtime_holidays.sql",
    import.meta.url,
  ),
  "utf8",
);


const queriesSource = await readFile(
  new URL("./queries.ts", import.meta.url),
  "utf8",
);
test("migration creates overtime, holiday, detection, and approval tables", () => {
  for (const table of [
    "overtime_policy_versions",
    "holiday_calendar_groups",
    "holiday_calendar_versions",
    "overtime_detection_groups",
    "overtime_detection_revisions",
    "overtime_approval_items",
  ]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, "i"));
  }
});

test("attendance revisions gain immutable holiday snapshot fields", () => {
  for (const column of [
    "holiday_version_id",
    "holiday_name",
    "holiday_type",
    "is_holiday",
  ]) {
    assert.match(
      sql,
      new RegExp(`alter table public\\.attendance_calculation_revisions[\\s\\S]+${column}`, "i"),
    );
  }
  assert.match(sql, /'holiday'/i);
});

test("group identities and lifecycle foreign keys are constrained", () => {
  assert.match(sql, /unique \(employee_id, attendance_date, segment_type\)/i);
  assert.match(sql, /holiday_calendar_groups_active_version_fkey/i);
  assert.match(sql, /overtime_detection_groups_active_revision_fkey/i);
  assert.match(sql, /overtime_approval_items_superseded_by_fkey/i);
});

test("approved enums and minute limits are encoded in constraints", () => {
  assert.match(sql, /minimum_qualifying_minutes between 1 and 480/i);
  for (const value of [
    "regular_holiday",
    "special_non_working_holiday",
    "company_holiday",
    "pre_shift",
    "post_shift",
    "rest_day",
    "holiday_work",
    "pending",
    "approved",
    "rejected",
    "superseded",
  ]) {
    assert.match(sql, new RegExp(`'${value}'`, "i"));
  }
});

test("base tables expose HR reads but no direct mutations", () => {
  for (const table of [
    "overtime_policy_versions",
    "holiday_calendar_groups",
    "holiday_calendar_versions",
    "overtime_detection_groups",
    "overtime_detection_revisions",
    "overtime_approval_items",
  ]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.doesNotMatch(
      sql,
      new RegExp(`create policy[^;]+${table}[^;]+for (insert|update|delete)`, "i"),
    );
  }
});

test("approval constraints prohibit partial approval", () => {
  assert.match(sql, /status = 'approved'[\s\S]+approved_minutes = detected_minutes/i);
  assert.match(sql, /status = 'rejected'[\s\S]+approved_minutes = 0/i);
  assert.match(sql, /status = 'pending'[\s\S]+approved_minutes = 0/i);
});

test("detection writer locks groups and no-ops unchanged source snapshots", () => {
  assert.match(sql, /create or replace function public\.write_overtime_detection_revision/i);
  assert.match(sql, /from public\.overtime_detection_groups[\s\S]+for update/i);
  assert.match(sql, /is not distinct from p_attendance_calculation_revision_id/i);
  assert.match(sql, /'changed', false/i);
});

test("detection changes supersede old revisions and approval items atomically", () => {
  assert.match(sql, /update public\.overtime_detection_revisions[\s\S]+is_active = false/i);
  assert.match(sql, /update public\.overtime_approval_items[\s\S]+status = 'superseded'/i);
  assert.match(sql, /superseded_by_item_id = v_new_item_id/i);
  assert.match(sql, /active_revision_id = v_revision_id/i);
});

test("initial zero segments are skipped but existing zero segments are versioned", () => {
  const body = sql.match(/create or replace function public\.write_overtime_detection_revision[\s\S]*?\$\$;/i)?.[0] ?? "";
  assert.match(body, /if v_group_id is null and p_detected_minutes = 0 then/i);
  assert.match(body, /return jsonb_build_object\([\s\S]+'changed', false/i);
  assert.match(body, /insert into public\.overtime_detection_revisions/i);
});

test("single-day detector implements holiday then rest-day then scheduled precedence", () => {
  const body = sql.match(/create or replace function public\.calculate_overtime_for_attendance_day[\s\S]*?\$\$;/i)?.[0] ?? "";
  const holiday = body.indexOf("if v_holiday_version_id is not null then");
  const rest = body.indexOf("elsif not v_is_scheduled_workday then");
  const scheduled = body.indexOf("elsif v_attendance.scheduled_start_at is not null");
  assert.ok(holiday >= 0);
  assert.ok(rest > holiday);
  assert.ok(scheduled > rest);
});

test("detector stores below-threshold positive revisions without approval items", () => {
  const writer = sql.match(/create or replace function public\.write_overtime_detection_revision[\s\S]*?\$\$;/i)?.[0] ?? "";
  assert.match(writer, /if p_meets_threshold and p_detected_minutes > 0 then/i);
  assert.match(writer, /insert into public\.overtime_detection_revisions/i);
});

test("detector reuses finalized worked minutes for rest day and holiday work", () => {
  const body = sql.match(/create or replace function public\.calculate_overtime_for_attendance_day[\s\S]*?\$\$;/i)?.[0] ?? "";
  assert.match(body, /v_holiday_minutes := v_attendance\.worked_minutes/i);
  assert.match(body, /v_rest_minutes := v_attendance\.worked_minutes/i);
  assert.doesNotMatch(body, /break_minutes/i);
});

test("review function locks and validates item plus active revision before deciding", () => {
  const review = sql.match(
    /create or replace function public\.review_overtime_approval_item[\s\S]*?\$\$;/i,
  )?.[0] ?? "";
  assert.match(review, /from public\.overtime_approval_items[\s\S]*for update/i);
  assert.match(review, /from public\.overtime_detection_revisions[\s\S]*for update/i);
  assert.match(review, /group_row\.active_revision_id <> revision\.id/i);
  assert.match(review, /item\.detected_minutes <> revision\.detected_minutes/i);
  assert.match(review, /OVERTIME_ITEM_STALE/i);
});

test("approval is all detected minutes and rejection is zero", () => {
  const review = sql.match(
    /create or replace function public\.review_overtime_approval_item[\s\S]*?\$\$;/i,
  )?.[0] ?? "";
  assert.match(review, /approved_minutes = item\.detected_minutes/i);
  assert.match(review, /approved_minutes = 0/i);
  assert.doesNotMatch(review, /p_approved_minutes/i);
});


test("Phase 5B-2B migration is one transaction and refreshes PostgREST once", () => {
  const normalized = sql.toLowerCase();
  assert.equal((normalized.match(/^begin;/gm) ?? []).length, 1);
  assert.equal((normalized.match(/^commit;/gm) ?? []).length, 1);
  assert.equal((normalized.match(/notify pgrst, 'reload schema';/g) ?? []).length, 1);
  assert.ok(normalized.lastIndexOf("notify pgrst, 'reload schema';") < normalized.lastIndexOf("commit;"));
});

test("all six required protected functions exist", () => {
  for (const name of [
    "create_overtime_policy_version",
    "create_holiday",
    "replace_holiday_version",
    "calculate_overtime_for_attendance_day",
    "recalculate_overtime_range",
    "review_overtime_approval_item",
  ]) {
    assert.match(sql, new RegExp(`create or replace function public\\.${name}`, "i"));
  }
});

test("holiday and policy writes do not silently invoke historical recalculation", () => {
  for (const name of ["create_overtime_policy_version", "create_holiday", "replace_holiday_version"]) {
    const body = sql.match(
      new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\$\\$;`, "i"),
    )?.[0] ?? "";
    assert.doesNotMatch(body, /recalculate_overtime_range|calculate_attendance_day_internal/);
  }
});

test("active approved totals exclude superseded or inactive detection revisions", () => {
  assert.match(
    queriesSource,
    /row\.status === "approved" && row\.detection_is_active/,
  );
});


test("holiday attendance columns and constraints are declared once", () => {
  const normalized = sql.toLowerCase();
  assert.equal((normalized.match(/add column if not exists holiday_version_id uuid/g) ?? []).length, 1);
  assert.equal((normalized.match(/add constraint calculation_revision_holiday_type_check/g) ?? []).length, 1);
  assert.equal((normalized.match(/add constraint calculation_revision_holiday_snapshot_check/g) ?? []).length, 1);
});


test("approval supersession audit preserves the prior decision status", () => {
  const writer = sql.match(
    /create or replace function public\.write_overtime_detection_revision[\s\S]*?\$\$;/i,
  )?.[0] ?? "";
  assert.match(writer, /select approval\.\* into v_old_item/);
  assert.match(writer, /'status', v_old_item\.status/);
  assert.doesNotMatch(writer, /'status', 'active'/);
});


test("employee attendance RPC is dropped before its return table is expanded", () => {
  const dropIndex = sql.search(/drop function if exists public\.get_my_attendance_calculations\(date, date\)/i);
  const createIndex = sql.search(/create or replace function public\.get_my_attendance_calculations/i);
  assert.ok(dropIndex >= 0);
  assert.ok(createIndex > dropIndex);
});
