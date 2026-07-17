import type { NotificationCycleSummary } from "@/features/notifications/types";
import { notificationRunStatusLabel } from "@/features/notifications/presentation";
import { badgeClass } from "@/lib/utils";
export function NotificationRunSummary({ runs }: { runs: NotificationCycleSummary[] }) {
  if (!runs.length) return <div className="card empty-state"><strong>No notification cycles yet</strong><span>The scheduled cycle will run at 8:00 AM Asia/Manila.</span></div>;
  return <div className="notification-run-summary">{runs.map(run=><article className="card" key={run.id}><div className="card-header-row"><strong>{run.runDate} · {run.runSource}</strong><span className={`badge ${badgeClass(run.status)}`}>{notificationRunStatusLabel(run.status)}</span></div><dl className="profile-summary-list compact"><div><dt>Created</dt><dd>{run.createdCount}</dd></div><div><dt>Reminded</dt><dd>{run.remindedCount}</dd></div><div><dt>Escalated</dt><dd>{run.escalatedCount}</dd></div><div><dt>Resolved</dt><dd>{run.resolvedCount}</dd></div><div><dt>Archived</dt><dd>{run.archivedCount}</dd></div></dl>{run.safeErrorMessage?<p className="form-error">{run.safeErrorMessage}</p>:null}</article>)}</div>;
}
