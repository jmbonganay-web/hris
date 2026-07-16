import Link from "next/link";
import type { DocumentExpirationStatus, DocumentReviewStatus } from "@/features/documents/types";
import { DocumentStatusBadge } from "./document-status-badge";

export type EmployeeDocumentListItem = {
  id: string; title: string; categoryName: string; reviewStatus: DocumentReviewStatus;
  expirationStatus: DocumentExpirationStatus; expirationDate: string | null; versionNumber: number;
  updatedAt: string; canAccessFile: boolean;
};
function date(value: string | null) { return value ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(new Date(value)) : "No expiration"; }
export function DocumentList({ documents }: { documents: EmployeeDocumentListItem[] }) {
  return <section className="card"><div className="card-header-row"><div><h2>My documents</h2><p>Current submissions and approved records.</p></div></div>
    {documents.length === 0 ? <div className="empty-state"><strong>No documents found</strong><span>Upload a required document or adjust the filters.</span></div> : <>
      <div className="table-wrap document-desktop-table"><table><thead><tr><th>Document</th><th>Category</th><th>Status</th><th>Expiration</th><th>Version</th><th /></tr></thead><tbody>
        {documents.map((item) => <tr key={item.id}><td><strong>{item.title}</strong></td><td>{item.categoryName}</td><td><DocumentStatusBadge value={item.reviewStatus} /></td><td><DocumentStatusBadge value={item.expirationStatus} /><span className="muted block">{date(item.expirationDate)}</span></td><td>v{item.versionNumber}</td><td><Link className="text-link" href={`/documents/${item.id}`}>View</Link></td></tr>)}
      </tbody></table></div>
      <div className="document-mobile-list">{documents.map((item) => <article key={item.id} className="document-mobile-card"><div className="card-header-row"><strong>{item.title}</strong><DocumentStatusBadge value={item.reviewStatus} /></div><span>{item.categoryName}</span><span>{date(item.expirationDate)}</span><Link className="btn secondary" href={`/documents/${item.id}`}>View details</Link></article>)}</div>
    </>}
  </section>;
}
