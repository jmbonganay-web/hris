import type { CSSProperties } from "react";
import type { DashboardBreakdownItem } from "@/features/dashboard/types";

export function DashboardBreakdownChart({
  items,
  title,
  description,
}: {
  items: DashboardBreakdownItem[];
  title: string;
  description: string;
}) {
  const max = Math.max(0, ...items.map((item) => item.value));
  return (
    <article className="card dashboard-chart-card">
      <div className="section-heading"><div><h2>{title}</h2><p>{description}</p></div></div>
      {items.length === 0 ? (
        <div className="empty-state compact"><strong>No breakdown available</strong><span>There are no matching records for the selected view.</span></div>
      ) : (
        <div className="dashboard-breakdown-list">
          {items.map((item) => {
            const percentage = max === 0 ? 0 : Math.max(4, Math.round((item.value / max) * 100));
            const style = { "--dashboard-bar-size": `${percentage}%` } as CSSProperties;
            return (
              <div className="dashboard-breakdown-row" key={item.label}>
                <div><span>{item.label}</span><strong>{item.value}</strong></div>
                <div className="dashboard-breakdown-track"><span className="dashboard-breakdown-bar" style={style} /></div>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}
