import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { formatCompanyDate } from "@/features/attendance/time";
import type { DashboardRecentHire } from "@/features/dashboard/types";
import { initials } from "@/lib/utils";

export function DashboardRecentPeople({ items }: { items: DashboardRecentHire[] }) {
  return (
    <article className="card dashboard-recent-people">
      <div className="section-heading"><div><h2>Recent hires</h2><p>Employees whose hire date falls inside the selected period.</p></div><Link className="btn" href="/employees">View employees</Link></div>
      {items.length === 0 ? (
        <div className="empty-state compact"><strong>No recent hires</strong><span>No employee hire dates fall inside this period.</span></div>
      ) : (
        <div className="list">
          {items.map((item) => (
            <Link className="list-item dashboard-person-row" href={`/employees/${item.id}`} key={item.id}>
              <div className="person"><div className="avatar">{initials(item.name)}</div><div><strong>{item.name}</strong><div className="muted">{item.jobTitle ?? "No job title"} · {item.department ?? "No department"}</div></div></div>
              <div className="dashboard-person-meta"><span className="muted">{formatCompanyDate(item.hireDate)}</span><StatusBadge value={item.status} /></div>
            </Link>
          ))}
        </div>
      )}
    </article>
  );
}
