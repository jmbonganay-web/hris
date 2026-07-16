import Link from "next/link";
import type { DocumentExpirationStatus, DocumentRequirementStatus } from "@/features/documents/types";
import { DocumentStatusBadge } from "./document-status-badge";

export type EmployeeRequirementRow = {
  categoryId: string; categoryName: string; requiredCount: number; approvedCount: number;
  status: DocumentRequirementStatus; expirationStatus: DocumentExpirationStatus | null;
  nearestExpirationDate: string | null; employeeUploadEnabled: boolean;
};
function date(value: string | null) { return value ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00`)) : "Not applicable"; }
export function DocumentRequirementList({ requirements, uploadCategoryId }: { requirements: EmployeeRequirementRow[]; uploadCategoryId?: string }) {
  return <section className="content-stack"><div className="section-heading"><div><h2>Required documents</h2><p>Track required records and their current compliance status.</p></div></div>
    {requirements.length === 0 ? <div className="card empty-state"><strong>No document requirements</strong><span>No active requirements apply to your employee profile.</span></div>
      : <div className="document-requirement-grid">{requirements.map((item) => <article className="card" key={item.categoryId}>
        <div className="card-header-row"><strong>{item.categoryName}</strong><DocumentStatusBadge value={item.status} /></div>
        <dl className="profile-summary-list compact"><div><dt>Approved</dt><dd>{item.approvedCount} of {item.requiredCount}</dd></div><div><dt>Nearest expiration</dt><dd>{date(item.nearestExpirationDate)}</dd></div></dl>
        {item.employeeUploadEnabled && <Link className="btn secondary" href={`/documents?uploadCategory=${item.categoryId}`} aria-current={uploadCategoryId === item.categoryId ? "page" : undefined}>Upload document</Link>}
      </article>)}</div>}
  </section>;
}
