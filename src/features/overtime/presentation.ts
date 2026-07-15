import type { HolidayType } from "./holidays/types";
import type { OvertimeApprovalStatus, OvertimeSegmentType } from "./types";

export function overtimeSegmentLabel(segment: OvertimeSegmentType): string {
  const labels: Record<OvertimeSegmentType, string> = {
    pre_shift: "Pre-shift",
    post_shift: "Post-shift",
    rest_day: "Rest-day overtime",
    holiday_work: "Holiday work",
  };
  return labels[segment];
}

export function overtimeApprovalStatusLabel(status: OvertimeApprovalStatus): string {
  const labels: Record<OvertimeApprovalStatus, string> = {
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
    superseded: "Superseded",
  };
  return labels[status];
}

export function holidayTypeLabel(type: HolidayType | null): string {
  if (type === "regular_holiday") return "Regular Holiday";
  if (type === "special_non_working_holiday") {
    return "Special Non-Working Holiday";
  }
  if (type === "company_holiday") return "Company Holiday";
  return "—";
}
