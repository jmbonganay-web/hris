import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { NotificationFilterForm } from "@/components/notifications/notification-filter-form";
import { NotificationList } from "@/components/notifications/notification-list";
import { NotificationSummaryCards } from "@/components/notifications/notification-summary-cards";
import { getNotificationDashboardSummary, listNotifications } from "@/features/notifications/queries";
import { parseNotificationFilters } from "@/features/notifications/validation";

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const filters=parseNotificationFilters(await searchParams);
  const [result,summary]=await Promise.all([listNotifications(filters),getNotificationDashboardSummary(5)]);
  const pageCount=Math.max(1,Math.ceil(result.total/result.pageSize));
  const params=(page:number)=>{const q=new URLSearchParams();if(filters.module)q.set('module',filters.module);if(filters.status)q.set('status',filters.status);if(filters.priority)q.set('priority',filters.priority);if(filters.query)q.set('query',filters.query);if(filters.from)q.set('from',filters.from);if(filters.to)q.set('to',filters.to);q.set('page',String(page));return `/notifications?${q}`;};
  return <div className="notification-center-layout">
    <PageHeader title="Notifications" description="Review reminders, escalations, approvals, and system updates addressed to you." />
    <NotificationSummaryCards counts={{unread:summary.unreadCount,urgent:summary.urgentCount,active:summary.activeCount,resolved:summary.resolvedCount}}/>
    <NotificationFilterForm filters={filters}/>
    <NotificationList items={result.items}/>
    <nav className="pagination" aria-label="Notification pages"><span className="muted">Page {result.page} of {pageCount} · {result.total} notifications</span><div className="pagination-actions">{result.page>1?<Link className="btn" href={params(result.page-1)}>Previous</Link>:null}{result.page<pageCount?<Link className="btn" href={params(result.page+1)}>Next</Link>:null}</div></nav>
  </div>;
}
