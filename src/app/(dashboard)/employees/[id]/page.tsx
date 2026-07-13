import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ArchiveButton } from "@/components/employees/archive-button";
import { getCurrentRole } from "@/features/employees/auth";
import { getEmployee } from "@/features/employees/queries";
import { archiveEmployee } from "../actions";
import { initials } from "@/lib/utils";

export default async function EmployeeDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const query = await searchParams;
  const [employee, role] = await Promise.all([getEmployee(id), getCurrentRole()]);
  if (!employee) notFound();
  const canManage = role === "super_admin" || role === "hr_admin";
  const name = `${employee.first_name} ${employee.last_name}`.trim();
  const success = typeof query.success === "string" ? query.success : "";
  const error = typeof query.error === "string" ? query.error : "";
  const archiveAction = archiveEmployee.bind(null, employee.id);

  return <>
    <PageHeader title={name} description={`${employee.employee_number} · ${employee.job_title?.title ?? "Unassigned role"}`} action={<div className="header-actions"><Link className="btn" href="/employees">Back</Link>{canManage && <Link className="btn primary" href={`/employees/${employee.id}/edit`}>Edit employee</Link>}</div>} />
    {success === "created" && <p className="form-success">Employee created successfully.</p>}
    {success === "updated" && <p className="form-success">Employee updated successfully.</p>}
    {error === "archive_failed" && <p className="form-error">The employee could not be archived.</p>}

    <div className="profile-grid">
      <div className="card employee-profile-card"><div className="profile-avatar">{initials(name)}</div><h2>{name}</h2><p className="muted">{employee.work_email}</p><StatusBadge value={employee.employment_status.replace("_", " ")} /></div>
      <div className="card detail-card"><h2>Employment details</h2><dl className="detail-list"><div><dt>Employee ID</dt><dd>{employee.employee_number}</dd></div><div><dt>Job title</dt><dd>{employee.job_title?.title ?? "Unassigned"}</dd></div><div><dt>Department</dt><dd>{employee.department?.name ?? "Unassigned"}</dd></div><div><dt>Employment type</dt><dd>{employee.employment_type.replace("_", " ")}</dd></div><div><dt>Hire date</dt><dd>{new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(new Date(`${employee.hire_date}T00:00:00`))}</dd></div><div><dt>Work location</dt><dd>{employee.work_location || "Not provided"}</dd></div></dl></div>
      <div className="card detail-card"><h2>Contact information</h2><dl className="detail-list"><div><dt>Work email</dt><dd>{employee.work_email}</dd></div><div><dt>Personal email</dt><dd>{employee.personal_email || "Not provided"}</dd></div><div><dt>Phone</dt><dd>{employee.phone || "Not provided"}</dd></div></dl></div>
      {canManage && <div className="card danger-zone"><div><h2>Archive employee</h2><p className="muted">Removes this employee from the active directory without permanently deleting the record.</p></div><ArchiveButton action={archiveAction} /></div>}
    </div>
  </>;
}
