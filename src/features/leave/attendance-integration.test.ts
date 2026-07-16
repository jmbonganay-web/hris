import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../../../supabase/migrations/202607160001_leave_management.sql", import.meta.url),
  "utf8",
);

function body(name: string) {
  const match = migration.match(
    new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`, "i"),
  );
  assert.ok(match, `${name} must exist`);
  return match[0];
}

test("attendance calculator resolves approved active leave", () => {
  const source = body("calculate_attendance_day_internal");
  assert.match(source, /leave_request_groups/i);
  assert.match(source, /current_status = 'approved'/i);
  assert.match(source, /paid_leave/i);
  assert.match(source, /unpaid_leave/i);
});

test("holiday and rest-day precedence remains before leave classification", () => {
  const source = body("calculate_attendance_day_internal");
  const holiday = source.indexOf("v_is_holiday");
  const restDay = source.indexOf("not v_is_workday");
  const paidLeave = source.indexOf("paid_leave");
  assert.ok(holiday >= 0 && paidLeave >= 0 && holiday < paidLeave);
  assert.ok(restDay >= 0 && paidLeave >= 0 && restDay < paidLeave);
});

test("completed full-day attendance creates conflict and releases the charge", () => {
  const source = body("apply_leave_attendance_effects");
  assert.match(source, /full_day_completed_attendance/i);
  assert.match(source, /attendance_conflict_release/i);
  assert.match(source, /restore_leave_charge/i);
});

test("incomplete full-day attendance keeps the charge", () => {
  const source = body("apply_leave_attendance_effects");
  const branch = source.split(/full_day_incomplete_attendance/i)[1] ?? "";
  assert.doesNotMatch(branch.split(/half_day_covered_time_overlap/i)[0] ?? "", /restore_leave_charge/i);
});

test("half-day overlap creates a conflict without automatic release", () => {
  const source = body("apply_leave_attendance_effects");
  const branch = source.split(/half_day_covered_time_overlap/i)[1] ?? "";
  assert.doesNotMatch(branch, /attendance_conflict_release/i);
});

test("leave date recalculation calls attendance calculation for every date", () => {
  const source = body("recalculate_attendance_for_leave_dates");
  assert.match(source, /calculate_attendance_day_internal/i);
  assert.match(source, /apply_leave_attendance_effects/i);
});

test("all attendance calculation paths apply approved-leave effects", () => {
  const source = body("calculate_attendance_day_internal");
  const writeIndex = source.indexOf("write_attendance_calculation_revision");
  const effectsIndex = source.indexOf("apply_leave_attendance_effects");
  assert.ok(writeIndex >= 0 && effectsIndex > writeIndex);
});

test("attendance status constraint accepts leave statuses", () => {
  assert.match(migration, /calculation_revision_status_check[\s\S]*?'paid_leave'[\s\S]*?'unpaid_leave'/i);
});

test("attendance conflict release follows the request day across recalculation revisions", () => {
  const source = body("apply_leave_attendance_effects");
  assert.match(source, /leave_request_day_revisions/i);
  assert.match(source, /request_day_id = v_leave\.request_day_id/i);
});
