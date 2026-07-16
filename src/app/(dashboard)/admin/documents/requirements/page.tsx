import { createDocumentRequirement, reviseDocumentRequirement } from "@/app/(dashboard)/admin/documents/actions";
import { DocumentRequirementForm, DocumentRequirementLifecycle } from "@/components/documents/document-requirement-form";
import { PageHeader } from "@/components/page-header";
import { requireDocumentManager } from "@/features/documents/auth";
import { getRequirementFormOptions, listDocumentRequirements } from "@/features/documents/requirements/queries";
import type { DocumentRequirementTargetType } from "@/features/documents/types";

type RequirementRow = { id: string; category_id: string; category_name: string; required_count: number; expired_satisfies: boolean; effective_from: string; effective_to: string | null; target_type: DocumentRequirementTargetType; target_id: string | null; supersedes_requirement_id: string | null; archived_at: string | null; created_at: string };
const precedence: Record<DocumentRequirementTargetType, number> = { all_active_employees: 1, employment_type: 2, department: 3, job_title: 4, employee: 5 };
function targetDescription(row: RequirementRow, options: Awaited<ReturnType<typeof getRequirementFormOptions>>) {
  if (row.target_type === "all_active_employees") return "All active employees";
  if (row.target_type === "department") return options.departments.find((item) => item.id === row.target_id)?.name ?? row.target_id;
  if (row.target_type === "job_title") return options.jobTitles.find((item) => item.id === row.target_id)?.title ?? row.target_id;
  if (row.target_type === "employment_type") return row.target_id?.replaceAll("_", " ") ?? "Unknown";
  const employee = options.employees.find((item) => item.id === row.target_id);
  return employee ? `${employee.last_name}, ${employee.first_name} · ${employee.employee_number}` : row.target_id;
}

export default async function DocumentRequirementsPage() {
  await requireDocumentManager();
  const [rawRows, options] = await Promise.all([listDocumentRequirements({ includeArchived: true }), getRequirementFormOptions()]);
  const rows = rawRows as RequirementRow[];
  return <>
    <PageHeader title="Document Requirements" description="Configure requirement targeting, precedence, counts, and effective dates." />
    <div className="document-portal-grid">
      <section className="content-stack">{rows.length === 0 ? <div className="card empty-state"><strong>No requirements configured</strong><span>Create the first employee document requirement.</span></div> : rows.map((row) => <article className="card" id={`requirement-${row.id}`} key={row.id}><div className="card-header-row"><div><strong>{row.category_name}</strong><span className="muted block">{targetDescription(row, options)}</span></div>{row.archived_at ? <span className="badge danger">Archived</span> : <span className="badge success">Active</span>}</div><dl className="profile-summary-list compact"><div><dt>Precedence</dt><dd>{precedence[row.target_type]} · {row.target_type.replaceAll("_", " ")}</dd></div><div><dt>Required count</dt><dd>{row.required_count}</dd></div><div><dt>Effective</dt><dd>{row.effective_from} to {row.effective_to ?? "open-ended"}</dd></div><div><dt>Expired satisfies</dt><dd>{row.expired_satisfies ? "Yes" : "No"}</dd></div><div><dt>Revision history</dt><dd>{row.supersedes_requirement_id ? <a className="text-link" href={`#requirement-${row.supersedes_requirement_id}`}>Previous revision</a> : "Initial rule"}</dd></div></dl><div className="button-row"><DocumentRequirementLifecycle requirementId={row.id} archivedAt={row.archived_at} /></div>{!row.archived_at && <details><summary>Revise requirement</summary><DocumentRequirementForm options={options} initial={row} action={reviseDocumentRequirement.bind(null, row.id)} title="Create revised requirement" /></details>}</article>)}</section>
      <aside><DocumentRequirementForm options={options} action={createDocumentRequirement} /></aside>
    </div>
  </>;
}
