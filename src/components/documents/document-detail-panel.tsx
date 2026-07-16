import { DocumentStatusBadge } from "./document-status-badge";
import type { DocumentReviewStatus } from "@/features/documents/types";

type DetailVersion = { reviewStatus: DocumentReviewStatus; referenceNumber?: string | null; issueDate?: string | null; expirationDate?: string | null; issuingOrganization?: string | null; notes?: string | null; tags?: string[]; customMetadata?: Record<string, unknown>; employeeMessage?: string | null };
export function DocumentDetailPanel({ title, categoryName, version }: { title: string; categoryName: string; version: DetailVersion }) {
  return <section className="card document-detail-panel"><div className="card-header-row"><div><h2>{title}</h2><p>{categoryName}</p></div><DocumentStatusBadge value={version.reviewStatus} /></div>
    <dl className="profile-summary-list"><div><dt>Reference number</dt><dd>{version.referenceNumber || "Not provided"}</dd></div><div><dt>Issue date</dt><dd>{version.issueDate || "Not provided"}</dd></div><div><dt>Expiration date</dt><dd>{version.expirationDate || "No expiration"}</dd></div><div><dt>Issuing organization</dt><dd>{version.issuingOrganization || "Not provided"}</dd></div></dl>
    {version.notes && <div><h3>Notes</h3><p>{version.notes}</p></div>}{version.tags && version.tags.length > 0 && <div className="tag-list">{version.tags.map((tag) => <span className="badge info" key={tag}>{tag}</span>)}</div>}
    {version.customMetadata && Object.keys(version.customMetadata).length > 0 && <dl className="profile-summary-list">{Object.entries(version.customMetadata).map(([key, value]) => <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{String(value)}</dd></div>)}</dl>}
    {version.employeeMessage && <div className="notice warning"><strong>HR message</strong><p>{version.employeeMessage}</p></div>}
  </section>;
}
