import { StatusBadge } from "@/components/status-badge";
import { formatCompanyDate } from "@/features/attendance/time";
import type { DashboardLeaveItem } from "@/features/dashboard/types";

export function DashboardUpcomingLeave({
  items,
  title = "Approved leave",
  description = "Approved absences overlapping the selected period.",
}: {
  items: DashboardLeaveItem[];
  title?: string;
  description?: string;
}) {
  return (
    <article className="card dashboard-leave-card">
      <div className="section-heading"><div><h2>{title}</h2><p>{description}</p></div></div>
      {items.length === 0 ? (
        <div className="empty-state compact"><strong>No leave records</strong><span>No matching leave requests are available for this period.</span></div>
      ) : (
        <div className="list">
          {items.map((item) => (
            <div className="list-item" key={item.id}>
              <div><strong>{item.employeeName ?? item.leaveType}</strong><div className="muted">{item.employeeName ? `${item.leaveType} · ` : ""}{formatCompanyDate(item.startDate)}–{formatCompanyDate(item.endDate)}</div></div>
              <StatusBadge value={item.status} />
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
