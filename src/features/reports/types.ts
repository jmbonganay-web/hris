import type { AttendanceCalculationBaseStatus } from "@/features/attendance/calculations/types";
import type { HolidayType } from "@/features/overtime/holidays/types";
import type {
  OvertimeApprovalStatus,
  OvertimeSegmentType,
} from "@/features/overtime/types";

export type ReportMode = "operational" | "payroll";
export type ReportTab = "summary" | "daily" | "exceptions" | "overtime" | "exports";
export type ReportCalculationState = "finalized" | "provisional";
export type ReportPageSize = 25 | 50 | 100;
export type ReportExportDataset =
  | "daily"
  | "employee_summary"
  | "exceptions"
  | "overtime_holiday";
export type ReportExportFormat = "csv" | "xlsx";
export type AttendanceExceptionType =
  | "absent"
  | "missing_clock_out"
  | "provisional_or_incomplete"
  | "unscheduled_attendance"
  | "late"
  | "undertime";

export type ReportFilters = {
  mode: ReportMode;
  tab: ReportTab;
  startDate: string;
  endDate: string;
  departmentId: string | null;
  employeeId: string | null;
  employmentStatus: string | null;
  activeOnly: boolean;
  includeEmployeesWithoutRecords: boolean;
  attendanceStatus: AttendanceCalculationBaseStatus | null;
  calculationState: ReportCalculationState | null;
  exceptionType: AttendanceExceptionType | null;
  segmentType: OvertimeSegmentType | null;
  approvalStatus: OvertimeApprovalStatus | null;
  holidayType: HolidayType | null;
  page: number;
  pageSize: ReportPageSize;
};

export type ReportSummaryMetrics = {
  employee_day_records: number;
  scheduled_days: number;
  present_days: number;
  absent_days: number;
  holiday_days: number;
  missing_clock_out_days: number;
  rest_day_worked_days: number;
  unscheduled_attendance_days: number;
  worked_minutes: number;
  late_minutes: number;
  undertime_minutes: number;
  approved_overtime_minutes: number;
  finalized_employee_day_records: number;
  provisional_employee_day_records: number;
  finalized_worked_minutes: number;
  provisional_worked_minutes: number;
};

export type DailyAttendanceReportRow = {
  attendance_date: string;
  employee_id: string;
  employee_number: string;
  employee_name: string;
  department_id: string | null;
  department_name: string | null;
  job_title_id: string | null;
  job_title_name: string | null;
  employment_status: string;
  attendance_status: AttendanceCalculationBaseStatus;
  calculation_state: ReportCalculationState;
  is_provisional: boolean;
  is_holiday: boolean;
  holiday_name: string | null;
  holiday_type: HolidayType | null;
  is_scheduled_day: boolean;
  scheduled_start: string | null;
  scheduled_end: string | null;
  clock_in: string | null;
  clock_out: string | null;
  worked_minutes: number | null;
  worked_duration: string;
  late_minutes: number | null;
  late_duration: string;
  undertime_minutes: number | null;
  undertime_duration: string;
  is_late: boolean;
  is_undertime: boolean;
  is_corrected: boolean;
  is_recalculated: boolean;
  pre_shift_detected_minutes: number | null;
  pre_shift_approved_minutes: number | null;
  pre_shift_status: OvertimeApprovalStatus | null;
  post_shift_detected_minutes: number | null;
  post_shift_approved_minutes: number | null;
  post_shift_status: OvertimeApprovalStatus | null;
  rest_day_detected_minutes: number | null;
  rest_day_approved_minutes: number | null;
  rest_day_status: OvertimeApprovalStatus | null;
  holiday_work_detected_minutes: number | null;
  holiday_work_approved_minutes: number | null;
  holiday_work_status: OvertimeApprovalStatus | null;
  total_approved_overtime_minutes: number;
  total_approved_overtime_duration: string;
  attendance_record_id: string | null;
  attendance_calculation_revision_id: string;
  generated_at: string;
  timezone: "Asia/Manila";
  total_count: number;
};

export type EmployeeAttendanceSummaryRow = {
  employee_id: string;
  employee_number: string;
  employee_name: string;
  department_id: string | null;
  department_name: string | null;
  job_title_id: string | null;
  job_title_name: string | null;
  employment_status: string;
  report_start_date: string;
  report_end_date: string;
  employee_day_records: number;
  scheduled_days: number;
  present_days: number;
  absent_days: number;
  holiday_days: number;
  missing_clock_out_days: number;
  rest_day_worked_days: number;
  unscheduled_attendance_days: number;
  finalized_days: number;
  provisional_days: number;
  worked_minutes: number;
  worked_duration: string;
  late_minutes: number;
  late_duration: string;
  undertime_minutes: number;
  undertime_duration: string;
  approved_pre_shift_minutes: number;
  approved_pre_shift_duration: string;
  approved_post_shift_minutes: number;
  approved_post_shift_duration: string;
  approved_rest_day_minutes: number;
  approved_rest_day_duration: string;
  approved_holiday_work_minutes: number;
  approved_holiday_work_duration: string;
  total_approved_overtime_minutes: number;
  total_approved_overtime_duration: string;
  regular_holiday_work_minutes: number;
  regular_holiday_work_duration: string;
  special_non_working_holiday_work_minutes: number;
  special_non_working_holiday_work_duration: string;
  company_holiday_work_minutes: number;
  company_holiday_work_duration: string;
  generated_at: string;
  timezone: "Asia/Manila";
  total_count: number;
};

export type AttendanceExceptionReportRow = {
  attendance_date: string;
  employee_id: string;
  employee_number: string;
  employee_name: string;
  department_id: string | null;
  department_name: string | null;
  job_title_id: string | null;
  job_title_name: string | null;
  employment_status: string;
  exception_type: AttendanceExceptionType;
  attendance_status: AttendanceCalculationBaseStatus;
  calculation_state: ReportCalculationState;
  clock_in: string | null;
  clock_out: string | null;
  worked_minutes: number | null;
  worked_duration: string;
  late_minutes: number | null;
  late_duration: string;
  undertime_minutes: number | null;
  undertime_duration: string;
  is_corrected: boolean;
  is_recalculated: boolean;
  attendance_calculation_revision_id: string;
  total_count: number;
};

export type OvertimeHolidayReportRow = {
  attendance_date: string;
  employee_id: string;
  employee_number: string;
  employee_name: string;
  department_id: string | null;
  department_name: string | null;
  job_title_id: string | null;
  job_title_name: string | null;
  employment_status: string;
  segment_type: OvertimeSegmentType;
  holiday_name: string | null;
  holiday_type: HolidayType | null;
  detected_start: string | null;
  detected_end: string | null;
  detected_minutes: number;
  detected_duration: string;
  approved_minutes: number;
  approved_duration: string;
  approval_status: OvertimeApprovalStatus | null;
  reviewed_at: string | null;
  is_active_detection: boolean;
  is_superseded: boolean;
  attendance_calculation_revision_id: string;
  detection_revision_id: string;
  approval_item_id: string | null;
  total_count: number;
};

export type PaginatedReport<T> = {
  rows: T[];
  page: number;
  pageSize: ReportPageSize;
  total: number;
  totalPages: number;
};

export type ReportFilterOptions = {
  departments: Array<{ id: string; name: string }>;
  employees: Array<{
    id: string;
    employee_number: string;
    first_name: string;
    last_name: string;
    employment_status: string;
  }>;
};
