import type { DashboardPreset, DashboardRange } from "./types.ts";
import { dashboardPresetValues } from "./types.ts";

const DAY_MS = 86_400_000;

function parseIsoDate(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function endOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function formatRangeLabel(startDate: string, endDate: string) {
  const start = parseIsoDate(startDate)!;
  const end = parseIsoDate(endDate)!;
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const startMonth = months[start.getUTCMonth()];
  const endMonth = months[end.getUTCMonth()];
  const startDay = start.getUTCDate();
  const endDay = end.getUTCDate();
  const startYear = start.getUTCFullYear();
  const endYear = end.getUTCFullYear();
  if (startYear === endYear && start.getUTCMonth() === end.getUTCMonth()) {
    return `${startMonth} ${startDay}–${endDay}, ${endYear}`;
  }
  if (startYear === endYear) {
    return `${startMonth} ${startDay}–${endMonth} ${endDay}, ${endYear}`;
  }
  return `${startMonth} ${startDay}, ${startYear}–${endMonth} ${endDay}, ${endYear}`;
}

function currentMonth(today: Date): DashboardRange {
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const end = endOfMonth(today);
  const startDate = iso(start);
  const endDate = iso(end);
  return { preset: "current_month", startDate, endDate, label: formatRangeLabel(startDate, endDate) };
}

export function resolveDashboardRange(
  input: { preset?: string; start?: string; end?: string },
  todayIso: string,
): DashboardRange {
  const today = parseIsoDate(todayIso) ?? new Date();
  const preset = dashboardPresetValues.includes(input.preset as DashboardPreset)
    ? (input.preset as DashboardPreset)
    : "current_month";

  if (preset === "current_month") return currentMonth(today);

  if (preset === "last_7_days" || preset === "last_30_days") {
    const days = preset === "last_7_days" ? 7 : 30;
    const startDate = iso(addDays(today, -(days - 1)));
    const endDate = iso(today);
    return { preset, startDate, endDate, label: formatRangeLabel(startDate, endDate) };
  }

  if (preset === "current_quarter") {
    const quarterStartMonth = Math.floor(today.getUTCMonth() / 3) * 3;
    const start = new Date(Date.UTC(today.getUTCFullYear(), quarterStartMonth, 1));
    const end = new Date(Date.UTC(today.getUTCFullYear(), quarterStartMonth + 3, 0));
    const startDate = iso(start);
    const endDate = iso(end);
    return { preset, startDate, endDate, label: formatRangeLabel(startDate, endDate) };
  }

  const start = parseIsoDate(input.start);
  const end = parseIsoDate(input.end);
  if (!start || !end || start > end || Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1 > 366) {
    return currentMonth(today);
  }
  const startDate = iso(start);
  const endDate = iso(end);
  return { preset: "custom", startDate, endDate, label: formatRangeLabel(startDate, endDate) };
}

export function dashboardRangeQuery(range: DashboardRange) {
  const params = new URLSearchParams({ preset: range.preset });
  if (range.preset === "custom") {
    params.set("start", range.startDate);
    params.set("end", range.endDate);
  }
  return params.toString();
}
