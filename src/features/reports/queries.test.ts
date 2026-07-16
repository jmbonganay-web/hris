import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./queries.ts", import.meta.url), "utf8");
const auth = await readFile(new URL("./auth.ts", import.meta.url), "utf8");

test("report queries are server-only and call protected RPCs", () => {
  assert.match(source, /^import "server-only";/);
  for (const rpc of [
    "get_attendance_report_summary",
    "get_attendance_daily_report",
    "get_employee_attendance_summary",
    "get_attendance_exception_report",
    "get_overtime_holiday_report",
    "get_leave_balance_report",
    "get_leave_usage_report",
    "get_leave_conflict_report",
  ]) assert.match(source, new RegExp(`\\.rpc\\("${rpc}"`));
});

test("report authorization reuses HR role enforcement", () => {
  assert.match(auth, /requireHrAdmin/);
  assert.match(auth, /requireReportAdmin/);
  assert.match(auth, /requireReportApiAdmin/);
  assert.match(auth, /ReportAccessError/);
});

test("query mapping derives durations from integer minutes", () => {
  assert.match(source, /formatReportDuration/);
  assert.match(source, /total_approved_overtime_duration/);
});

test("report query rows preserve source revision references but no protected text", () => {
  assert.match(source, /attendance_calculation_revision_id/);
  assert.match(source, /detection_revision_id/);
  assert.doesNotMatch(source, /approval_note|rejection_reason|recalculation_reason|change_reason|reviewed_by/);
});


test("leave report adapters map protected RPC projections", () => {
  assert.match(source, /getLeaveBalanceReport/);
  assert.match(source, /getLeaveUsageReport/);
  assert.match(source, /getLeaveConflictReport/);
  assert.match(source, /allocated_units: requiredNumber/);
  assert.match(source, /chargeable_units: requiredNumber/);
});

test("report leave filters include archived and historical leave types", () => {
  assert.match(source, /\.from\("leave_types"\)/);
  assert.match(source, /versions:leave_type_versions/);
  assert.doesNotMatch(source, /get_active_leave_type_options/);
});
