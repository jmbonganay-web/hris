import Link from "next/link";
import { notificationModuleValues, notificationPriorityValues, notificationStatusValues, type NotificationCenterFilters } from "@/features/notifications/types";
import { notificationModuleLabel, notificationPriorityLabel, notificationStatusLabel } from "@/features/notifications/presentation";
export function NotificationFilterForm({ filters }: { filters: NotificationCenterFilters }) {
  return <form className="card notification-filter-grid" method="get">
    <label>Search<input className="field" name="query" defaultValue={filters.query ?? ""} placeholder="Search notifications" /></label>
    <label>Module<select className="field" name="module" defaultValue={filters.module ?? ""}><option value="">All modules</option>{notificationModuleValues.map(v=><option value={v} key={v}>{notificationModuleLabel(v)}</option>)}</select></label>
    <label>Status<select className="field" name="status" defaultValue={filters.status ?? "active"}><option value="active">Active</option>{notificationStatusValues.map(v=><option value={v} key={v}>{notificationStatusLabel(v)}</option>)}</select></label>
    <label>Priority<select className="field" name="priority" defaultValue={filters.priority ?? ""}><option value="">All priorities</option>{notificationPriorityValues.map(v=><option value={v} key={v}>{notificationPriorityLabel(v)}</option>)}</select></label>
    <label>From<input className="field" name="from" type="date" defaultValue={filters.from ?? ""} /></label>
    <label>To<input className="field" name="to" type="date" defaultValue={filters.to ?? ""} /></label>
    <div className="form-actions"><button className="btn primary" type="submit">Apply filters</button><Link className="btn" href="/notifications">Reset</Link></div>
  </form>;
}
