import { scheduledMinutes } from "@/features/schedules/validation";
import type { ScheduleVersionRecord } from "@/features/schedules/types";

function time(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return new Intl.DateTimeFormat("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2026, 0, 1, hour, minute)));
}

export function ScheduleSummary({ version }: { version: Pick<ScheduleVersionRecord, "working_days" | "start_time" | "end_time" | "break_minutes"> }) {
  const minutes = scheduledMinutes(version.start_time, version.end_time, version.break_minutes);
  return (
    <dl className="schedule-summary-grid">
      <div><dt>Working days</dt><dd>{version.working_days.map((day) => day[0].toUpperCase() + day.slice(1)).join(", ")}</dd></div>
      <div><dt>Hours</dt><dd>{time(version.start_time)}–{time(version.end_time)}</dd></div>
      <div><dt>Unpaid break</dt><dd>{version.break_minutes} minutes</dd></div>
      <div><dt>Scheduled work</dt><dd>{Math.floor(minutes / 60)}h {minutes % 60}m</dd></div>
    </dl>
  );
}
