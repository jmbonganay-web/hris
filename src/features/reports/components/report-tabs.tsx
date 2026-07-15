import Link from "next/link";
import { serializeReportFilters } from "../filters";
import type { ReportFilters, ReportTab } from "../types";

const tabs: Array<{ value: ReportTab; label: string }> = [
  { value: "summary", label: "Summary" },
  { value: "daily", label: "Daily Attendance" },
  { value: "exceptions", label: "Exceptions" },
  { value: "overtime", label: "Overtime & Holiday Work" },
  { value: "exports", label: "Exports" },
];

export function ReportTabs({ filters }: { filters: ReportFilters }) {
  return (
    <nav className="report-tabs" aria-label="Attendance report sections">
      {tabs.map((tab) => {
        const params = serializeReportFilters({ ...filters, tab: tab.value, page: 1 });
        return (
          <Link
            key={tab.value}
            className={`report-tab${filters.tab === tab.value ? " active" : ""}`}
            href={`/reports?${params.toString()}`}
            aria-current={filters.tab === tab.value ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
