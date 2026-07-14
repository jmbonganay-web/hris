import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateAttendanceRecalculation } from "../validation.ts";

const migration = await readFile(
  new URL("../../../../supabase/migrations/202607150001_attendance_policy_calculations.sql", import.meta.url),
  "utf8",
);
const action = await readFile(
  new URL("../../../app/(dashboard)/admin/attendance/recalculate/actions.ts", import.meta.url),
  "utf8",
).catch(() => "");

const employeeId = "11111111-1111-4111-8111-111111111111";
function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

test("recalculation validation enforces scope, dates, future exclusion, and private reason", () => {
  const valid = validateAttendanceRecalculation(form({
    scope: "one_employee", employee_id: employeeId,
    start_date: "2026-07-01", end_date: "2026-07-15", reason: "Payroll review",
  }), "2026-07-15");
  assert.deepEqual(valid.data?.employeeIds, [employeeId]);
  assert.equal(validateAttendanceRecalculation(form({ scope: "all_active", start_date: "2026-07-16", end_date: "2026-07-16", reason: "x" }), "2026-07-15").data, undefined);
  const invalid = validateAttendanceRecalculation(form({ scope: "one_employee", employee_id: employeeId, start_date: "2026-07-15", end_date: "2026-07-01", reason: "PRIVATE_RECALC_REASON" }), "2026-07-15");
  assert.doesNotMatch(JSON.stringify(invalid.state), /PRIVATE_RECALC_REASON/);
});

test("migration defines an HR-only range recalculation using append-only internal calculation", () => {
  assert.match(migration, /create or replace function public\.recalculate_attendance_range/i);
  assert.match(migration, /not public\.is_hr_admin\(\)/i);
  assert.match(migration, /p_end_date > public\.company_attendance_date/i);
  assert.match(migration, /p_employee_ids uuid\[\]/i);
  assert.match(migration, /'manual_recalculation'/i);
  assert.match(migration, /calculate_attendance_day_internal/i);
  assert.doesNotMatch(migration, /write_employee_audit\([^;]+p_reason/i);
});

test("recalculation action calls one protected RPC and never echoes the reason", () => {
  assert.match(action, /\.rpc\("recalculate_attendance_range"/);
  assert.doesNotMatch(action, /values:[^}]*reason/);
});
