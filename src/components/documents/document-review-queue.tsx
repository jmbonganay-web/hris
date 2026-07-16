import Link from "next/link";
import type { DocumentCategorySummary } from "@/features/documents/categories/queries";
import { DocumentStatusBadge } from "./document-status-badge";
import type { DocumentReviewStatus } from "@/features/documents/types";

export type DocumentReviewQueueItem = {
  documentId: string;
  versionId: string;
  employeeId: string;
  employeeName: string;
  categoryId: string;
  categoryName: string;
  title: string;
  submittedAt: string;
  expirationDate: string | null;
  reviewStatus: string;
  expectedUpdatedAt: string;
};

function date(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(new Date(value)) : "None";
}

export function DocumentReviewQueue({
  rows,
  categories,
  filters,
}: {
  rows: DocumentReviewQueueItem[];
  categories: DocumentCategorySummary[];
  filters: { status?: string; category?: string; employee?: string; from?: string; to?: string; expiration?: string; page: number };
}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value && key !== "page") query.set(key, String(value));
  const previous = new URLSearchParams(query); previous.set("page", String(Math.max(1, filters.page - 1)));
  const next = new URLSearchParams(query); next.set("page", String(filters.page + 1));
  return <section className="content-stack">
    <form className="card document-filter-grid" method="get">
      <label><span>Status</span><select className="field" name="status" defaultValue={filters.status ?? "pending_review"}><option value="pending_review">Pending review</option><option value="replacement_requested">Replacement requested</option></select></label>
      <label><span>Category</span><select className="field" name="category" defaultValue={filters.category ?? ""}><option value="">All categories</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.currentVersion.name}</option>)}</select></label>
      <label><span>Employee</span><input className="field" name="employee" defaultValue={filters.employee ?? ""} placeholder="Name or employee number" /></label>
      <label><span>Submitted from</span><input className="field" type="date" name="from" defaultValue={filters.from ?? ""} /></label>
      <label><span>Submitted to</span><input className="field" type="date" name="to" defaultValue={filters.to ?? ""} /></label>
      <label><span>Expiration</span><select className="field" name="expiration" defaultValue={filters.expiration ?? ""}><option value="">All</option><option value="none">None</option><option value="valid">Valid</option><option value="expiring_soon">Expiring soon</option><option value="expired">Expired</option></select></label>
      <button className="btn secondary" type="submit">Apply filters</button>
    </form>
    <section className="card">
      <div className="card-header-row"><div><h2>Review queue</h2><p>Employee submissions awaiting a document decision.</p></div></div>
      {rows.length === 0 ? <div className="empty-state"><strong>No submissions found</strong><span>There are no document submissions matching these filters.</span></div> : <>
        <div className="table-wrap document-desktop-table"><table><thead><tr><th>Employee</th><th>Document</th><th>Status</th><th>Submitted</th><th>Expiration</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.versionId}><td><strong>{row.employeeName}</strong></td><td>{row.title}<span className="muted block">{row.categoryName}</span></td><td><DocumentStatusBadge value={row.reviewStatus as DocumentReviewStatus} /></td><td>{date(row.submittedAt)}</td><td>{date(row.expirationDate)}</td><td><Link className="text-link" href={`/admin/documents/review/${row.documentId}`}>Review</Link></td></tr>)}</tbody></table></div>
        <div className="document-mobile-list">{rows.map((row) => <article className="document-mobile-card" key={row.versionId}><div className="card-header-row"><strong>{row.employeeName}</strong><DocumentStatusBadge value={row.reviewStatus as DocumentReviewStatus} /></div><span>{row.title}</span><span className="muted">{row.categoryName} · submitted {date(row.submittedAt)}</span><Link className="btn secondary" href={`/admin/documents/review/${row.documentId}`}>Review</Link></article>)}</div>
      </>}
      <nav className="pagination" aria-label="Review queue pages"><Link className="btn secondary" aria-disabled={filters.page <= 1} href={`?${previous}`}>Previous</Link><span>Page {filters.page}</span><Link className="btn secondary" aria-disabled={rows.length < 25} href={`?${next}`}>Next</Link></nav>
    </section>
  </section>;
}
