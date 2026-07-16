import test from "node:test";
import assert from "node:assert/strict";
import {
  buildReportCsv,
  csvFilename,
  dailyCsv,
  employeeSummaryCsv,
  exceptionsCsv,
  overtimeHolidayCsv,
  leaveBalanceCsv,
  leaveUsageCsv,
  leaveConflictCsv,
  leaveBalanceHeaders,
  leaveUsageHeaders,
  leaveConflictHeaders,
} from "./csv.ts";
import type {
  AttendanceExceptionReportRow,
  DailyAttendanceReportRow,
  EmployeeAttendanceSummaryRow,
  OvertimeHolidayReportRow,
} from "./types.ts";

test("CSV quotes delimiters and escapes formula-like text", () => {
  const csv = buildReportCsv(["name", "minutes"], [["=SUM(A1:A2), test", 60]]);
  assert.equal(csv, 'name,minutes\r\n"\'=SUM(A1:A2), test",60\r\n');
});

test("CSV escapes every spreadsheet formula prefix", () => {
  const csv = buildReportCsv(["equals", "plus", "minus", "at"], [["=1+1", "+cmd", "-2+3", "@SUM(A1)"]]);
  assert.equal(csv, "equals,plus,minus,at\r\n'=1+1,'+cmd,'-2+3,'@SUM(A1)\r\n");
});

test("CSV preserves empty null fields and zero numeric fields", () => {
  assert.equal(buildReportCsv(["unknown", "zero"], [[null, 0]]), "unknown,zero\r\n,0\r\n");
});

test("filenames are controlled by dataset and dates", () => {
  assert.equal(csvFilename("daily", "2026-07-01", "2026-07-15"), "attendance-daily-2026-07-01-to-2026-07-15.csv");
  assert.equal(csvFilename("employee_summary", "2026-07-01", "2026-07-15"), "attendance-employee-summary-2026-07-01-to-2026-07-15.csv");
  assert.equal(csvFilename("exceptions", "2026-07-01", "2026-07-15"), "attendance-exceptions-2026-07-01-to-2026-07-15.csv");
  assert.equal(csvFilename("overtime_holiday", "2026-07-01", "2026-07-15"), "overtime-holiday-work-2026-07-01-to-2026-07-15.csv");
});

const dailyRow = {
  attendance_date: "2026-07-15",
  employee_number: "EMP-001",
  employee_name: "=Injected Name",
  department_name: null,
  job_title_name: "Developer",
  employment_status: "active",
  attendance_status: "present",
  calculation_state: "finalized",
  is_holiday: false,
  holiday_name: null,
  holiday_type: null,
  is_scheduled_day: true,
  scheduled_start: "2026-07-15T00:00:00.000Z",
  scheduled_end: "2026-07-15T09:00:00.000Z",
  clock_in: "2026-07-15T00:00:00.000Z",
  clock_out: null,
  worked_minutes: 0,
  worked_duration: "00:00",
  late_minutes: null,
  late_duration: "",
  undertime_minutes: 0,
  undertime_duration: "00:00",
  pre_shift_detected_minutes: null,
  pre_shift_approved_minutes: null,
  pre_shift_status: null,
  post_shift_detected_minutes: null,
  post_shift_approved_minutes: null,
  post_shift_status: null,
  rest_day_detected_minutes: null,
  rest_day_approved_minutes: null,
  rest_day_status: null,
  holiday_work_detected_minutes: null,
  holiday_work_approved_minutes: null,
  holiday_work_status: null,
  total_approved_overtime_minutes: 0,
  total_approved_overtime_duration: "00:00",
  attendance_calculation_revision_id: "rev-1",
  generated_at: "2026-07-15T12:00:00+08:00",
  timezone: "Asia/Manila",
} as unknown as DailyAttendanceReportRow;

const summaryRow = {
  employee_number: "EMP-001",
  employee_name: "+Injected Name",
  department_name: "Engineering",
  job_title_name: null,
  employment_status: "active",
  report_start_date: "2026-07-01",
  report_end_date: "2026-07-15",
  employee_day_records: 1,
  scheduled_days: 1,
  present_days: 1,
  absent_days: 0,
  holiday_days: 0,
  missing_clock_out_days: 0,
  rest_day_worked_days: 0,
  unscheduled_attendance_days: 0,
  finalized_days: 1,
  provisional_days: 0,
  worked_minutes: 480,
  worked_duration: "08:00",
  late_minutes: 0,
  late_duration: "00:00",
  undertime_minutes: 0,
  undertime_duration: "00:00",
  approved_pre_shift_minutes: 0,
  approved_pre_shift_duration: "00:00",
  approved_post_shift_minutes: 60,
  approved_post_shift_duration: "01:00",
  approved_rest_day_minutes: 0,
  approved_rest_day_duration: "00:00",
  approved_holiday_work_minutes: 0,
  approved_holiday_work_duration: "00:00",
  total_approved_overtime_minutes: 60,
  total_approved_overtime_duration: "01:00",
  regular_holiday_work_minutes: 0,
  regular_holiday_work_duration: "00:00",
  special_non_working_holiday_work_minutes: 0,
  special_non_working_holiday_work_duration: "00:00",
  company_holiday_work_minutes: 0,
  company_holiday_work_duration: "00:00",
  generated_at: "2026-07-15T12:00:00+08:00",
  timezone: "Asia/Manila",
} as unknown as EmployeeAttendanceSummaryRow;

const exceptionRow = {
  attendance_date: "2026-07-15",
  employee_number: "EMP-001",
  employee_name: "-Injected Name",
  department_name: "Engineering",
  job_title_name: "Developer",
  employment_status: "active",
  exception_type: "late",
  attendance_status: "present",
  calculation_state: "finalized",
  clock_in: "2026-07-15T00:05:00+08:00",
  clock_out: null,
  worked_minutes: 475,
  worked_duration: "07:55",
  late_minutes: 5,
  late_duration: "00:05",
  undertime_minutes: 0,
  undertime_duration: "00:00",
  is_corrected: false,
  is_recalculated: false,
  attendance_calculation_revision_id: "rev-1",
} as unknown as AttendanceExceptionReportRow;

const overtimeRow = {
  attendance_date: "2026-07-15",
  employee_number: "EMP-001",
  employee_name: "@Injected Name",
  department_name: "Engineering",
  job_title_name: "Developer",
  employment_status: "active",
  segment_type: "post_shift",
  holiday_name: null,
  holiday_type: null,
  detected_start: "2026-07-15T17:00:00+08:00",
  detected_end: null,
  detected_minutes: 60,
  detected_duration: "01:00",
  approved_minutes: 0,
  approved_duration: "00:00",
  approval_status: "approved",
  reviewed_at: null,
  is_active_detection: true,
  is_superseded: false,
  attendance_calculation_revision_id: "rev-1",
  detection_revision_id: "det-1",
  approval_item_id: "approval-1",
} as unknown as OvertimeHolidayReportRow;

for (const [name, csv] of [
  ["daily", dailyCsv([dailyRow])],
  ["employee summary", employeeSummaryCsv([summaryRow])],
  ["exceptions", exceptionsCsv([exceptionRow])],
  ["overtime and holiday", overtimeHolidayCsv([overtimeRow])],
] as const) {
  test(`${name} CSV keeps safe headers and source value semantics`, () => {
    const [headers, row] = csv.split("\r\n");
    assert.ok(headers);
    assert.ok(row);
    assert.doesNotMatch(headers, /approval_note|rejection_reason|recalculation_reason|reviewed_by|policy_change_reason|holiday_replacement_reason/);
    assert.match(row, /'[-+=@]Injected Name/);
    assert.match(row, /(^|,)0(,|$)/);
    assert.match(row, /\d{2}:\d{2}/);
    assert.match(row, /,,/);
  });
}

test("CSV and XLSX column contracts share the same authoritative minute fields", async () => {
  const csvSource = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("./csv.ts", import.meta.url), "utf8"));
  const xlsxSource = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("./xlsx.ts", import.meta.url), "utf8"));
  const minuteFields = [
    "worked_minutes", "late_minutes", "undertime_minutes",
    "pre_shift_approved_minutes", "post_shift_approved_minutes",
    "rest_day_approved_minutes", "holiday_work_approved_minutes",
    "total_approved_overtime_minutes", "approved_pre_shift_minutes",
    "approved_post_shift_minutes", "approved_rest_day_minutes",
    "approved_holiday_work_minutes", "regular_holiday_work_minutes",
    "special_non_working_holiday_work_minutes", "company_holiday_work_minutes",
    "detected_minutes", "approved_minutes",
  ];
  for (const field of minuteFields) {
    const pattern = new RegExp(`"${field}"`);
    assert.match(csvSource, pattern);
    assert.match(xlsxSource, pattern);
  }
});


test("leave CSV exports use the approved public headers", () => {
  assert.deepEqual(leaveBalanceHeaders, [
    "Employee Number", "Employee Name", "Department", "Leave Type", "Leave Year",
    "Allocated Units", "Carryover Units", "Adjustment Units", "Used Units",
    "Pending Units", "Available Units", "Carryover Expires",
  ]);
  assert.deepEqual(leaveUsageHeaders, [
    "Employee Number", "Employee Name", "Department", "Leave Type", "Paid State",
    "Start Date", "End Date", "Duration", "Status", "Requested Units",
    "Chargeable Units", "Submitted At", "Reviewed At",
  ]);
  assert.deepEqual(leaveConflictHeaders, [
    "Employee Number", "Employee Name", "Department", "Leave Type", "Leave Date",
    "Conflict Type", "Conflict Status", "Attendance Status", "Balance Action", "Created At",
  ]);
  assert.match(leaveBalanceCsv([]), /^Employee Number,Employee Name,Department/);
  assert.match(leaveUsageCsv([]), /^Employee Number,Employee Name,Department/);
  assert.match(leaveConflictCsv([]), /^Employee Number,Employee Name,Department/);
});
