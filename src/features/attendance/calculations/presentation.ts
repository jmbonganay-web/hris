import type {
  AttendanceCalculationBaseStatus,
  AttendanceCalculationRevision,
} from "./types";

export function formatAttendanceMinutes(minutes: number | null): string {
  if (minutes === null) return "Unavailable";
  const safe = Math.max(0, Math.floor(minutes));
  const hours = Math.floor(safe / 60);
  const remainder = safe % 60;
  if (hours === 0) return `${remainder}m`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

export function attendanceBaseStatusLabel(
  status: AttendanceCalculationBaseStatus,
): string {
  const labels: Record<AttendanceCalculationBaseStatus, string> = {
    present: "Present",
    absent: "Absent",
    holiday: "Holiday",
    paid_leave: "Paid leave",
    unpaid_leave: "Unpaid leave",
    missing_clock_out: "Missing clock-out",
    rest_day_worked: "Rest day worked",
    unscheduled_attendance: "Unscheduled attendance",
  };
  return labels[status];
}

export function attendanceCalculationFlags(
  revision: AttendanceCalculationRevision,
): string[] {
  const flags: string[] = [];
  if (revision.is_late) flags.push("Late");
  if (revision.is_undertime) flags.push("Undertime");
  if (revision.is_corrected) flags.push("Corrected");
  if (revision.is_recalculated) flags.push("Recalculated");
  return flags;
}
export function holidayAttendanceLabel(
  revision: Pick<
    AttendanceCalculationRevision,
    | "is_holiday"
    | "holiday_name"
    | "holiday_type"
    | "actual_clock_in_at"
    | "actual_clock_out_at"
  >,
): string | null {
  if (!revision.is_holiday) return null;
  if (revision.actual_clock_in_at && revision.actual_clock_out_at) {
    return "Holiday work";
  }
  if (revision.holiday_type === "regular_holiday") return "Regular Holiday";
  if (revision.holiday_type === "special_non_working_holiday") {
    return "Special Non-Working Holiday";
  }
  if (revision.holiday_type === "company_holiday") return "Company Holiday";
  return revision.holiday_name ?? "Holiday";
}
