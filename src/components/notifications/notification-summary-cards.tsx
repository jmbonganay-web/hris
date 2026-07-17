export function NotificationSummaryCards({ counts }: { counts: { unread: number; urgent: number; active: number; resolved: number } }) {
  return <div className="notification-summary-grid" aria-label="Notification summary">
    {[['Unread', counts.unread], ['Urgent', counts.urgent], ['Active', counts.active], ['Resolved', counts.resolved]].map(([label,value]) =>
      <article className="card stat" key={String(label)}><div><div className="stat-label">{label}</div><div className="stat-value">{value}</div></div></article>
    )}
  </div>;
}
