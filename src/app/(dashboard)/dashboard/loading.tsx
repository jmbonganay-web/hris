export default function DashboardLoading() {
  return (
    <div className="dashboard-loading content-stack" aria-busy="true" aria-label="Loading dashboard analytics">
      <div className="skeleton-line wide" />
      <div className="card skeleton-card" />
      <div className="dashboard-metric-grid">{Array.from({ length: 5 }, (_, index) => <div className="card skeleton-card" key={index} />)}</div>
      <div className="dashboard-analytics-grid"><div className="card skeleton-panel" /><div className="card skeleton-panel" /></div>
    </div>
  );
}
