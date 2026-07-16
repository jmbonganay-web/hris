import "server-only";

import { createClient } from "@/lib/supabase/server";
import { REPORT_EXPORT_ROW_LIMIT } from "./constants";
import { formatReportDuration, formatReportTimestamp } from "./formatters";
import type {
  AttendanceExceptionReportRow,
  DailyAttendanceReportRow,
  EmployeeAttendanceSummaryRow,
  LeaveBalanceReportRow,
  LeaveConflictReportRow,
  LeaveUsageReportRow,
  OvertimeHolidayReportRow,
  PaginatedReport,
  ReportFilterOptions,
  ReportFilters,
  ReportSummaryMetrics,
} from "./types";

function commonRpcArgs(filters: ReportFilters, exportMode: boolean) {
  return {
    p_mode: filters.mode,
    p_start_date: filters.startDate,
    p_end_date: filters.endDate,
    p_department_id: filters.departmentId,
    p_employee_id: filters.employeeId,
    p_employment_status: filters.employmentStatus,
    p_active_only: filters.activeOnly,
    p_page: filters.page,
    p_page_size: filters.pageSize,
    p_export: exportMode,
  };
}

function reportError(error: { message?: string | null } | null): Error {
  const code = error?.message ?? "REPORT_LOAD_FAILED";
  const messages: Record<string, string> = {
    REPORT_UNAUTHORIZED: "You do not have permission to access attendance reports.",
    REPORT_INVALID_DATE_RANGE: "The selected date range is invalid.",
    REPORT_OPERATIONAL_RANGE_LIMIT: "Operational reports are limited to 31 days.",
    REPORT_PAYROLL_RANGE_LIMIT: "Payroll reports are limited to 366 days.",
    REPORT_FUTURE_DATE: "Future report dates are not allowed.",
    REPORT_ROW_LIMIT: "The report contains more than 25,000 rows. Narrow the selected filters.",
    REPORT_EXPORT_REQUIRES_PAYROLL: "Exports are available in Payroll mode only.",
  };
  return new Error(messages[code] ?? "The report could not be loaded.");
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function nullableTimestamp(value: unknown): string | null {
  const raw = nullableString(value);
  return raw ? formatReportTimestamp(raw) || null : null;
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function requiredNumber(value: unknown): number {
  return Number(value ?? 0);
}

function paginate<T extends { total_count: number }>(
  rows: T[],
  filters: ReportFilters,
): PaginatedReport<T> {
  const total = rows[0]?.total_count ?? 0;
  return {
    rows,
    page: filters.page,
    pageSize: filters.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
  };
}

function mapSummary(row: Record<string, unknown> | undefined): ReportSummaryMetrics {
  const value = row ?? {};
  return {
    employee_day_records: requiredNumber(value.employee_day_records),
    scheduled_days: requiredNumber(value.scheduled_days),
    present_days: requiredNumber(value.present_days),
    absent_days: requiredNumber(value.absent_days),
    holiday_days: requiredNumber(value.holiday_days),
    paid_leave_days: requiredNumber(value.paid_leave_days),
    unpaid_leave_days: requiredNumber(value.unpaid_leave_days),
    missing_clock_out_days: requiredNumber(value.missing_clock_out_days),
    rest_day_worked_days: requiredNumber(value.rest_day_worked_days),
    unscheduled_attendance_days: requiredNumber(value.unscheduled_attendance_days),
    worked_minutes: requiredNumber(value.worked_minutes),
    late_minutes: requiredNumber(value.late_minutes),
    undertime_minutes: requiredNumber(value.undertime_minutes),
    approved_overtime_minutes: requiredNumber(value.approved_overtime_minutes),
    finalized_employee_day_records: requiredNumber(value.finalized_employee_day_records),
    provisional_employee_day_records: requiredNumber(value.provisional_employee_day_records),
    finalized_worked_minutes: requiredNumber(value.finalized_worked_minutes),
    provisional_worked_minutes: requiredNumber(value.provisional_worked_minutes),
  };
}

function mapDaily(row: Record<string, unknown>): DailyAttendanceReportRow {
  const workedMinutes = nullableNumber(row.worked_minutes);
  const lateMinutes = nullableNumber(row.late_minutes);
  const undertimeMinutes = nullableNumber(row.undertime_minutes);
  const totalApproved = requiredNumber(row.total_approved_overtime_minutes);

  return {
    attendance_date: String(row.attendance_date),
    employee_id: String(row.employee_id),
    employee_number: String(row.employee_number),
    employee_name: String(row.employee_name),
    department_id: nullableString(row.department_id),
    department_name: nullableString(row.department_name),
    job_title_id: nullableString(row.job_title_id),
    job_title_name: nullableString(row.job_title_name),
    employment_status: String(row.employment_status),
    attendance_status: row.attendance_status as DailyAttendanceReportRow["attendance_status"],
    calculation_state: row.calculation_state as DailyAttendanceReportRow["calculation_state"],
    is_provisional: Boolean(row.is_provisional),
    is_holiday: Boolean(row.is_holiday),
    holiday_name: nullableString(row.holiday_name),
    holiday_type: row.holiday_type
      ? (String(row.holiday_type) as DailyAttendanceReportRow["holiday_type"])
      : null,
    is_scheduled_day: Boolean(row.is_scheduled_day),
    scheduled_start: nullableTimestamp(row.scheduled_start),
    scheduled_end: nullableTimestamp(row.scheduled_end),
    clock_in: nullableTimestamp(row.clock_in),
    clock_out: nullableTimestamp(row.clock_out),
    worked_minutes: workedMinutes,
    worked_duration: formatReportDuration(workedMinutes),
    late_minutes: lateMinutes,
    late_duration: formatReportDuration(lateMinutes),
    undertime_minutes: undertimeMinutes,
    undertime_duration: formatReportDuration(undertimeMinutes),
    is_late: Boolean(row.is_late),
    is_undertime: Boolean(row.is_undertime),
    is_corrected: Boolean(row.is_corrected),
    is_recalculated: Boolean(row.is_recalculated),
    pre_shift_detected_minutes: nullableNumber(row.pre_shift_detected_minutes),
    pre_shift_approved_minutes: nullableNumber(row.pre_shift_approved_minutes),
    pre_shift_status: row.pre_shift_status
      ? (String(row.pre_shift_status) as DailyAttendanceReportRow["pre_shift_status"])
      : null,
    post_shift_detected_minutes: nullableNumber(row.post_shift_detected_minutes),
    post_shift_approved_minutes: nullableNumber(row.post_shift_approved_minutes),
    post_shift_status: row.post_shift_status
      ? (String(row.post_shift_status) as DailyAttendanceReportRow["post_shift_status"])
      : null,
    rest_day_detected_minutes: nullableNumber(row.rest_day_detected_minutes),
    rest_day_approved_minutes: nullableNumber(row.rest_day_approved_minutes),
    rest_day_status: row.rest_day_status
      ? (String(row.rest_day_status) as DailyAttendanceReportRow["rest_day_status"])
      : null,
    holiday_work_detected_minutes: nullableNumber(row.holiday_work_detected_minutes),
    holiday_work_approved_minutes: nullableNumber(row.holiday_work_approved_minutes),
    holiday_work_status: row.holiday_work_status
      ? (String(row.holiday_work_status) as DailyAttendanceReportRow["holiday_work_status"])
      : null,
    total_approved_overtime_minutes: totalApproved,
    total_approved_overtime_duration: formatReportDuration(totalApproved),
    attendance_record_id: nullableString(row.attendance_record_id),
    attendance_calculation_revision_id: String(row.attendance_calculation_revision_id),
    generated_at: formatReportTimestamp(String(row.generated_at)),
    timezone: "Asia/Manila",
    total_count: requiredNumber(row.total_count),
  };
}

function mapEmployeeSummary(row: Record<string, unknown>): EmployeeAttendanceSummaryRow {
  const minuteFields = [
    "worked_minutes",
    "late_minutes",
    "undertime_minutes",
    "approved_pre_shift_minutes",
    "approved_post_shift_minutes",
    "approved_rest_day_minutes",
    "approved_holiday_work_minutes",
    "total_approved_overtime_minutes",
    "regular_holiday_work_minutes",
    "special_non_working_holiday_work_minutes",
    "company_holiday_work_minutes",
  ] as const;
  const minutes = Object.fromEntries(minuteFields.map((key) => [key, requiredNumber(row[key])])) as Record<(typeof minuteFields)[number], number>;

  return {
    employee_id: String(row.employee_id),
    employee_number: String(row.employee_number),
    employee_name: String(row.employee_name),
    department_id: nullableString(row.department_id),
    department_name: nullableString(row.department_name),
    job_title_id: nullableString(row.job_title_id),
    job_title_name: nullableString(row.job_title_name),
    employment_status: String(row.employment_status),
    report_start_date: String(row.report_start_date),
    report_end_date: String(row.report_end_date),
    employee_day_records: requiredNumber(row.employee_day_records),
    scheduled_days: requiredNumber(row.scheduled_days),
    present_days: requiredNumber(row.present_days),
    absent_days: requiredNumber(row.absent_days),
    holiday_days: requiredNumber(row.holiday_days),
    paid_leave_days: requiredNumber(row.paid_leave_days),
    unpaid_leave_days: requiredNumber(row.unpaid_leave_days),
    missing_clock_out_days: requiredNumber(row.missing_clock_out_days),
    rest_day_worked_days: requiredNumber(row.rest_day_worked_days),
    unscheduled_attendance_days: requiredNumber(row.unscheduled_attendance_days),
    finalized_days: requiredNumber(row.finalized_days),
    provisional_days: requiredNumber(row.provisional_days),
    worked_minutes: minutes.worked_minutes,
    worked_duration: formatReportDuration(minutes.worked_minutes),
    late_minutes: minutes.late_minutes,
    late_duration: formatReportDuration(minutes.late_minutes),
    undertime_minutes: minutes.undertime_minutes,
    undertime_duration: formatReportDuration(minutes.undertime_minutes),
    approved_pre_shift_minutes: minutes.approved_pre_shift_minutes,
    approved_pre_shift_duration: formatReportDuration(minutes.approved_pre_shift_minutes),
    approved_post_shift_minutes: minutes.approved_post_shift_minutes,
    approved_post_shift_duration: formatReportDuration(minutes.approved_post_shift_minutes),
    approved_rest_day_minutes: minutes.approved_rest_day_minutes,
    approved_rest_day_duration: formatReportDuration(minutes.approved_rest_day_minutes),
    approved_holiday_work_minutes: minutes.approved_holiday_work_minutes,
    approved_holiday_work_duration: formatReportDuration(minutes.approved_holiday_work_minutes),
    total_approved_overtime_minutes: minutes.total_approved_overtime_minutes,
    total_approved_overtime_duration: formatReportDuration(minutes.total_approved_overtime_minutes),
    regular_holiday_work_minutes: minutes.regular_holiday_work_minutes,
    regular_holiday_work_duration: formatReportDuration(minutes.regular_holiday_work_minutes),
    special_non_working_holiday_work_minutes: minutes.special_non_working_holiday_work_minutes,
    special_non_working_holiday_work_duration: formatReportDuration(minutes.special_non_working_holiday_work_minutes),
    company_holiday_work_minutes: minutes.company_holiday_work_minutes,
    company_holiday_work_duration: formatReportDuration(minutes.company_holiday_work_minutes),
    generated_at: formatReportTimestamp(String(row.generated_at)),
    timezone: "Asia/Manila",
    total_count: requiredNumber(row.total_count),
  };
}

function mapException(row: Record<string, unknown>): AttendanceExceptionReportRow {
  const workedMinutes = nullableNumber(row.worked_minutes);
  const lateMinutes = nullableNumber(row.late_minutes);
  const undertimeMinutes = nullableNumber(row.undertime_minutes);
  return {
    attendance_date: String(row.attendance_date),
    employee_id: String(row.employee_id),
    employee_number: String(row.employee_number),
    employee_name: String(row.employee_name),
    department_id: nullableString(row.department_id),
    department_name: nullableString(row.department_name),
    job_title_id: nullableString(row.job_title_id),
    job_title_name: nullableString(row.job_title_name),
    employment_status: String(row.employment_status),
    exception_type: row.exception_type as AttendanceExceptionReportRow["exception_type"],
    attendance_status: row.attendance_status as AttendanceExceptionReportRow["attendance_status"],
    calculation_state: row.calculation_state as AttendanceExceptionReportRow["calculation_state"],
    clock_in: nullableTimestamp(row.clock_in),
    clock_out: nullableTimestamp(row.clock_out),
    worked_minutes: workedMinutes,
    worked_duration: formatReportDuration(workedMinutes),
    late_minutes: lateMinutes,
    late_duration: formatReportDuration(lateMinutes),
    undertime_minutes: undertimeMinutes,
    undertime_duration: formatReportDuration(undertimeMinutes),
    is_corrected: Boolean(row.is_corrected),
    is_recalculated: Boolean(row.is_recalculated),
    attendance_calculation_revision_id: String(row.attendance_calculation_revision_id),
    total_count: requiredNumber(row.total_count),
  };
}

function mapOvertime(row: Record<string, unknown>): OvertimeHolidayReportRow {
  const detectedMinutes = requiredNumber(row.detected_minutes);
  const approvedMinutes = requiredNumber(row.approved_minutes);
  return {
    attendance_date: String(row.attendance_date),
    employee_id: String(row.employee_id),
    employee_number: String(row.employee_number),
    employee_name: String(row.employee_name),
    department_id: nullableString(row.department_id),
    department_name: nullableString(row.department_name),
    job_title_id: nullableString(row.job_title_id),
    job_title_name: nullableString(row.job_title_name),
    employment_status: String(row.employment_status),
    segment_type: row.segment_type as OvertimeHolidayReportRow["segment_type"],
    holiday_name: nullableString(row.holiday_name),
    holiday_type: row.holiday_type
      ? (String(row.holiday_type) as OvertimeHolidayReportRow["holiday_type"])
      : null,
    detected_start: nullableTimestamp(row.detected_start),
    detected_end: nullableTimestamp(row.detected_end),
    detected_minutes: detectedMinutes,
    detected_duration: formatReportDuration(detectedMinutes),
    approved_minutes: approvedMinutes,
    approved_duration: formatReportDuration(approvedMinutes),
    approval_status: row.approval_status
      ? (String(row.approval_status) as OvertimeHolidayReportRow["approval_status"])
      : null,
    reviewed_at: nullableTimestamp(row.reviewed_at),
    is_active_detection: Boolean(row.is_active_detection),
    is_superseded: Boolean(row.is_superseded),
    attendance_calculation_revision_id: String(row.attendance_calculation_revision_id),
    detection_revision_id: String(row.detection_revision_id),
    approval_item_id: nullableString(row.approval_item_id),
    total_count: requiredNumber(row.total_count),
  };
}

function mapLeaveBalance(row: Record<string, unknown>): LeaveBalanceReportRow {
  return {
    employee_id: String(row.employee_id),
    employee_number: String(row.employee_number),
    employee_name: String(row.employee_name),
    department_id: nullableString(row.department_id),
    department_name: nullableString(row.department_name),
    leave_type_id: String(row.leave_type_id),
    leave_type_name: String(row.leave_type_name),
    leave_year: requiredNumber(row.leave_year),
    allocated_units: requiredNumber(row.allocated_units),
    carryover_units: requiredNumber(row.carryover_units),
    adjustment_units: requiredNumber(row.adjustment_units),
    used_units: requiredNumber(row.used_units),
    pending_units: requiredNumber(row.pending_units),
    available_units: requiredNumber(row.available_units),
    carryover_expires: nullableString(row.carryover_expires),
    total_count: requiredNumber(row.total_count),
  };
}

function mapLeaveUsage(row: Record<string, unknown>): LeaveUsageReportRow {
  return {
    request_group_id: String(row.request_group_id),
    employee_id: String(row.employee_id),
    employee_number: String(row.employee_number),
    employee_name: String(row.employee_name),
    department_id: nullableString(row.department_id),
    department_name: nullableString(row.department_name),
    leave_type_id: String(row.leave_type_id),
    leave_type_name: String(row.leave_type_name),
    paid_state: row.paid_state as LeaveUsageReportRow["paid_state"],
    start_date: String(row.start_date),
    end_date: String(row.end_date),
    duration_mode: row.duration_mode as LeaveUsageReportRow["duration_mode"],
    status: row.status as LeaveUsageReportRow["status"],
    requested_units: requiredNumber(row.requested_units),
    chargeable_units: requiredNumber(row.chargeable_units),
    submitted_at: nullableTimestamp(row.submitted_at),
    reviewed_at: nullableTimestamp(row.reviewed_at),
    total_count: requiredNumber(row.total_count),
  };
}

function mapLeaveConflict(row: Record<string, unknown>): LeaveConflictReportRow {
  return {
    conflict_id: String(row.conflict_id),
    employee_id: String(row.employee_id),
    employee_number: String(row.employee_number),
    employee_name: String(row.employee_name),
    department_id: nullableString(row.department_id),
    department_name: nullableString(row.department_name),
    leave_type_id: String(row.leave_type_id),
    leave_type_name: String(row.leave_type_name),
    leave_date: String(row.leave_date),
    conflict_type: row.conflict_type as LeaveConflictReportRow["conflict_type"],
    conflict_status: row.conflict_status as LeaveConflictReportRow["conflict_status"],
    attendance_status: nullableString(row.attendance_status),
    balance_action: nullableString(row.balance_action),
    created_at: formatReportTimestamp(String(row.created_at)),
    total_count: requiredNumber(row.total_count),
  };
}

function leavePaginationArgs(filters: ReportFilters, exportMode: boolean) {
  return {
    p_offset: exportMode ? 0 : (filters.page - 1) * filters.pageSize,
    p_limit: exportMode ? REPORT_EXPORT_ROW_LIMIT : filters.pageSize,
  };
}

function enforceLeaveExportLimit<T extends { total_count: number }>(rows: T[], exportMode: boolean): void {
  if (exportMode && (rows[0]?.total_count ?? 0) > REPORT_EXPORT_ROW_LIMIT) {
    throw reportError({ message: "REPORT_ROW_LIMIT" });
  }
}

export async function getReportFilterOptions(): Promise<ReportFilterOptions> {
  const supabase = await createClient();
  const [
    { data: departments, error: departmentError },
    { data: employees, error: employeeError },
    { data: leaveTypes, error: leaveTypeError },
  ] = await Promise.all([
    supabase.from("departments").select("id,name").order("name"),
    supabase
      .from("employees")
      .select("id,employee_number,first_name,last_name,employment_status")
      .order("employee_number"),
    supabase
      .from("leave_types")
      .select("id,code,versions:leave_type_versions(name,effective_from,revision_number)"),
  ]);
  if (departmentError || employeeError || leaveTypeError) {
    throw new Error("The report filters could not be loaded.");
  }
  return {
    departments: departments ?? [],
    leaveTypes: (leaveTypes ?? [])
      .map((item: {
        id: string;
        code: string;
        versions: Array<{ name: string; effective_from: string; revision_number: number }> | null;
      }) => {
        const latest = [...(item.versions ?? [])].sort(
          (a, b) => b.effective_from.localeCompare(a.effective_from)
            || b.revision_number - a.revision_number,
        )[0];
        return { id: item.id, name: latest?.name ?? item.code };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
    employees: employees ?? [],
  };
}

export async function getReportSummary(
  filters: ReportFilters,
): Promise<ReportSummaryMetrics> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_attendance_report_summary", {
    p_mode: filters.mode,
    p_start_date: filters.startDate,
    p_end_date: filters.endDate,
    p_department_id: filters.departmentId,
    p_employee_id: filters.employeeId,
    p_employment_status: filters.employmentStatus,
    p_active_only: filters.activeOnly,
  });
  if (error) throw reportError(error);
  return mapSummary((data?.[0] ?? undefined) as Record<string, unknown> | undefined);
}

export async function getDailyAttendanceReport(
  filters: ReportFilters,
  exportMode = false,
): Promise<PaginatedReport<DailyAttendanceReportRow>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_attendance_daily_report", {
    ...commonRpcArgs(filters, exportMode),
    p_attendance_status: filters.attendanceStatus,
    p_calculation_state: filters.calculationState,
  });
  if (error) throw reportError(error);
  return paginate((data ?? []).map((row: unknown) => mapDaily(row as Record<string, unknown>)), filters);
}

export async function getEmployeeAttendanceSummary(
  filters: ReportFilters,
  exportMode = false,
): Promise<PaginatedReport<EmployeeAttendanceSummaryRow>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_employee_attendance_summary", {
    ...commonRpcArgs(filters, exportMode),
    p_include_employees_without_records: filters.includeEmployeesWithoutRecords,
  });
  if (error) throw reportError(error);
  return paginate((data ?? []).map((row: unknown) => mapEmployeeSummary(row as Record<string, unknown>)), filters);
}

export async function getAttendanceExceptionReport(
  filters: ReportFilters,
  exportMode = false,
): Promise<PaginatedReport<AttendanceExceptionReportRow>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_attendance_exception_report", {
    ...commonRpcArgs(filters, exportMode),
    p_exception_type: filters.exceptionType,
  });
  if (error) throw reportError(error);
  return paginate((data ?? []).map((row: unknown) => mapException(row as Record<string, unknown>)), filters);
}

export async function getOvertimeHolidayReport(
  filters: ReportFilters,
  exportMode = false,
): Promise<PaginatedReport<OvertimeHolidayReportRow>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_overtime_holiday_report", {
    ...commonRpcArgs(filters, exportMode),
    p_segment_type: filters.segmentType,
    p_approval_status: filters.approvalStatus,
    p_holiday_type: filters.holidayType,
  });
  if (error) throw reportError(error);
  return paginate((data ?? []).map((row: unknown) => mapOvertime(row as Record<string, unknown>)), filters);
}


export async function getLeaveBalanceReport(
  filters: ReportFilters,
  exportMode = false,
): Promise<PaginatedReport<LeaveBalanceReportRow>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_leave_balance_report", {
    p_leave_year: Number(filters.endDate.slice(0, 4)),
    p_department_id: filters.departmentId,
    p_employee_id: filters.employeeId,
    p_leave_type_id: filters.leaveTypeId,
    ...leavePaginationArgs(filters, exportMode),
  });
  if (error) throw reportError(error);
  const rows = (data ?? []).map((row: unknown) => mapLeaveBalance(row as Record<string, unknown>));
  enforceLeaveExportLimit(rows, exportMode);
  return paginate(rows, filters);
}

export async function getLeaveUsageReport(
  filters: ReportFilters,
  exportMode = false,
): Promise<PaginatedReport<LeaveUsageReportRow>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_leave_usage_report", {
    p_start_date: filters.startDate,
    p_end_date: filters.endDate,
    p_department_id: filters.departmentId,
    p_employee_id: filters.employeeId,
    p_leave_type_id: filters.leaveTypeId,
    p_status: filters.leaveStatus,
    p_paid_state: filters.leavePaidState,
    ...leavePaginationArgs(filters, exportMode),
  });
  if (error) throw reportError(error);
  const rows = (data ?? []).map((row: unknown) => mapLeaveUsage(row as Record<string, unknown>));
  enforceLeaveExportLimit(rows, exportMode);
  return paginate(rows, filters);
}

export async function getLeaveConflictReport(
  filters: ReportFilters,
  exportMode = false,
): Promise<PaginatedReport<LeaveConflictReportRow>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_leave_conflict_report", {
    p_start_date: filters.startDate,
    p_end_date: filters.endDate,
    p_department_id: filters.departmentId,
    p_employee_id: filters.employeeId,
    p_conflict_type: filters.leaveConflictType,
    p_conflict_status: filters.leaveConflictStatus,
    ...leavePaginationArgs(filters, exportMode),
  });
  if (error) throw reportError(error);
  const rows = (data ?? []).map((row: unknown) => mapLeaveConflict(row as Record<string, unknown>));
  enforceLeaveExportLimit(rows, exportMode);
  return paginate(rows, filters);
}
