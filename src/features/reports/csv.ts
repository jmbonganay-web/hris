import type {
  AttendanceExceptionReportRow,
  DailyAttendanceReportRow,
  EmployeeAttendanceSummaryRow,
  LeaveBalanceReportRow,
  LeaveConflictReportRow,
  LeaveUsageReportRow,
  OvertimeHolidayReportRow,
  ReportExportDataset,
} from "./types.ts";

type CsvValue = string | number | boolean | null;

function safeText(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvCell(value: CsvValue): string {
  if (value === null) return "";
  const raw = typeof value === "string" ? safeText(value) : String(value);
  return /[",\r\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
}

export function buildReportCsv(headers: string[], rows: CsvValue[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function csvFilename(dataset: ReportExportDataset, startDate: string, endDate: string): string {
  const prefix: Record<ReportExportDataset, string> = {
    daily: "attendance-daily",
    employee_summary: "attendance-employee-summary",
    exceptions: "attendance-exceptions",
    overtime_holiday: "overtime-holiday-work",
    leave_balances: "leave-balances",
    leave_usage: "leave-usage",
    leave_conflicts: "leave-conflicts",
  };
  return dataset.startsWith("leave_")
    ? `${prefix[dataset]}-${endDate}.csv`
    : `${prefix[dataset]}-${startDate}-to-${endDate}.csv`;
}

function values<T extends object>(headers: readonly string[], row: T): CsvValue[] {
  return headers.map((key) => row[key as keyof T] as CsvValue);
}

export function dailyCsv(rows: DailyAttendanceReportRow[]): string {
  const headers = [
    "attendance_date", "employee_number", "employee_name", "department_name",
    "job_title_name", "employment_status", "attendance_status", "calculation_state",
    "is_holiday", "holiday_name", "holiday_type", "is_scheduled_day",
    "scheduled_start", "scheduled_end", "clock_in", "clock_out",
    "worked_minutes", "worked_duration", "late_minutes", "late_duration",
    "undertime_minutes", "undertime_duration", "pre_shift_detected_minutes",
    "pre_shift_approved_minutes", "pre_shift_status", "post_shift_detected_minutes",
    "post_shift_approved_minutes", "post_shift_status", "rest_day_detected_minutes",
    "rest_day_approved_minutes", "rest_day_status", "holiday_work_detected_minutes",
    "holiday_work_approved_minutes", "holiday_work_status",
    "total_approved_overtime_minutes", "total_approved_overtime_duration",
    "attendance_calculation_revision_id", "generated_at", "timezone",
  ] as const;
  return buildReportCsv([...headers], rows.map((row) => values(headers, row)));
}

export function employeeSummaryCsv(rows: EmployeeAttendanceSummaryRow[]): string {
  const headers = [
    "employee_number", "employee_name", "department_name", "job_title_name",
    "employment_status", "report_start_date", "report_end_date", "employee_day_records",
    "scheduled_days", "present_days", "absent_days", "holiday_days", "paid_leave_days",
    "unpaid_leave_days", "missing_clock_out_days", "rest_day_worked_days",
    "unscheduled_attendance_days", "finalized_days", "provisional_days", "worked_minutes",
    "worked_duration", "late_minutes", "late_duration", "undertime_minutes", "undertime_duration",
    "approved_pre_shift_minutes", "approved_pre_shift_duration",
    "approved_post_shift_minutes", "approved_post_shift_duration",
    "approved_rest_day_minutes", "approved_rest_day_duration",
    "approved_holiday_work_minutes", "approved_holiday_work_duration",
    "total_approved_overtime_minutes", "total_approved_overtime_duration",
    "regular_holiday_work_minutes", "regular_holiday_work_duration",
    "special_non_working_holiday_work_minutes", "special_non_working_holiday_work_duration",
    "company_holiday_work_minutes", "company_holiday_work_duration", "generated_at", "timezone",
  ] as const;
  return buildReportCsv([...headers], rows.map((row) => values(headers, row)));
}

export function exceptionsCsv(rows: AttendanceExceptionReportRow[]): string {
  const headers = [
    "attendance_date", "employee_number", "employee_name", "department_name",
    "job_title_name", "employment_status", "exception_type", "attendance_status",
    "calculation_state", "clock_in", "clock_out", "worked_minutes", "worked_duration",
    "late_minutes", "late_duration", "undertime_minutes", "undertime_duration",
    "is_corrected", "is_recalculated", "attendance_calculation_revision_id",
  ] as const;
  return buildReportCsv([...headers], rows.map((row) => values(headers, row)));
}

export function overtimeHolidayCsv(rows: OvertimeHolidayReportRow[]): string {
  const headers = [
    "attendance_date", "employee_number", "employee_name", "department_name",
    "job_title_name", "employment_status", "segment_type", "holiday_name",
    "holiday_type", "detected_start", "detected_end", "detected_minutes",
    "detected_duration", "approved_minutes", "approved_duration", "approval_status",
    "reviewed_at", "is_active_detection", "is_superseded",
    "attendance_calculation_revision_id", "detection_revision_id", "approval_item_id",
  ] as const;
  return buildReportCsv([...headers], rows.map((row) => values(headers, row)));
}

export const leaveBalanceHeaders = [
  "Employee Number", "Employee Name", "Department", "Leave Type", "Leave Year",
  "Allocated Units", "Carryover Units", "Adjustment Units", "Used Units",
  "Pending Units", "Available Units", "Carryover Expires",
] as const;

export const leaveUsageHeaders = [
  "Employee Number", "Employee Name", "Department", "Leave Type", "Paid State",
  "Start Date", "End Date", "Duration", "Status", "Requested Units",
  "Chargeable Units", "Submitted At", "Reviewed At",
] as const;

export const leaveConflictHeaders = [
  "Employee Number", "Employee Name", "Department", "Leave Type", "Leave Date",
  "Conflict Type", "Conflict Status", "Attendance Status", "Balance Action", "Created At",
] as const;

export function leaveBalanceCsv(rows: LeaveBalanceReportRow[]): string {
  return buildReportCsv([...leaveBalanceHeaders], rows.map((row) => [
    row.employee_number, row.employee_name, row.department_name, row.leave_type_name,
    row.leave_year, row.allocated_units, row.carryover_units, row.adjustment_units,
    row.used_units, row.pending_units, row.available_units, row.carryover_expires,
  ]));
}

export function leaveUsageCsv(rows: LeaveUsageReportRow[]): string {
  return buildReportCsv([...leaveUsageHeaders], rows.map((row) => [
    row.employee_number, row.employee_name, row.department_name, row.leave_type_name,
    row.paid_state, row.start_date, row.end_date, row.duration_mode, row.status,
    row.requested_units, row.chargeable_units, row.submitted_at, row.reviewed_at,
  ]));
}

export function leaveConflictCsv(rows: LeaveConflictReportRow[]): string {
  return buildReportCsv([...leaveConflictHeaders], rows.map((row) => [
    row.employee_number, row.employee_name, row.department_name, row.leave_type_name,
    row.leave_date, row.conflict_type, row.conflict_status, row.attendance_status,
    row.balance_action, row.created_at,
  ]));
}
