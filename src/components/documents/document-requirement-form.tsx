"use client";

import { useActionState, useState, useTransition } from "react";
import { archiveDocumentRequirement, restoreDocumentRequirement } from "@/app/(dashboard)/admin/documents/actions";
import type { DocumentCategorySummary } from "@/features/documents/categories/queries";
import type { DocumentActionState, DocumentRequirementTargetType } from "@/features/documents/types";

type Options = {
  categories: DocumentCategorySummary[];
  departments: Array<{ id: string; name: string }>;
  jobTitles: Array<{ id: string; title: string }>;
  employmentTypes: string[];
  employees: Array<{ id: string; first_name: string; last_name: string; employee_number: string }>;
};
type RequirementValue = { category_id: string; required_count: number; expired_satisfies: boolean; effective_from: string; effective_to: string | null; target_type: DocumentRequirementTargetType; target_id: string | null };

export function DocumentRequirementForm({ options, initial, action, title = "Create requirement" }: { options: Options; initial?: RequirementValue; action: (state: DocumentActionState, formData: FormData) => Promise<DocumentActionState>; title?: string }) {
  const [state, formAction, pending] = useActionState(action, {} as DocumentActionState);
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? options.categories[0]?.id ?? "");
  const [targetType, setTargetType] = useState<DocumentRequirementTargetType>(initial?.target_type ?? "all_active_employees");
  const category = options.categories.find((item) => item.id === categoryId);
  const targets = targetType === "department" ? options.departments.map((item) => [item.id, item.name])
    : targetType === "job_title" ? options.jobTitles.map((item) => [item.id, item.title])
      : targetType === "employment_type" ? options.employmentTypes.map((item) => [item, item.replaceAll("_", " ")])
        : targetType === "employee" ? options.employees.map((item) => [item.id, `${item.last_name}, ${item.first_name} · ${item.employee_number}`]) : [];
  return <form action={formAction} className="card document-requirement-form"><h2>{title}</h2><input type="hidden" name="cardinality" value={category?.currentVersion.cardinality ?? "multiple"} /><div className="document-detail-grid"><label><span>Category</span><select className="field" name="category_id" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required>{options.categories.map((item) => <option key={item.id} value={item.id}>{item.currentVersion.name}</option>)}</select></label><label><span>Required count</span><input className="field" type="number" name="required_count" min={1} defaultValue={initial?.required_count ?? 1} required /></label><label><span>Effective from</span><input className="field" type="date" name="effective_from" defaultValue={initial?.effective_from ?? new Date().toISOString().slice(0, 10)} required /></label><label><span>Effective to</span><input className="field" type="date" name="effective_to" defaultValue={initial?.effective_to ?? ""} /></label><label><span>Target type</span><select className="field" name="target_type" value={targetType} onChange={(event) => setTargetType(event.target.value as DocumentRequirementTargetType)}><option value="all_active_employees">All active employees</option><option value="employment_type">Employment type</option><option value="department">Department</option><option value="job_title">Job title</option><option value="employee">Employee</option></select></label>{targetType !== "all_active_employees" && <label><span>Target</span><select className="field" name="target_id" defaultValue={initial?.target_id ?? ""} required><option value="">Select target</option>{targets.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>}</div><label className="checkbox-row"><input type="checkbox" name="expired_satisfies" defaultChecked={initial?.expired_satisfies ?? false} /> Expired approved documents satisfy this requirement</label>{state.error && <p className="form-error">{state.error}</p>}{state.success && <p className="form-success">{state.success}</p>}<button className="btn primary" type="submit" disabled={pending}>{pending ? "Saving…" : title}</button></form>;
}

export function DocumentRequirementLifecycle({ requirementId, archivedAt }: { requirementId: string; archivedAt: string | null }) {
  const [state, setState] = useState<DocumentActionState>({}); const [pending, startTransition] = useTransition();
  return <div><button className={`btn ${archivedAt ? "secondary" : "danger"}`} type="button" disabled={pending} onClick={() => startTransition(async () => setState(archivedAt ? await restoreDocumentRequirement(requirementId) : await archiveDocumentRequirement(requirementId)))}>{pending ? "Updating…" : archivedAt ? "Restore" : "Archive"}</button>{state.error && <p className="form-error">{state.error}</p>}</div>;
}
