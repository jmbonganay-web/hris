import { notFound } from "next/navigation";
import { createDocumentCategoryVersion } from "@/app/(dashboard)/admin/documents/actions";
import { DocumentCategoryForm } from "@/components/documents/document-category-form";
import { DocumentCategoryVersionList } from "@/components/documents/document-category-version-list";
import { PageHeader } from "@/components/page-header";
import { requireDocumentManager } from "@/features/documents/auth";
import { getDocumentCategoryDetail } from "@/features/documents/categories/queries";

export default async function DocumentCategoryDetailPage({ params }: { params: Promise<{ categoryId: string }> }) {
  const context = await requireDocumentManager();
  const { categoryId } = await params;
  let category: Awaited<ReturnType<typeof getDocumentCategoryDetail>>;
  try { category = await getDocumentCategoryDetail(categoryId); }
  catch (error) { if (error instanceof Error && error.message.includes("DOCUMENT_CATEGORY_NOT_FOUND")) notFound(); throw error; }
  const current = category.currentVersion;
  const action = createDocumentCategoryVersion.bind(null, category.id, current.versionNumber);
  return <>
    <PageHeader title={current.name} description={`${category.code} · current configuration version ${current.versionNumber}`} />
    <div className="document-detail-grid">
      {current.defaultVisibility === "super_admin_only" && context.role !== "super_admin" ? <section className="card empty-state"><strong>Super Admin configuration</strong><span>Only a Super Admin can publish revisions for a Super Admin-only category.</span></section> : <DocumentCategoryForm mode="revision" initial={{ id: category.id, code: category.code, name: current.name, description: current.description, defaultVisibility: current.defaultVisibility, employeeUploadEnabled: current.employeeUploadEnabled, cardinality: current.cardinality, allowedMimeTypes: current.allowedMimeTypes, expirationMode: current.expirationMode, defaultValidityMonths: current.defaultValidityMonths, expiringSoonDays: current.expiringSoonDays, retentionMonthsAfterSeparation: current.retentionMonthsAfterSeparation, fields: current.fields }} action={action} canUseSuperAdminVisibility={context.role === "super_admin"} />}
      <DocumentCategoryVersionList categoryId={category.id} archivedAt={category.archivedAt} versions={category.versions as unknown as Array<Record<string, unknown>>} />
    </div>
  </>;
}
