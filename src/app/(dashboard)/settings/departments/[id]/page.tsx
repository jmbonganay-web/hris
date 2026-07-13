import Link from "next/link";
import { notFound } from "next/navigation";
import { ArchiveOrganizationButton } from "@/components/organization/archive-organization-button";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { requireOrganizationAdmin } from "@/features/organization/auth";
import { getDepartment } from "@/features/organization/queries";
import { archiveDepartment } from "../actions";

export default async function DepartmentDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireOrganizationAdmin();
  const { id } = await params;
  const query = await searchParams;
  const department = await getDepartment(id);
  if (!department) notFound();
  const success = typeof query.success === "string" ? query.success : "";
  const error = typeof query.error === "string" ? query.error : "";
  const status = department.archived_at ? "Archived" : department.is_active ? "Active" : "Inactive";
  const archiveAction = archiveDepartment.bind(null, department.id);

  return <>
    <PageHeader title={department.name} description={`${department.code || "No code"} · ${department.employee_count} active employee${department.employee_count === 1 ? "" : "s"}`} action={<div className="header-actions"><Link className="btn" href="/settings/departments">Back</Link>{!department.archived_at && <Link className="btn primary" href={`/settings/departments/${department.id}/edit`}>Edit department</Link>}</div>} />
    {success === "created" && <p className="form-success">Department created successfully.</p>}
    {success === "updated" && <p className="form-success">Department updated successfully.</p>}
    {error === "archive_failed" && <p className="form-error">The department could not be archived.</p>}

    <div className="profile-grid organization-detail-grid">
      <div className="card detail-card"><h2>Department details</h2><dl className="detail-list"><div><dt>Name</dt><dd>{department.name}</dd></div><div><dt>Code</dt><dd>{department.code || "Not provided"}</dd></div><div><dt>Status</dt><dd><StatusBadge value={status} /></dd></div><div><dt>Employees</dt><dd>{department.employee_count}</dd></div><div><dt>Department head</dt><dd>{department.department_head ? `${department.department_head.first_name} ${department.department_head.last_name}` : "Not assigned"}</dd></div><div><dt>Created</dt><dd>{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(department.created_at))}</dd></div></dl></div>
      <div className="card detail-card"><h2>Description</h2><p className="organization-long-copy">{department.description || "No description has been added for this department."}</p></div>
      {!department.archived_at && <div className="card danger-zone"><div><h2>Archive department</h2><p className="muted">Removes this department from future selectors while preserving existing employee and job-title references.</p></div><ArchiveOrganizationButton action={archiveAction} label="department" assignedCount={department.employee_count} /></div>}
    </div>
  </>;
}
