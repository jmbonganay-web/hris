import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../../../supabase/migrations/202607150004_attendance_reports_payroll_export.sql", import.meta.url), "utf8");
const migration = await readFile(new URL("../../../supabase/migrations/202607160001_leave_management.sql", import.meta.url), "utf8");

function functionBody(name: string) {
  return migration.match(new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\$\\$;`, "i"))?.[0] ?? "";
}

test("migration is one transaction with one schema refresh", () => {
  assert.equal((sql.toLowerCase().match(/^begin;/gm) ?? []).length, 1);
  assert.equal((sql.toLowerCase().match(/^commit;/gm) ?? []).length, 1);
  assert.equal((sql.toLowerCase().match(/notify pgrst, 'reload schema';/g) ?? []).length, 1);
});

test("report source views use active attendance and overtime pointers", () => {
  assert.match(sql, /create or replace view public\.report_attendance_source_v1/i);
  assert.match(sql, /revision\.id = group_row\.active_revision_id/i);
  assert.match(sql, /create or replace view public\.report_overtime_source_v1/i);
  assert.match(sql, /group_row\.active_revision_id = revision\.id/i);
});

test("report query indexes support date and active revision lookups", () => {
  assert.match(sql, /attendance_report_group_date_idx/i);
  assert.match(sql, /overtime_report_group_date_idx/i);
  assert.match(sql, /overtime_report_approval_active_idx/i);
});

test("summary and daily RPCs enforce active finalized payroll data", () => {
  assert.match(sql, /create or replace function public\.get_attendance_report_summary/i);
  assert.match(sql, /create or replace function public\.get_attendance_daily_report/i);
  assert.match(sql, /p_mode = 'operational' or source\.is_provisional = false/i);
  assert.match(sql, /REPORT_ROW_LIMIT/i);
  assert.match(sql, /order by source\.attendance_date desc, source\.employee_number asc, source\.attendance_calculation_revision_id asc/i);
});

test("employee summary supports zero-record reconciliation and overtime breakdowns", () => {
  assert.match(sql, /create or replace function public\.get_employee_attendance_summary/i);
  assert.match(sql, /p_include_employees_without_records boolean/i);
  for (const field of [
    "approved_pre_shift_minutes",
    "approved_post_shift_minutes",
    "approved_rest_day_minutes",
    "approved_holiday_work_minutes",
    "regular_holiday_work_minutes",
    "special_non_working_holiday_work_minutes",
    "company_holiday_work_minutes",
  ]) assert.match(sql, new RegExp(field, "i"));
  assert.doesNotMatch(sql, /attendance_rate/i);
});

test("exceptions expand one attendance day into independent exception rows", () => {
  assert.match(sql, /create or replace function public\.get_attendance_exception_report/i);
  for (const value of ["absent", "missing_clock_out", "provisional_or_incomplete", "unscheduled_attendance", "late", "undertime"]) {
    assert.match(sql, new RegExp(`'${value}'`, "i"));
  }
  assert.match(sql, /cross join lateral/i);
});

test("report RPC outputs exclude protected and payroll-only fields", () => {
  const names = [
    "get_attendance_report_summary",
    "get_attendance_daily_report",
    "get_employee_attendance_summary",
    "get_attendance_exception_report",
    "get_overtime_holiday_report",
  ];
  const reportFunctionBodies = names.map((name) =>
    sql.match(new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\$\\$;`, "i"))?.[0] ?? "",
  ).join("\n");
  const forbidden = [
    "government", "bank", "salary", "approval_note", "rejection_reason",
    "recalculation_reason", "change_reason", "reviewed_by", "attendance_note",
  ];
  for (const name of forbidden) assert.doesNotMatch(reportFunctionBodies, new RegExp(name, "i"));
});

test("operational report predicates allow provisional rows while payroll excludes them", () => {
  const attendanceFunctions = [
    "get_attendance_report_summary",
    "get_attendance_daily_report",
    "get_employee_attendance_summary",
    "get_attendance_exception_report",
  ].map((name) => sql.match(new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\$\\$;`, "i"))?.[0] ?? "");
  for (const body of attendanceFunctions) {
    assert.match(body, /p_mode = 'operational' or source\.is_provisional = false/i);
  }
  assert.doesNotMatch(attendanceFunctions[0] ?? "", /attendance_rate/i);
});

test("daily source pivots independent overtime segments without duplicating attendance rows", () => {
  const view = sql.match(/create or replace view public\.report_attendance_source_v1[\s\S]*?create or replace view public\.report_overtime_source_v1/i)?.[0] ?? "";
  assert.match(view, /left join lateral/i);
  assert.match(view, /filter \(where detection\.segment_type = 'pre_shift'\)/i);
  assert.match(view, /filter \(where detection\.segment_type = 'post_shift'\)/i);
  assert.match(view, /detection\.id = detection_group\.active_revision_id[\s\S]+detection\.is_active/i);
  assert.match(view, /approval\.status = 'approved'[\s\S]+approval\.superseded_at is null/i);
});

test("every paginated report uses stable secondary sort keys", () => {
  const expectations: Array<[string, RegExp]> = [
    ["get_attendance_daily_report", /order by source\.attendance_date desc, source\.employee_number asc, source\.attendance_calculation_revision_id asc/i],
    ["get_employee_attendance_summary", /order by employee\.employee_number asc, employee\.id asc/i],
    ["get_attendance_exception_report", /order by exception_row\.attendance_date desc, exception_row\.employee_number asc,[\s\S]+exception_row\.exception_type asc, exception_row\.attendance_calculation_revision_id asc/i],
    ["get_overtime_holiday_report", /order by source\.attendance_date desc, source\.employee_number asc,[\s\S]+source\.segment_type asc, source\.detection_revision_id asc/i],
  ];
  for (const [name, order] of expectations) {
    const body = sql.match(new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\$\\$;`, "i"))?.[0] ?? "";
    assert.match(body, order);
  }
});


test("employee summary qualifies the source employee id to avoid PL/pgSQL output-column ambiguity", () => {
  const body = sql.match(/create or replace function public\.get_employee_attendance_summary[\s\S]*?\$\$;/i)?.[0] ?? "";
  assert.equal((body.match(/select distinct source\.employee_id from filtered_source as source/gi) ?? []).length, 2);
  assert.doesNotMatch(body, /select distinct employee_id from filtered_source/i);
});


test("migration exposes HR-only leave report functions", () => {
  for (const name of [
    "get_leave_balance_report",
    "get_leave_usage_report",
    "get_leave_conflict_report",
  ]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${name}`, "i"));
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}`, "i"));
  }
});

test("leave report SQL excludes private columns", () => {
  const privateColumns = [
    "employee_note", "storage_path", "original_filename", "action_reason",
    "review_note", "private_reason", "private_resolution_note",
  ];
  for (const name of ["get_leave_balance_report", "get_leave_usage_report", "get_leave_conflict_report"]) {
    const source = functionBody(name);
    for (const column of privateColumns) assert.doesNotMatch(source, new RegExp(column, "i"));
  }
});

test("leave-aware attendance summaries count calculation base statuses", () => {
  const summaryBodies = ["get_attendance_report_summary", "get_employee_attendance_summary"].map(functionBody);
  for (const body of summaryBodies) {
    assert.match(body, /source\.attendance_status = 'paid_leave'/i);
    assert.match(body, /source\.attendance_status = 'unpaid_leave'/i);
    assert.doesNotMatch(body, /leave_request_groups|leave_request_days/i);
  }
});

test("leave balance report uses pending reservations and export-safe limits", () => {
  const body = functionBody("get_leave_balance_report");
  assert.match(body, /leave_pending_reservations/i);
  assert.match(body, /sum\(reservation\.reserved_units\)/i);
  assert.match(body, /limit least\(greatest\(coalesce\(p_limit, 50\), 1\), 25000\)/i);
});

test("leave balance report resolves policy names for current, historical, and future leave years", () => {
  const body = functionBody("get_leave_balance_report");
  assert.match(body, /account\.leave_year < extract\(year from current_date\)/i);
  assert.match(body, /make_date\(account\.leave_year, 12, 31\)/i);
  assert.match(body, /else make_date\(account\.leave_year, 1, 1\)/i);
});
