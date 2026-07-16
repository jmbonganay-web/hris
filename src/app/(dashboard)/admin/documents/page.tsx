import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { canManageDocuments, canReviewDocuments, requireDocumentAdminAccess } from "@/features/documents/auth";
import { getDocumentAdminDashboard, type AdminDocumentActivity } from "@/features/documents/documents/queries";

function ActivityList({ title, rows }: { title: string; rows: AdminDocumentActivity[] }) {
  return <section className="card"><div className="card-header-row"><div><h2>{title}</h2><p>Recent employee document activity.</p></div></div>{rows.length === 0 ? <div className="empty-state"><strong>No recent activity</strong><span>New document events will appear here.</span></div> : <div className="document-version-list">{rows.map((row) => <article className="document-version-item" key={row.id}><div><strong>{row.title}</strong><span className="muted block">{row.employeeName} · {row.categoryName}</span></div><span>{new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.occurredAt))}</span>{row.documentId && <Link className="text-link" href={`/admin/documents/employees/${row.employeeId}`}>Open employee records</Link>}</article>)}</div>}</section>;
}

export default async function DocumentAdminPage() {
  const context = await requireDocumentAdminAccess();
  const dashboard = await getDocumentAdminDashboard();
  const metrics = [
    ["Pending review", dashboard.pendingReviewCount],
    ["Missing documents", dashboard.missingDocumentCount],
    ["Expiring soon", dashboard.expiringSoonCount],
    ["Expired", dashboard.expiredCount],
  ] as const;
  return <>
    <PageHeader title="Document Administration" description="Review employee submissions, manage document records, and monitor compliance." />
    <section className="document-summary-grid">{metrics.map(([label, value]) => <article className="card metric-card" key={label}><span>{label}</span><strong>{value}</strong></article>)}</section>
    <section className="document-admin-quick-links">
      {canReviewDocuments(context) && <Link className="card quick-link-card" href="/admin/documents/review"><strong>Review queue</strong><span>Process pending employee submissions.</span></Link>}
      {canManageDocuments(context) && <><Link className="card quick-link-card" href="/admin/documents/categories"><strong>Categories</strong><span>Configure versioned document rules.</span></Link><Link className="card quick-link-card" href="/admin/documents/requirements"><strong>Requirements</strong><span>Manage employee compliance targets.</span></Link></>}
      {context.role === "super_admin" && <Link className="card quick-link-card" href="/admin/documents/permissions"><strong>Permissions</strong><span>Grant independent review and manage access.</span></Link>}
    </section>
    <div className="document-detail-grid"><ActivityList title="Recent uploads" rows={dashboard.recentUploads} /><ActivityList title="Recent decisions" rows={dashboard.recentDecisions} /></div>
  </>;
}
