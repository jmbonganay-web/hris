import Link from "next/link";
import { notFound } from "next/navigation";
import { ArchiveOrganizationButton } from "@/components/organization/archive-organization-button";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { requireOrganizationAdmin } from "@/features/organization/auth";
import { getJobTitle } from "@/features/organization/queries";
import { archiveJobTitle } from "../actions";

export default async function JobTitleDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireOrganizationAdmin();
  const { id } = await params;
  const query = await searchParams;
  const jobTitle = await getJobTitle(id);
  if (!jobTitle) notFound();
  const success = typeof query.success === "string" ? query.success : "";
  const error = typeof query.error === "string" ? query.error : "";
  const status = jobTitle.archived_at ? "Archived" : jobTitle.is_active ? "Active" : "Inactive";
  const archiveAction = archiveJobTitle.bind(null, jobTitle.id);

  return <>
    <PageHeader title={jobTitle.title} description={`${jobTitle.department?.name ?? "Organization-wide"} · ${jobTitle.employee_count} active employee${jobTitle.employee_count === 1 ? "" : "s"}`} action={<div className="header-actions"><Link className="btn" href="/settings/job-titles">Back</Link>{!jobTitle.archived_at && <Link className="btn primary" href={`/settings/job-titles/${jobTitle.id}/edit`}>Edit job title</Link>}</div>} />
    {success === "created" && <p className="form-success">Job title created successfully.</p>}
    {success === "updated" && <p className="form-success">Job title updated successfully.</p>}
    {error === "archive_failed" && <p className="form-error">The job title could not be archived.</p>}

    <div className="profile-grid organization-detail-grid">
      <div className="card detail-card"><h2>Job-title details</h2><dl className="detail-list"><div><dt>Title</dt><dd>{jobTitle.title}</dd></div><div><dt>Department</dt><dd>{jobTitle.department?.name ?? "Organization-wide"}</dd></div><div><dt>Status</dt><dd><StatusBadge value={status} /></dd></div><div><dt>Employees</dt><dd>{jobTitle.employee_count}</dd></div><div><dt>Created</dt><dd>{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(jobTitle.created_at))}</dd></div></dl></div>
      <div className="card detail-card"><h2>Description</h2><p className="organization-long-copy">{jobTitle.description || "No description has been added for this job title."}</p></div>
      {!jobTitle.archived_at && <div className="card danger-zone"><div><h2>Archive job title</h2><p className="muted">Removes this title from future employee assignments while preserving current employee records.</p></div><ArchiveOrganizationButton action={archiveAction} label="job title" assignedCount={jobTitle.employee_count} /></div>}
    </div>
  </>;
}
