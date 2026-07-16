import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { DocumentAccessButton } from "@/components/documents/document-access-button";
import { DocumentArchiveForm } from "@/components/documents/document-archive-form";
import { DocumentDeleteForm } from "@/components/documents/document-delete-form";
import { DocumentRestoreVersionForm } from "@/components/documents/document-restore-version-form";
import { DocumentStatusBadge } from "@/components/documents/document-status-badge";
import { DocumentUploadForm } from "@/components/documents/document-upload-form";
import { ProfileTabs } from "@/components/employees/profile/profile-tabs";
import { PageHeader } from "@/components/page-header";
import { canManageDocuments, requireDocumentAdminAccess } from "@/features/documents/auth";
import { listCurrentDocumentCategories } from "@/features/documents/categories/queries";
import { getEmployeeDocumentCompliance } from "@/features/documents/compliance/queries";
import { getDocumentDetailForHr, listEmployeeDocumentsForHr } from "@/features/documents/documents/queries";
import type { DocumentExpirationStatus, DocumentRequirementStatus, DocumentReviewStatus } from "@/features/documents/types";
import { getEmployee } from "@/features/employees/queries";

type HrDocumentListRow = {
  documentId: string; categoryId: string; categoryName: string; title: string; effectiveVisibility: string;
  reviewStatus: DocumentReviewStatus; expirationDate: string | null; versionNumber: number; activeVersionId: string | null;
  archivedAt: string | null; updatedAt: string;
};
type HrDocumentVersion = {
  id: string; versionNumber: number; reviewStatus: DocumentReviewStatus; title: string; mimeType: string;
  submittedAt: string | null; createdAt: string; internalReason: string | null; employeeMessage: string | null; canAccessFile: boolean;
};
type HrDocumentDetail = { id: string; employeeId: string; categoryName: string; visibility: string; archivedAt: string | null; activeVersionId: string | null; versions: HrDocumentVersion[]; auditHistory: Array<{ id: string; action: string; createdAt: string }> };

function scalar(value: string | string[] | undefined) { return typeof value === "string" ? value : undefined; }
function complianceLabel(row: Record<string, unknown>) { return { categoryId: String(row.category_id), categoryName: String(row.category_name), status: String(row.status) as DocumentRequirementStatus, expirationStatus: row.expiration_status ? String(row.expiration_status) as DocumentExpirationStatus : null, requiredCount: Number(row.required_count), approvedCount: Number(row.approved_count) }; }

export default async function EmployeeDocumentAdminPage({ params, searchParams }: { params: Promise<{ employeeId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await requireDocumentAdminAccess();
  const { employeeId } = await params;
  const query = await searchParams;
  const employee = await getEmployee(employeeId);
  if (!employee) notFound();
  const includeArchived = scalar(query.archived) === "1";
  const [documentRows, rawCompliance, allCategories] = await Promise.all([
    listEmployeeDocumentsForHr(employeeId, { includeArchived }),
    getEmployeeDocumentCompliance(employeeId),
    listCurrentDocumentCategories(),
  ]);
  const rows = documentRows as HrDocumentListRow[];
  const details = await Promise.all(rows.map((row) => getDocumentDetailForHr(row.documentId) as Promise<HrDocumentDetail>));
  const categories = context.role === "super_admin" ? allCategories : allCategories.filter((category) => category.currentVersion.defaultVisibility !== "super_admin_only");
  const canManage = canManageDocuments(context);
  const compliance = (rawCompliance as Array<Record<string, unknown>>).map(complianceLabel);

  return <>
    <PageHeader title={`${employee.first_name} ${employee.last_name} · Documents`} description={`${employee.employee_number} · ${employee.work_email}`} />
    <ProfileTabs employeeId={employeeId} active="documents" canManage />
    <section className="document-summary-grid">{compliance.map((item) => <article className="card" key={item.categoryId}><div className="card-header-row"><strong>{item.categoryName}</strong><DocumentStatusBadge value={item.status} /></div><span>{item.approvedCount} of {item.requiredCount} approved</span>{item.expirationStatus && <DocumentStatusBadge value={item.expirationStatus} />}</article>)}</section>
    <div className="document-portal-grid">
      <section className="content-stack">
        <div className="card-header-row"><div><h2>Employee document records</h2><p>Authorized active and historical versions.</p></div><a className="btn secondary" href={includeArchived ? `/admin/documents/employees/${employeeId}` : `/admin/documents/employees/${employeeId}?archived=1`}>{includeArchived ? "Hide archived" : "Include archived"}</a></div>
        {details.length === 0 ? <div className="card empty-state"><strong>No employee documents</strong><span>No authorized document records are available.</span></div> : details.map((detail) => {
          const latest = detail.versions[0];
          return <article className="card document-admin-record" key={detail.id}>
            <div className="card-header-row"><div><h3>{latest?.title ?? detail.categoryName}</h3><p>{detail.categoryName} · {detail.visibility.replaceAll("_", " ")}</p></div>{latest && <DocumentStatusBadge value={latest.reviewStatus} />}</div>
            <div className="document-version-list">{detail.versions.map((version) => <div className="document-version-item" key={version.id}><div><strong>Version {version.versionNumber}</strong><span className="muted block">{version.submittedAt ?? version.createdAt}</span></div><DocumentStatusBadge value={version.reviewStatus} />{version.id === detail.activeVersionId && <span className="badge success">Active</span>}{version.internalReason && <p><strong>Internal reason:</strong> {version.internalReason}</p>}{version.employeeMessage && <p><strong>Employee message:</strong> {version.employeeMessage}</p>}{version.canAccessFile && <div className="button-row"><DocumentAccessButton versionId={version.id} mimeType={version.mimeType} disposition="preview" /><DocumentAccessButton versionId={version.id} mimeType={version.mimeType} disposition="download" /></div>}</div>)}</div>
            {canManage && <div className="document-detail-grid">{!detail.archivedAt && <DocumentRestoreVersionForm documentId={detail.id} employeeId={employeeId} activeVersionId={detail.activeVersionId} versions={detail.versions} requestId={randomUUID()} />}<DocumentArchiveForm documentId={detail.id} employeeId={employeeId} archivedAt={detail.archivedAt} requestId={randomUUID()} />{context.role === "super_admin" && <DocumentDeleteForm documentId={detail.id} employeeId={employeeId} requestId={randomUUID()} />}</div>}
            {detail.auditHistory.length > 0 && <details><summary>Audit history</summary><ul>{detail.auditHistory.map((event) => <li key={event.id}>{event.action.replaceAll("_", " ")} · {event.createdAt}</li>)}</ul></details>}
          </article>;
        })}
      </section>
      <aside className="content-stack">
        {canManage ? <DocumentUploadForm employeeId={employeeId} categories={categories} source="hr" allowVisibilityOverride allowImmediateApproval canUseSuperAdminVisibility={context.role === "super_admin"} /> : <section className="card empty-state"><strong>Read-only document access</strong><span>Your account does not have document management permission.</span></section>}
      </aside>
    </div>
  </>;
}
