import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ArchiveScheduleButton } from "@/components/schedules/archive-schedule-button";
import { ScheduleSummary } from "@/components/schedules/schedule-summary";
import { requireScheduleAdmin } from "@/features/schedules/auth";
import { getScheduleTemplateDetails } from "@/features/schedules/queries";
import { setScheduleArchived } from "../actions";

export default async function WorkScheduleDetailsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireScheduleAdmin();
  const { id } = await params;
  const details = await getScheduleTemplateDetails(id);
  if (!details) notFound();
  const query = await searchParams;
  const success = typeof query.success === "string" ? query.success : "";
  const archiveAction = setScheduleArchived.bind(null, id, !details.template.is_archived);
  return <><PageHeader title={details.template.name} description={`${details.template.code} · ${details.template.is_archived ? "Archived" : "Active"}`} action={<div className="header-actions"><Link className="btn" href="/settings/work-schedules">Back</Link><Link className="btn" href={`/settings/work-schedules/${id}/edit`}>Edit information</Link><Link className="btn primary" href={`/settings/work-schedules/${id}/versions/new`}>Create version</Link></div>} />{success && <p className="form-success">Schedule changes saved successfully.</p>}<div className="profile-grid organization-detail-grid"><section className="card detail-card"><h2>Template information</h2><dl className="detail-list"><div><dt>Code</dt><dd>{details.template.code}</dd></div><div><dt>Name</dt><dd>{details.template.name}</dd></div><div><dt>Status</dt><dd>{details.template.is_archived ? "Archived" : "Active"}</dd></div><div><dt>Description</dt><dd>{details.template.description || "No description"}</dd></div></dl></section><section className="card detail-card"><h2>Current schedule rules</h2>{details.template.current_version ? <><p className="muted">Effective {details.template.current_version.effective_date}</p><ScheduleSummary version={details.template.current_version} /></> : <p className="form-error">No effective version is available.</p>}</section><section className="card detail-card full"><h2>Version history</h2><div className="schedule-card-grid">{details.template.version_history?.map((version) => <article className="card" key={version.id}><strong>Effective {version.effective_date}</strong><ScheduleSummary version={version} />{version.change_reason && <p className="muted">Reason: {version.change_reason}</p>}</article>)}</div></section><section className="card detail-card full"><h2>Assigned employees</h2>{details.assignments.length ? <ul>{details.assignments.map((assignment) => <li key={assignment.id}>{assignment.employee?.first_name} {assignment.employee?.last_name} · {assignment.effective_start_date}{assignment.effective_end_date ? ` to ${assignment.effective_end_date}` : " onward"}</li>)}</ul> : <p className="muted">No employees are assigned.</p>}</section><section className="card danger-zone full"><div><h2>{details.template.is_archived ? "Restore schedule" : "Archive schedule"}</h2><p className="muted">Historical assignments remain valid.</p></div><ArchiveScheduleButton action={archiveAction} archived={details.template.is_archived} /></section></div></>;
}
