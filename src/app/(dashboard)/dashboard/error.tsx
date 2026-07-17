"use client";

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card empty-state dashboard-error-state">
      <strong>Dashboard analytics could not be loaded</strong>
      <span>Retry the request. If the issue continues, confirm the Phase 8 migration is applied.</span>
      <button className="btn primary" onClick={() => reset()} type="button">Retry</button>
    </div>
  );
}
