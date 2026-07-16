import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../../../supabase/migrations/202607150004_attendance_reports_payroll_export.sql", import.meta.url), "utf8");

test("internal report helpers and source views are inaccessible to client roles", () => {
  assert.match(sql, /revoke all on public\.report_attendance_source_v1 from public, anon, authenticated/i);
  assert.match(sql, /revoke all on public\.report_overtime_source_v1 from public, anon, authenticated/i);
  assert.match(sql, /revoke all on function public\.report_require_hr\(\) from public, anon, authenticated/i);
  assert.match(sql, /revoke all on function public\.report_validate_request[\s\S]+from public, anon, authenticated/i);
});

test("report helpers use fixed search paths and role validation", () => {
  assert.match(sql, /create or replace function public\.report_require_hr\(\)[\s\S]+security definer[\s\S]+set search_path = pg_catalog, public/i);
  assert.match(sql, /not public\.is_hr_admin\(\)/i);
});

test("public report RPCs are security definer with fixed search paths", () => {
  for (const name of ["get_attendance_report_summary", "get_attendance_daily_report"]) {
    const body = sql.match(new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\$\\$;`, "i"))?.[0] ?? "";
    assert.match(body, /security definer/i);
    assert.match(body, /set search_path = pg_catalog, public/i);
    assert.match(body, /report_validate_request/i);
  }
});

test("overtime report exposes lifecycle facts but excludes protected review text", () => {
  const body = sql.match(/create or replace function public\.get_overtime_holiday_report[\s\S]*?\$\$;/i)?.[0] ?? "";
  assert.match(body, /is_active_detection/i);
  assert.match(body, /is_superseded/i);
  assert.doesNotMatch(body, /approval_note|rejection_reason|reviewed_by|recalculation_reason|change_reason/i);
});

test("only authenticated callers may invoke public report functions", () => {
  for (const signature of [
    "get_attendance_report_summary",
    "get_attendance_daily_report",
    "get_employee_attendance_summary",
    "get_attendance_exception_report",
    "get_overtime_holiday_report",
    "record_attendance_report_export",
  ]) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${signature}[\\s\\S]+from public, anon`, "i"));
    assert.match(sql, new RegExp(`grant execute on function public\\.${signature}[\\s\\S]+to authenticated`, "i"));
  }
});

test("all report and audit RPCs use fixed search paths and role validation", () => {
  for (const name of [
    "get_attendance_report_summary",
    "get_attendance_daily_report",
    "get_employee_attendance_summary",
    "get_attendance_exception_report",
    "get_overtime_holiday_report",
    "record_attendance_report_export",
  ]) {
    const body = sql.match(new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\$\\$;`, "i"))?.[0] ?? "";
    assert.match(body, /security definer/i);
    assert.match(body, /set search_path = pg_catalog, public/i);
    assert.match(body, /report_(validate_request|require_hr)/i);
  }
});

const leaveSql = await readFile(new URL("../../../supabase/migrations/202607160001_leave_management.sql", import.meta.url), "utf8");

function leaveFunctionBody(name: string) {
  return leaveSql.match(new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\$\\$;`, "i"))?.[0] ?? "";
}

test("leave report RPCs enforce HR access with fixed search paths", () => {
  for (const name of ["get_leave_balance_report", "get_leave_usage_report", "get_leave_conflict_report"]) {
    const body = leaveFunctionBody(name);
    assert.match(body, /security definer/i);
    assert.match(body, /set search_path = pg_catalog, public/i);
    assert.match(body, /auth\.uid\(\) is null or not public\.is_hr_admin\(\)/i);
    assert.doesNotMatch(body, /employee_note|storage_path|original_filename|action_reason|review_note|private_reason|private_resolution_note/i);
  }
});

test("leave report RPCs are executable only by authenticated callers", () => {
  for (const name of ["get_leave_balance_report", "get_leave_usage_report", "get_leave_conflict_report"]) {
    assert.match(leaveSql, new RegExp(`revoke all on function public\\.${name}[\\s\\S]+from public, anon`, "i"));
    assert.match(leaveSql, new RegExp(`grant execute on function public\\.${name}[\\s\\S]+to authenticated`, "i"));
  }
});

test("report export audit accepts leave datasets without confidential payloads", () => {
  const bodies = leaveSql.match(/create or replace function public\.record_attendance_report_export[\s\S]*?\$\$;/gi) ?? [];
  const body = bodies.at(-1) ?? "";
  for (const dataset of ["leave_balances", "leave_usage", "leave_conflicts"]) assert.match(body, new RegExp(dataset));
  assert.doesNotMatch(body, /employee_note|storage_path|original_filename|action_reason|review_note|private_reason|private_resolution_note/i);
});

test("recreated leave-aware attendance summary RPCs retain authenticated-only grants", () => {
  for (const name of ["get_attendance_report_summary", "get_employee_attendance_summary"]) {
    assert.match(leaveSql, new RegExp(`revoke all on function public\\.${name}[\\s\\S]+from public, anon`, "i"));
    assert.match(leaveSql, new RegExp(`grant execute on function public\\.${name}[\\s\\S]+to authenticated`, "i"));
  }
});
