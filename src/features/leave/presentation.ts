import type {
  LeaveClassification,
  LeaveConflictType,
  LeaveDurationMode,
  LeaveRequestStatus,
} from "./types.ts";

const statusLabels: Record<LeaveRequestStatus, string> = {
  draft: "Draft",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  cancelled: "Cancelled",
  superseded: "Superseded",
};
const durationLabels: Record<LeaveDurationMode, string> = {
  full_day: "Full day",
  first_half: "First half",
  second_half: "Second half",
};
const classificationLabels: Record<LeaveClassification, string> = {
  paid_leave: "Paid leave",
  unpaid_leave: "Unpaid leave",
  non_chargeable_holiday: "Holiday — not charged",
  non_chargeable_rest_day: "Rest day — not charged",
  non_chargeable_no_schedule: "No schedule — not charged",
  attendance_precedence: "Attendance takes precedence",
};
const conflictLabels: Record<LeaveConflictType, string> = {
  full_day_completed_attendance: "Completed attendance during full-day leave",
  full_day_incomplete_attendance: "Incomplete attendance during full-day leave",
  half_day_covered_time_overlap: "Attendance overlapped the leave-covered half",
  schedule_recalculation_failed: "Schedule recalculation failed",
  holiday_recalculation_failed: "Holiday recalculation failed",
  insufficient_balance_after_recalculation: "Insufficient balance after recalculation",
};

export function formatLeaveUnits(units: number) {
  const value = Number.isInteger(units) ? String(units) : units.toFixed(1);
  return `${value} ${units === 0.5 || units === 1 ? "day" : "days"}`;
}
export function leaveStatusLabel(status: LeaveRequestStatus) { return statusLabels[status]; }
export function leaveDurationLabel(mode: LeaveDurationMode) { return durationLabels[mode]; }
export function leaveConflictLabel(type: LeaveConflictType) { return conflictLabels[type]; }
export function leaveClassificationLabel(classification: LeaveClassification) { return classificationLabels[classification]; }
