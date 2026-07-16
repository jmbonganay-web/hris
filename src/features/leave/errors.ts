const safeLeaveErrors: ReadonlyArray<readonly [string, string]> = [
  ["LEAVE_INSUFFICIENT_BALANCE", "The available leave balance cannot cover this action."],
  ["LEAVE_OVERLAP", "This request overlaps pending or approved leave."],
  ["LEAVE_NO_CHARGEABLE_DAYS", "Choose at least one scheduled workday."],
  ["LEAVE_OUTSIDE_DATE_WINDOW", "The selected dates are outside the allowed request window."],
  ["LEAVE_CROSSES_YEAR", "A request cannot cross calendar years."],
  ["LEAVE_HALF_DAY_RANGE_INVALID", "Half-day leave must use one calendar date."],
  ["LEAVE_DOCUMENT_REQUIRED", "A supporting document is required for this request."],
  ["LEAVE_NOTE_REQUIRED", "A reason is required for this leave request."],
  ["LEAVE_POLICY_INACTIVE", "The selected leave type is not available for these dates."],
  ["LEAVE_NOT_ELIGIBLE", "The employee is not eligible for this leave type and year."],
  ["LEAVE_REQUEST_STALE", "This leave request changed while it was being reviewed. Reload and try again."],
  ["LEAVE_RECALCULATION_FAILED", "Leave and attendance could not be recalculated safely."],
  ["LEAVE_ATTACHMENT_INVALID", "One or more supporting documents are invalid."],
  ["LEAVE_PERMISSION_DENIED", "You do not have permission to perform this leave action."],
  ["LEAVE_INVALID_STATUS", "This action is not allowed for the current request status."],
  ["LEAVE_ADJUSTMENT_REASON_REQUIRED", "An adjustment reason is required."],
  ["LEAVE_REJECTION_REASON_REQUIRED", "A rejection reason is required."],
  ["LEAVE_CANCELLATION_REASON_REQUIRED", "A cancellation reason is required."],
  ["LEAVE_GENERATION_CONFLICT", "Leave-year generation changed or is already in progress. Reload and try again."],
];

export function mapLeaveError(message: string, fallback = "The leave action could not be completed.") {
  return safeLeaveErrors.find(([code]) => message.includes(code))?.[1] ?? fallback;
}
