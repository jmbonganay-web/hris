import type { AttendanceCalculationBaseStatus } from "./types.ts";

export function completedMinutesBetween(startIso: string, endIso: string): number {
  const milliseconds = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(0, Math.floor(milliseconds / 60_000));
}

export function calculateLateMinutes(
  scheduledStartMinute: number,
  actualClockInMinute: number,
  graceMinutes: number,
): number {
  const difference = actualClockInMinute - scheduledStartMinute;
  return difference <= graceMinutes ? 0 : Math.max(0, difference);
}

export function calculateUndertimeMinutes(
  scheduledEndMinute: number,
  actualClockOutMinute: number,
): number {
  return Math.max(0, scheduledEndMinute - actualClockOutMinute);
}

export function calculateWorkedMinutes(
  actualClockInMinute: number,
  actualClockOutMinute: number,
  breakMinutes: number,
): number {
  return Math.max(0, actualClockOutMinute - actualClockInMinute - breakMinutes);
}

export function classifyAttendanceCalculation(input: {
  hasSchedule: boolean;
  isScheduledWorkday: boolean;
  attendanceExists: boolean;
  hasClockIn: boolean;
  hasClockOut: boolean;
  dateHasEnded: boolean;
}): AttendanceCalculationBaseStatus | null {
  if (!input.hasSchedule) {
    return input.attendanceExists ? "unscheduled_attendance" : null;
  }
  if (!input.isScheduledWorkday) {
    return input.attendanceExists ? "rest_day_worked" : null;
  }
  if (!input.attendanceExists) {
    return input.dateHasEnded ? "absent" : null;
  }
  if (input.hasClockIn && input.hasClockOut) return "present";
  if (input.hasClockIn && input.dateHasEnded) return "missing_clock_out";
  if (input.hasClockIn) return "present";
  return null;
}
