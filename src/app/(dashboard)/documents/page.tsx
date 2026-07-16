import { redirect } from "next/navigation";
import { DocumentList, type EmployeeDocumentListItem } from "@/components/documents/document-list";
import { DocumentNotificationList } from "@/components/documents/document-notification-list";
import { DocumentRequirementList, type EmployeeRequirementRow } from "@/components/documents/document-requirement-list";
import { DocumentSummaryCards } from "@/components/documents/document-summary-cards";
import { DocumentUploadForm } from "@/components/documents/document-upload-form";
import { PageHeader } from "@/components/page-header";
import { getDocumentPermissionContext } from "@/features/documents/auth";
import { listCurrentDocumentCategories } from "@/features/documents/categories/queries";
import { getOwnDocumentCompliance } from "@/features/documents/compliance/queries";
import { listOwnDocuments } from "@/features/documents/documents/queries";
import { listDocumentNotifications } from "@/features/documents/notifications/queries";
import type { DocumentExpirationStatus, DocumentRequirementStatus } from "@/features/documents/types";

function scalar(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

function positivePage(value: string | string[] | undefined) {
  const page = Number(scalar(value) ?? "1");
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function summarizeCompliance(rows: Array<{ status: string }>) {
  return {
    missing: rows.filter((row) => row.status === "missing").length,
    pendingReview: rows.filter((row) => row.status === "pending_review").length,
    approved: rows.filter((row) => row.status === "approved").length,
    expiringSoon: rows.filter((row) => row.status === "expiring_soon").length,
    expired: rows.filter((row) => row.status === "expired").length,
  };
}

function normalizeCompliance(rows: Array<Record<string, unknown>>): EmployeeRequirementRow[] {
  return rows.map((row) => ({
    categoryId: String(row.category_id),
    categoryName: String(row.category_name),
    requiredCount: Number(row.required_count),
    approvedCount: Number(row.approved_count),
    status: String(row.status) as DocumentRequirementStatus,
    expirationStatus: row.expiration_status ? String(row.expiration_status) as DocumentExpirationStatus : null,
    nearestExpirationDate: row.nearest_expiration_date ? String(row.nearest_expiration_date) : null,
    employeeUploadEnabled: Boolean(row.employee_upload_enabled),
  }));
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const context = await getDocumentPermissionContext();
  if (!context.employeeId) redirect("/dashboard?error=employee_profile_required");

  const [rawCompliance, documents, categories, notifications] = await Promise.all([
    getOwnDocumentCompliance(),
    listOwnDocuments({
      categoryId: scalar(query.category),
      reviewStatus: scalar(query.status),
      expirationStatus: scalar(query.expiration),
      page: positivePage(query.page),
    }),
    listCurrentDocumentCategories({ employeeUploadOnly: true }),
    listDocumentNotifications(),
  ]);
  const compliance = normalizeCompliance(rawCompliance as Array<Record<string, unknown>>);
  const uploadCategoryId = scalar(query.uploadCategory);

  return (
    <>
      <PageHeader title="Documents" description="View required records, submit documents, and track review or expiration status." />
      {scalar(query.success) && <p className="form-success">Your document record was updated successfully.</p>}
      {scalar(query.error) && <p className="form-error">The requested document action could not be completed.</p>}

      <DocumentSummaryCards counts={summarizeCompliance(compliance)} />

      <form className="card document-filter-grid" method="get" aria-label="Filter documents">
        <label><span>Category</span><select className="field" name="category" defaultValue={scalar(query.category) ?? ""}><option value="">All categories</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.currentVersion.name}</option>)}</select></label>
        <label><span>Review status</span><select className="field" name="status" defaultValue={scalar(query.status) ?? ""}><option value="">All statuses</option><option value="draft">Draft</option><option value="pending_review">Pending review</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="replacement_requested">Replacement requested</option></select></label>
        <label><span>Expiration</span><select className="field" name="expiration" defaultValue={scalar(query.expiration) ?? ""}><option value="">All expiration states</option><option value="valid">Valid</option><option value="expiring_soon">Expiring soon</option><option value="expired">Expired</option><option value="no_expiration">No expiration</option></select></label>
        <button className="btn secondary" type="submit">Apply filters</button>
      </form>

      <div className="document-portal-grid">
        <section className="content-stack">
          <DocumentRequirementList requirements={compliance} uploadCategoryId={uploadCategoryId} />
          <DocumentList documents={documents as EmployeeDocumentListItem[]} />
        </section>
        <aside className="content-stack">
          <DocumentUploadForm employeeId={context.employeeId} categories={categories} defaultCategoryId={uploadCategoryId} />
          <DocumentNotificationList notifications={notifications} />
        </aside>
      </div>
    </>
  );
}
