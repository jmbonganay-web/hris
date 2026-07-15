export const overtimeSegmentTypes = [
  "pre_shift",
  "post_shift",
  "rest_day",
  "holiday_work",
] as const;

export type OvertimeSegmentType = (typeof overtimeSegmentTypes)[number];

export const overtimeApprovalStatuses = [
  "pending",
  "approved",
  "rejected",
  "superseded",
] as const;

export type OvertimeApprovalStatus =
  (typeof overtimeApprovalStatuses)[number];

export const overtimeCalculationSources = [
  "clock_in",
  "clock_out",
  "hr_create",
  "hr_correction",
  "correction_approval",
  "daily_finalization",
  "manual_recalculation",
  "manual_finalization",
  "overtime_recalculation",
] as const;

export type OvertimeCalculationSource =
  (typeof overtimeCalculationSources)[number];

export type OvertimeDetectionRevision = {
  id: string;
  detection_group_id: string;
  revision_number: number;
  attendance_calculation_revision_id: string;
  attendance_record_id: string | null;
  schedule_assignment_id: string | null;
  schedule_version_id: string | null;
  overtime_policy_version_id: string | null;
  holiday_version_id: string | null;
  segment_type: OvertimeSegmentType;
  detected_start_at: string | null;
  detected_end_at: string | null;
  detected_minutes: number;
  meets_threshold: boolean;
  is_active: boolean;
  calculation_source: OvertimeCalculationSource;
  calculated_by: string | null;
  calculated_at: string;
  recalculation_reason: string | null;
};

export type OvertimeApprovalItem = {
  id: string;
  detection_revision_id: string;
  status: OvertimeApprovalStatus;
  detected_minutes: number;
  approved_minutes: number;
  reviewed_by: string | null;
  reviewed_at: string | null;
  approval_note: string | null;
  rejection_reason: string | null;
  created_at: string;
  superseded_at: string | null;
  superseded_by_item_id: string | null;
};

export type SafeEmployeeOvertimeItem = {
  attendance_date: string;
  segment_type: OvertimeSegmentType;
  detected_minutes: number;
  approved_minutes: number;
  status: OvertimeApprovalStatus;
  approval_date: string | null;
  holiday_name: string | null;
  holiday_type: import("./holidays/types").HolidayType | null;
  is_active: boolean;
  created_at: string;
};

export type AttendanceOvertimeSummary = Pick<
  SafeEmployeeOvertimeItem,
  | "attendance_date"
  | "segment_type"
  | "detected_minutes"
  | "approved_minutes"
  | "status"
  | "holiday_name"
  | "holiday_type"
  | "is_active"
>;

export type OvertimeApprovalQueueRow = {
  id: string;
  status: OvertimeApprovalStatus;
  detected_minutes: number;
  approved_minutes: number;
  reviewed_at: string | null;
  created_at: string;
  superseded_at: string | null;
  employee: {
    id: string;
    employee_number: string;
    first_name: string;
    last_name: string;
    department_id: string | null;
    department: { id: string; name: string } | null;
  };
  attendance_date: string;
  segment_type: OvertimeSegmentType;
  detected_start_at: string | null;
  detected_end_at: string | null;
  detection_revision_id: string;
  detection_revision_number: number;
  detection_is_active: boolean;
  holiday_name: string | null;
  holiday_type: import("./holidays/types").HolidayType | null;
};

export type OvertimeQueueMetrics = {
  pendingItems: number;
  approvedItems: number;
  rejectedItems: number;
  supersededItems: number;
  totalDetectedMinutes: number;
  totalActiveApprovedMinutes: number;
};

export type OvertimeApprovalDetail = OvertimeApprovalQueueRow & {
  attendance_calculation_revision_id: string;
  attendance_record_id: string | null;
  schedule_assignment_id: string | null;
  schedule_version_id: string | null;
  overtime_policy_version_id: string | null;
  holiday_version_id: string | null;
  calculation_source: OvertimeCalculationSource;
  calculated_at: string;
  reviewer: {
    id: string;
    display_name: string | null;
    first_name: string;
    last_name: string;
  } | null;
  approval_note: string | null;
  rejection_reason: string | null;
  priorItems: OvertimeApprovalQueueRow[];
};

export type OvertimeReviewActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

export type OvertimeRecalculationActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: {
    scope?: "one_employee" | "all_active";
    employeeId?: string;
    startDate?: string;
    endDate?: string;
  };
};

export type PaginatedEmployeeOvertime = {
  items: SafeEmployeeOvertimeItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type PaginatedOvertimeQueue = {
  items: OvertimeApprovalQueueRow[];
  metrics: OvertimeQueueMetrics;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
