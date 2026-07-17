import type { LucideIcon } from "lucide-react";

export type DashboardMetricItem = {
  label: string;
  value: number | string;
  detail?: string;
  icon: LucideIcon;
  tone?: "default" | "warning" | "danger";
};

export function DashboardMetricGrid({ items }: { items: DashboardMetricItem[] }) {
  return (
    <section className="dashboard-metric-grid" aria-label="Dashboard metrics">
      {items.map(({ label, value, detail, icon: Icon, tone = "default" }) => (
        <article className={`card dashboard-metric-card ${tone}`} key={label}>
          <div>
            <div className="stat-label">{label}</div>
            <div className="stat-value">{value}</div>
            {detail ? <p className="muted">{detail}</p> : null}
          </div>
          <div className="stat-icon"><Icon aria-hidden="true" size={21} /></div>
        </article>
      ))}
    </section>
  );
}
