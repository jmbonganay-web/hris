import Link from "next/link";
import { DocumentCategoryForm } from "@/components/documents/document-category-form";
import { DocumentStatusBadge } from "@/components/documents/document-status-badge";
import { PageHeader } from "@/components/page-header";
import { createDocumentCategory } from "@/app/(dashboard)/admin/documents/actions";
import { requireDocumentManager } from "@/features/documents/auth";
import { listCurrentDocumentCategories } from "@/features/documents/categories/queries";

export default async function DocumentCategoriesPage() {
  const context = await requireDocumentManager();
  const categories = await listCurrentDocumentCategories({ includeArchived: true });
  return <>
    <PageHeader title="Document Categories" description="Manage stable category identities and immutable configurations." />
    <div className="document-portal-grid">
      <section className="content-stack">
        <div className="section-heading"><div><h2>Configured categories</h2><p>Current versions, upload authority, visibility, and lifecycle state.</p></div></div>
        {categories.length === 0 ? <div className="card empty-state"><strong>No document categories</strong><span>Create the first versioned category.</span></div> : <div className="document-requirement-grid">{categories.map((category) => <article className="card" key={category.id}><div className="card-header-row"><div><strong>{category.currentVersion.name}</strong><span className="muted block">{category.code}</span></div>{category.archivedAt ? <span className="badge danger">Archived</span> : <span className="badge success">Active</span>}</div><dl className="profile-summary-list compact"><div><dt>Version</dt><dd>{category.currentVersion.versionNumber}</dd></div><div><dt>Visibility</dt><dd>{category.currentVersion.defaultVisibility.replaceAll("_", " ")}</dd></div><div><dt>Employee upload</dt><dd>{category.currentVersion.employeeUploadEnabled ? "Enabled" : "Disabled"}</dd></div><div><dt>Cardinality</dt><dd>{category.currentVersion.cardinality}</dd></div><div><dt>Expiration</dt><dd>{category.currentVersion.expirationMode}</dd></div></dl><Link className="btn secondary" href={`/admin/documents/categories/${category.id}`}>View configuration</Link></article>)}</div>}
      </section>
      <aside><DocumentCategoryForm mode="create" action={createDocumentCategory} canUseSuperAdminVisibility={context.role === "super_admin"} /></aside>
    </div>
  </>;
}
