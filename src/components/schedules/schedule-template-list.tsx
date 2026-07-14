import Link from "next/link";
import type { ScheduleTemplateRecord } from "@/features/schedules/types";
import { ScheduleSummary } from "./schedule-summary";

export function ScheduleTemplateList({ templates }: { templates: ScheduleTemplateRecord[] }) {
  if (templates.length === 0) return <div className="empty">No work schedules match these filters.</div>;
  return <div className="schedule-card-grid">{templates.map((template) => <article className="card schedule-template-card" key={template.id}><div className="section-heading-row"><div><span className="muted">{template.code}</span><h2>{template.name}</h2></div><span className={`badge ${template.is_archived ? "warning" : "success"}`}>{template.is_archived ? "Archived" : "Active"}</span></div>{template.current_version ? <ScheduleSummary version={template.current_version} /> : <p className="form-error">No effective version is available.</p>}<p className="muted">{template.assigned_employee_count ?? 0} currently assigned · {template.upcoming_versions?.length ?? 0} upcoming version(s)</p><Link className="btn" href={`/settings/work-schedules/${template.id}`}>View schedule</Link></article>)}</div>;
}
