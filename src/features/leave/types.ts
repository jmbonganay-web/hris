export const leaveDurationModes = ["full_day", "first_half", "second_half"] as const;
export type LeaveDurationMode = (typeof leaveDurationModes)[number];

export const leaveRequestStatuses = [
  "draft", "pending", "approved", "rejected", "withdrawn", "cancelled", "superseded",
] as const;
export type LeaveRequestStatus = (typeof leaveRequestStatuses)[number];

export const leaveClassifications = [
  "paid_leave",
  "unpaid_leave",
  "non_chargeable_holiday",
  "non_chargeable_rest_day",
  "non_chargeable_no_schedule",
  "attendance_precedence",
] as const;
export type LeaveClassification = (typeof leaveClassifications)[number];

export const leaveConflictTypes = [
  "full_day_completed_attendance",
  "full_day_incomplete_attendance",
  "half_day_covered_time_overlap",
  "schedule_recalculation_failed",
  "holiday_recalculation_failed",
  "insufficient_balance_after_recalculation",
] as const;
export type LeaveConflictType = (typeof leaveConflictTypes)[number];

export type LeaveUnit = 0 | 0.5 | 1;
export type LeaveCreatedSource = "employee" | "hr";
export type LeaveReviewDecision = "approve" | "reject";
export type LeaveConflictStatus = "open" | "resolved" | "superseded";
export type LeaveLedgerEntryType =
  | "annual_allocation"
  | "carryover"
  | "hr_adjustment_credit"
  | "hr_adjustment_debit"
  | "approved_leave_charge"
  | "cancellation_restoration"
  | "attendance_conflict_release"
  | "recalculation_charge"
  | "recalculation_release";

export type LeaveActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
  data?: unknown;
};

export type LeaveTypeVersion = {
  id: string;
  leave_type_id: string;
  revision_number: number;
  effective_from: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_paid: boolean;
  is_balance_tracked: boolean;
  default_annual_units: number;
  carryover_enabled: boolean;
  carryover_cap_units: number | null;
  employee_note_required: boolean;
  document_required: boolean;
  document_required_min_units: number | null;
  created_by: string;
  created_at: string;
  change_reason: string | null;
};

export type LeaveTypeSummary = {
  id: string;
  code: string;
  current: LeaveTypeVersion | null;
  upcoming: LeaveTypeVersion[];
  history: LeaveTypeVersion[];
};

export type LeaveDayPreview = {
  leave_date: string;
  schedule_assignment_id: string | null;
  schedule_version_id: string | null;
  holiday_version_id: string | null;
  is_scheduled_workday: boolean;
  is_rest_day: boolean;
  is_holiday: boolean;
  is_chargeable: boolean;
  chargeable_units: LeaveUnit;
  leave_classification: LeaveClassification;
  half_day_boundary_at: string | null;
};

export type LeaveDraftPreview = {
  policyVersion: LeaveTypeVersion;
  days: LeaveDayPreview[];
  requestedUnits: number;
  chargeableUnits: number;
  ledgerBalance: number | null;
  pendingReservedUnits: number;
  availableUnits: number | null;
  requiresDocument: boolean;
};

export type LeaveAttachment = {
  id: string;
  requestGroupId: string;
  requestRevisionId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  frozenAt: string | null;
};

export type LeaveRequestSummary = {
  request_group_id: string;
  request_revision_id: string;
  employee_id: string;
  employee_name: string;
  employee_number: string;
  department_name: string | null;
  leave_type_id: string;
  leave_type_code: string;
  leave_type_name: string;
  leave_type_version_id: string;
  leave_year: number;
  start_date: string;
  end_date: string;
  duration_mode: LeaveDurationMode;
  requested_units: number;
  submitted_chargeable_units: number;
  current_chargeable_units: number;
  current_status: LeaveRequestStatus;
  created_source: LeaveCreatedSource;
  submitted_at: string | null;
  updated_at: string;
  has_open_conflict: boolean;
  replaces_request_group_id: string | null;
  superseded_by_request_group_id: string | null;
};

export type LeaveBalanceSummary = {
  employeeId: string;
  leaveTypeId: string;
  leaveTypeCode: string;
  leaveTypeName: string;
  leaveYear: number;
  isPaid: boolean;
  isBalanceTracked: boolean;
  allocatedUnits: number;
  carryoverUnits: number;
  adjustmentUnits: number;
  usedUnits: number;
  pendingUnits: number;
  availableUnits: number | null;
  expiringUnits: number;
  expiresOn: string | null;
};

export type LeaveReviewInput = {
  requestGroupId: string;
  expectedRequestRevisionId: string;
  expectedStatus: "pending";
  expectedDayFingerprint: string;
  expectedChargeableUnits: number;
  decision: LeaveReviewDecision;
  reviewText: string | null;
};

export type LeaveTypeOption = {
  leaveTypeId: string;
  leaveTypeVersionId: string;
  code: string;
  name: string;
  isPaid: boolean;
  isBalanceTracked: boolean;
  employeeNoteRequired: boolean;
  documentRequired: boolean;
  documentRequiredMinUnits: number | null;
};

export type LeaveDraftValues = {
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  durationMode: LeaveDurationMode;
  employeeNote: string;
  replacesRequestGroupId: string | null;
};

export type LeavePreviewDay = {
  leaveDate: string;
  scheduleName: string | null;
  classification: LeaveClassification;
  chargeableUnits: LeaveUnit;
  isHoliday: boolean;
  isRestDay: boolean;
  halfDayBoundaryAt: string | null;
};

export type LeavePreviewResult = {
  days: LeavePreviewDay[];
  requestedUnits: number;
  chargeableUnits: number;
  ledgerBalance: number | null;
  pendingReservedUnits: number;
  availableUnits: number | null;
  requiresDocument: boolean;
};

export type LeavePreviewActionResult =
  | { ok: true; preview: LeavePreviewResult }
  | { ok: false; error: string };

export type LeaveRequestListItem = {
  requestGroupId: string;
  activeRevisionId: string;
  employeeId: string;
  employeeName: string;
  employeeNumber: string | null;
  departmentName: string | null;
  leaveTypeName: string;
  isPaid: boolean;
  isBalanceTracked: boolean;
  startDate: string;
  endDate: string;
  durationMode: LeaveDurationMode;
  status: LeaveRequestStatus;
  requestedUnits: number;
  chargeableUnits: number;
  submittedAt: string | null;
  reviewedAt: string | null;
  replacesRequestGroupId: string | null;
  supersededByRequestGroupId: string | null;
};

export type LeaveRequestDetail = LeaveRequestListItem & {
  activeRevisionId: string;
  leaveTypeId: string;
  leaveTypeVersionId: string;
  leaveYear: number;
  employeeNote: string | null;
  otherPendingReservedUnits: number;
  dayFingerprint: string;
  days: Array<{
    requestDayId: string;
    activeDayRevisionId: string;
    leaveDate: string;
    scheduleName: string | null;
    classification: LeaveClassification;
    chargeableUnits: LeaveUnit;
    isHoliday: boolean;
    isRestDay: boolean;
    conflictState: string | null;
  }>;
  actions: Array<{
    id: string;
    actionType: string;
    fromStatus: LeaveRequestStatus | null;
    toStatus: LeaveRequestStatus;
    actorName: string | null;
    createdAt: string;
    privateText: string | null;
  }>;
  attachments: LeaveAttachment[];
  balance: LeaveBalanceSummary | null;
};

export type LeaveAttendanceConflict = {
  conflictId: string;
  conflictType: LeaveConflictType;
  status: LeaveConflictStatus;
  employeeId: string;
  employeeName: string;
  employeeNumber: string | null;
  leaveTypeName: string;
  leaveDate: string;
  durationMode: LeaveDurationMode;
  chargeableUnits: number;
  attendanceBaseStatus: string | null;
  automaticBalanceAction: string | null;
  createdAt: string;
};
