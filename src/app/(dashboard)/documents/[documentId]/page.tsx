import { notFound } from "next/navigation";
import { DocumentDetailPanel } from "@/components/documents/document-detail-panel";
import { DocumentUploadForm } from "@/components/documents/document-upload-form";
import { DocumentVersionHistory, type EmployeeDocumentVersion } from "@/components/documents/document-version-history";
import { PageHeader } from "@/components/page-header";
import { getDocumentPermissionContext } from "@/features/documents/auth";
import { listCurrentDocumentCategories } from "@/features/documents/categories/queries";
import { getOwnDocumentDetail } from "@/features/documents/documents/queries";
import type { DocumentReviewStatus } from "@/features/documents/types";

type EmployeeDetailVersion = EmployeeDocumentVersion & {
  title: string;
  referenceNumber?: string | null;
  issueDate?: string | null;
  expirationDate?: string | null;
  issuingOrganization?: string | null;
  notes?: string | null;
  tags?: string[];
  customMetadata?: Record<string, unknown>;
};

type EmployeeDocumentDetail = {
  id: string;
  categoryId: string;
  categoryName: string;
  title: string;
  latestStatus: DocumentReviewStatus;
  employeeUploadEnabled: boolean;
  versions: EmployeeDetailVersion[];
};

export default async function DocumentDetailPage({ params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  let detail: EmployeeDocumentDetail;
  try {
    detail = await getOwnDocumentDetail(documentId) as EmployeeDocumentDetail;
  } catch (error) {
    if (error instanceof Error && error.message.includes("DOCUMENT_NOT_FOUND")) notFound();
    throw error;
  }
  const latest = detail.versions[0];
  if (!latest) notFound();

  const context = await getDocumentPermissionContext();
  const replacementCategories = detail.latestStatus === "replacement_requested" && detail.employeeUploadEnabled
    ? (await listCurrentDocumentCategories({ employeeUploadOnly: true })).filter((category) => category.id === detail.categoryId)
    : [];

  return (
    <>
      <PageHeader title={detail.title} description={`${detail.categoryName} document details and version history.`} />
      <div className="document-detail-grid">
        <DocumentDetailPanel title={detail.title} categoryName={detail.categoryName} version={latest} />
        <DocumentVersionHistory versions={detail.versions} />
        {detail.latestStatus === "replacement_requested" && detail.employeeUploadEnabled && context.employeeId && replacementCategories.length > 0 && (
          <DocumentUploadForm
            employeeId={context.employeeId}
            categories={replacementCategories}
            defaultCategoryId={detail.categoryId}
            replacementDocumentId={detail.id}
            supersedesVersionId={latest.id}
          />
        )}
      </div>
    </>
  );
}
