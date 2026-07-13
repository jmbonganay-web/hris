import {
  COMPANY_TIME_ZONE,
  type AttendanceEffectiveStatus,
  type AttendanceStoredStatus,
} from "./types.ts";

function parts(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: COMPANY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
}

export function companyDateAt(date = new Date()) {
  const values = Object.fromEntries(parts(date).map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function effectiveAttendanceStatus(
  record: {
    attendance_date: string;
    clock_out_at: string | null;
    status: AttendanceStoredStatus;
  },
  companyDate: string,
): AttendanceEffectiveStatus {
  if (record.clock_out_at) return "completed";
  if (record.attendance_date < companyDate) return "missing_clock_out";
  return "clocked_in";
}

export function formatCompanyDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: COMPANY_TIME_ZONE,
    dateStyle: "medium",
  }).format(new Date(`${value}T00:00:00+08:00`));
}

export function formatCompanyTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: COMPANY_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatCompanyDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: COMPANY_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function toCompanyDateTimeLocal(value: string | null) {
  if (!value) return "";
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: COMPANY_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(value))
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}
