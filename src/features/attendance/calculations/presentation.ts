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
