import type { FinalizationRun } from "@/features/attendance/calculations/types";
import { formatCompanyDate, formatCompanyDateTime } from "@/features/attendance/time";

export function FinalizationRunList({ runs }: { runs: FinalizationRun[] }) {
  if (!runs.length) return <div className="empty">No attendance finalization runs yet.</div>;
  return <div className="profile-section-stack">{runs.map((run) => <article className="organization-list-card" key={run.id}>
    <div className="section-heading-row"><div><strong>{formatCompanyDate(run.target_date)}</strong><p className="muted">{run.run_source === "scheduled_job" ? "Scheduled job" : "Manual run"}</p></div><span className={`badge ${run.status === "failed" ? "danger" : run.status === "completed_with_errors" ? "warning" : "success"}`}>{run.status.replaceAll("_", " ")}</span></div>
    <dl className="detail-grid"><div><dt>Started</dt><dd>{formatCompanyDateTime(run.started_at)}</dd></div><div><dt>Completed</dt><dd>{formatCompanyDateTime(run.completed_at)}</dd></div><div><dt>Employees processed</dt><dd>{run.employees_processed}</dd></div><div><dt>Absences created</dt><dd>{run.absences_created}</dd></div><div><dt>Missing clock-outs</dt><dd>{run.missing_clock_outs_finalized}</dd></div><div><dt>Unchanged skipped</dt><dd>{run.unchanged_results_skipped}</dd></div><div><dt>Errors</dt><dd>{run.error_count}</dd></div></dl>
    {run.manual_reason && <p className="private-reason"><strong>Manual reason:</strong> {run.manual_reason}</p>}
  </article>)}</div>;
}
