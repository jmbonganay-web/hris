import type { HolidayType } from "@/features/overtime/holidays/types";

export const attendanceCalculationBaseStatuses = [
  "present",
  "absent",
  "holiday",
  "paid_leave",
  "unpaid_leave",
  "missing_clock_out",
  "rest_day_worked",
  "unscheduled_attendance",
] as const;

export type AttendanceCalculationBaseStatus =
  (typeof attendanceCalculationBaseStatuses)[number];

export const attendanceCalculationSources = [
  "clock_in",
  "clock_out",
  "hr_create",
  "hr_correction",
  "correction_approval",
  "daily_finalization",
  "manual_recalculation",
  "manual_finalization",
] as const;

export type AttendanceCalculationSource =
  (typeof attendanceCalculationSources)[number];

export type AttendanceCalculationRevision = {
  id: string;
  calculation_group_id: string;
  revision_number: number;
  employee_id: string;
  attendance_date: string;
  attendance_record_id: string | null;
  schedule_assignment_id: string | null;
  schedule_version_id: string | null;
  policy_version_id: string | null;
  holiday_version_id: string | null;
  holiday_name: string | null;
  holiday_type: HolidayType | null;
  is_holiday: boolean;
  base_status: AttendanceCalculationBaseStatus;
  is_provisional: boolean;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  scheduled_minutes: number | null;
  actual_clock_in_at: string | null;
  actual_clock_out_at: string | null;
  worked_minutes: number | null;
  late_minutes: number | null;
  undertime_minutes: number | null;
  is_late: boolean;
  is_undertime: boolean;
  is_corrected: boolean;
  is_recalculated: boolean;
  calculation_source: AttendanceCalculationSource;
  calculated_at: string;
};

export type HrAttendanceCalculationRevision = AttendanceCalculationRevision & {
  calculated_by: string | null;
  recalculation_reason: string | null;
  calculator: {
    id: string;
    display_name: string | null;
    first_name: string;
    last_name: string;
  } | null;
};

export type ActiveAttendanceCalculation = AttendanceCalculationRevision & {
  schedule_name: string | null;
  schedule_code: string | null;
};

export type AttendanceCalculationGroup = {
  id: string;
  employee_id: string;
  attendance_date: string;
  active_revision_id: string | null;
  active_revision: ActiveAttendanceCalculation | null;
};

export type CalculationState = "provisional" | "finalized";

export type AttendanceCalculationFilters = {
  baseStatus?: string;
  late?: boolean;
  undertime?: boolean;
  provisional?: boolean;
  corrected?: boolean;
  recalculated?: boolean;
};

export type RecalculationActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
  values?: {
    scope?: "one_employee" | "all_active";
    employeeId?: string;
    startDate?: string;
    endDate?: string;
  };
};

export type FinalizationRun = {
  id: string;
  target_date: string;
  run_source: "scheduled_job" | "manual";
  status: "running" | "completed" | "completed_with_errors" | "failed";
  started_at: string;
  completed_at: string | null;
  employees_processed: number;
  absences_created: number;
  missing_clock_outs_finalized: number;
  unchanged_results_skipped: number;
  error_count: number;
  started_by: string | null;
  manual_reason: string | null;
};
