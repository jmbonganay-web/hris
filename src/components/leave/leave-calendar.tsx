import Link from "next/link";
import type { LeaveRequestListItem } from "@/features/leave/types";
import { leaveDurationLabel, leaveStatusLabel } from "@/features/leave/presentation";

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function monthName(year: number, month: number) {
  return new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function adjacentMonth(year: number, month: number, delta: number) {
  const value = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1 };
}

function monthHref(baseHref: string, value: { year: number; month: number }) {
  return `${baseHref}?year=${value.year}&month=${value.month}`;
}

export function LeaveCalendar({
  year,
  month,
  requests,
  baseHref,
}: {
  year: number;
  month: number;
  requests: LeaveRequestListItem[];
  baseHref: "/employee/leave" | "/admin/leave";
}): React.ReactNode {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const previous = adjacentMonth(year, month, -1);
  const next = adjacentMonth(year, month, 1);
  const cells = Array.from({ length: firstWeekday + daysInMonth }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day > 0 ? day : null;
  });
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <section className="card leave-calendar-section">
      <div className="section-heading-row">
        <div>
          <h2 className="card-title">Leave calendar</h2>
          <p className="muted">{monthName(year, month)}</p>
        </div>
        <nav className="header-actions" aria-label="Leave calendar months">
          <Link className="btn" href={monthHref(baseHref, previous)}>Previous</Link>
          <Link className="btn" href={monthHref(baseHref, next)}>Next</Link>
        </nav>
      </div>
      <div className="leave-calendar-grid" role="grid" aria-label={monthName(year, month)}>
        {weekdayLabels.map((label) => (
          <div className="leave-calendar-weekday" role="columnheader" key={label}>{label}</div>
        ))}
        {cells.map((day, index) => {
          if (!day) return <div className="leave-calendar-day empty" aria-hidden="true" key={`empty-${index}`} />;
          const date = isoDate(year, month, day);
          const dayRequests = requests.filter((request) => request.startDate <= date && request.endDate >= date);
          return (
            <div className="leave-calendar-day" role="gridcell" key={date}>
              <time dateTime={date}>{day}</time>
              <div className="leave-calendar-events">
                {dayRequests.map((request) => (
                  <Link
                    className={`leave-calendar-event status-${request.status}`}
                    href={`${baseHref}/${request.requestGroupId}`}
                    key={request.requestGroupId}
                  >
                    <strong>{request.leaveTypeName}</strong>
                    <span>{leaveDurationLabel(request.durationMode)} · {leaveStatusLabel(request.status)}</span>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
