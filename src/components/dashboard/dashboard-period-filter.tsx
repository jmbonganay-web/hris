"use client";

import { useState } from "react";
import type { DashboardPreset, DashboardRange } from "@/features/dashboard/types";

const options: Array<{ value: DashboardPreset; label: string }> = [
  { value: "current_month", label: "Current month" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "current_quarter", label: "Current quarter" },
  { value: "custom", label: "Custom range" },
];

export function DashboardPeriodFilter({ range }: { range: DashboardRange }) {
  const [preset, setPreset] = useState<DashboardPreset>(range.preset);

  return (
    <form className="card dashboard-period-filter" method="get">
      <div>
        <span className="eyebrow">Reporting period</span>
        <strong>{range.label}</strong>
      </div>
      <label>
        <span>Period</span>
        <select name="preset" value={preset} onChange={(event) => setPreset(event.target.value as DashboardPreset)}>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <div className={`dashboard-custom-range${preset === "custom" ? " active" : ""}`} aria-hidden={preset !== "custom"}>
        <label>
          <span>Start date</span>
          <input defaultValue={range.startDate} disabled={preset !== "custom"} name="start" type="date" />
        </label>
        <label>
          <span>End date</span>
          <input defaultValue={range.endDate} disabled={preset !== "custom"} name="end" type="date" />
        </label>
      </div>
      <button className="btn primary" type="submit">Apply</button>
    </form>
  );
}
