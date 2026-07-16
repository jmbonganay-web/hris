import type { ManagerComplianceRow } from "@/features/documents/compliance/queries";
import { DocumentStatusBadge } from "./document-status-badge";

export function ManagerDocumentCompliance({ rows }: { rows: ManagerComplianceRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <strong>No direct-report document requirements</strong>
        <span>No current compliance items are available.</span>
      </div>
    );
  }

  return (
    <div className="manager-document-compliance-grid">
      {rows.map((row) => (
        <article className="card" key={row.employeeId}>
          <div className="card-header-row">
            <strong>{row.employeeName}</strong>
            <DocumentStatusBadge value={row.overallStatus} />
          </div>
          <dl className="profile-summary-list compact">
            <div><dt>Missing</dt><dd>{row.missingCount}</dd></div>
            <div><dt>Pending review</dt><dd>{row.pendingReviewCount}</dd></div>
            <div><dt>Expiring soon</dt><dd>{row.expiringSoonCount}</dd></div>
            <div><dt>Expired</dt><dd>{row.expiredCount}</dd></div>
          </dl>
        </article>
      ))}
    </div>
  );
}
