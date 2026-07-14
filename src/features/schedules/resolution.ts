import type {
  EmployeeScheduleAssignment,
  ScheduleResolutionState,
  ScheduleVersionRecord,
  ScheduleWeekday,
} from "./types.ts";

const weekdays: ScheduleWeekday[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export function weekdayForCompanyDate(value: string): ScheduleWeekday {
  const date = new Date(`${value}T00:00:00Z`);
  return weekdays[date.getUTCDay()];
}

export function resolveScheduleState(
  companyDate: string,
  assignment: Pick<EmployeeScheduleAssignment, "id"> | null,
  version: Pick<ScheduleVersionRecord, "working_days"> | null,
): ScheduleResolutionState {
  if (!assignment) return "unassigned";
  if (!version) return "unavailable";
  return version.working_days.includes(weekdayForCompanyDate(companyDate))
    ? "scheduled_workday"
    : "rest_day";
}
