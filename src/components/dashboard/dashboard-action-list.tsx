import Link from "next/link";
import type { DashboardActionItem } from "@/features/dashboard/types";

export function DashboardActionList({ items }: { items: DashboardActionItem[] }) {
  return (
    <article className="card dashboard-action-card">
      <div className="section-heading"><div><h2>Quick actions</h2><p>Open the existing workflow that needs your attention.</p></div></div>
      <div className="dashboard-action-list">
        {items.map((item) => (
          <Link className={`dashboard-action-link ${item.tone}`} href={item.href} key={item.key}>
            <span>{item.label}</span>
            {item.count > 0 ? <strong>{item.count}</strong> : <span aria-hidden="true">→</span>}
          </Link>
        ))}
      </div>
    </article>
  );
}
