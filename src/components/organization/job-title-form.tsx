"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { JobTitleRecord, OrganizationActionState } from "@/features/organization/types";

const initialState: OrganizationActionState = {};

type DepartmentOption = {
  id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  archived_at: string | null;
};

function ErrorText({ message }: { message?: string }) {
  return message ? <span className="field-error">{message}</span> : null;
}

export function JobTitleForm({
  action,
  departments,
  jobTitle,
}: {
  action: (state: OrganizationActionState, formData: FormData) => Promise<OrganizationActionState>;
  departments: DepartmentOption[];
  jobTitle?: JobTitleRecord;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="card employee-form">
      {state.error && <p className="form-error" role="alert">{state.error}</p>}

      <section className="form-section">
        <div>
          <h2>Job-title details</h2>
          <p className="muted">Create a reusable role that can be assigned to employees within a department.</p>
        </div>
        <div className="form-grid">
          <label>
            <span>Job title *</span>
            <input className="field" name="title" defaultValue={jobTitle?.title} aria-invalid={Boolean(errors.title)} />
            <ErrorText message={errors.title} />
          </label>
          <label>
            <span>Department</span>
            <select className="field" name="department_id" defaultValue={jobTitle?.department_id ?? ""} aria-invalid={Boolean(errors.department_id)}>
              <option value="">Organization-wide</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}{department.code ? ` · ${department.code}` : ""}{department.archived_at ? " (Archived)" : !department.is_active ? " (Inactive)" : ""}
                </option>
              ))}
            </select>
            <ErrorText message={errors.department_id} />
          </label>
          <label className="form-field-wide">
            <span>Description</span>
            <textarea className="field organization-textarea" name="description" defaultValue={jobTitle?.description ?? ""} maxLength={500} aria-invalid={Boolean(errors.description)} />
            <ErrorText message={errors.description} />
          </label>
          <label className="checkbox-field">
            <input type="checkbox" name="is_active" defaultChecked={jobTitle?.is_active ?? true} />
            <span><strong>Active job title</strong><small>Active job titles can be assigned to new and existing employees.</small></span>
          </label>
        </div>
      </section>

      <div className="form-actions">
        <Link className="btn" href={jobTitle ? `/settings/job-titles/${jobTitle.id}` : "/settings/job-titles"}>Cancel</Link>
        <button className="btn primary" disabled={pending}>
          {pending ? "Saving…" : jobTitle ? "Save changes" : "Create job title"}
        </button>
      </div>
    </form>
  );
}
