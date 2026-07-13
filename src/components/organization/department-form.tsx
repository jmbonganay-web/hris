"use client";

import Link from "next/link";
import { useActionState } from "react";
import type {
  DepartmentRecord,
  EmployeeOption,
  OrganizationActionState,
} from "@/features/organization/types";

const initialState: OrganizationActionState = {};

function ErrorText({ message }: { message?: string }) {
  return message ? <span className="field-error">{message}</span> : null;
}

export function DepartmentForm({
  action,
  employees,
  department,
}: {
  action: (state: OrganizationActionState, formData: FormData) => Promise<OrganizationActionState>;
  employees: EmployeeOption[];
  department?: DepartmentRecord;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="card employee-form">
      {state.error && <p className="form-error" role="alert">{state.error}</p>}

      <section className="form-section">
        <div>
          <h2>Department details</h2>
          <p className="muted">Define how this team appears across employee records and organization settings.</p>
        </div>
        <div className="form-grid">
          <label>
            <span>Department name *</span>
            <input className="field" name="name" defaultValue={department?.name} aria-invalid={Boolean(errors.name)} />
            <ErrorText message={errors.name} />
          </label>
          <label>
            <span>Department code *</span>
            <input className="field" name="code" defaultValue={department?.code ?? ""} maxLength={20} aria-invalid={Boolean(errors.code)} />
            <ErrorText message={errors.code} />
          </label>
          <label className="form-field-wide">
            <span>Description</span>
            <textarea className="field organization-textarea" name="description" defaultValue={department?.description ?? ""} maxLength={500} aria-invalid={Boolean(errors.description)} />
            <ErrorText message={errors.description} />
          </label>
          <label>
            <span>Department head</span>
            <select className="field" name="department_head_id" defaultValue={department?.department_head_id ?? ""} aria-invalid={Boolean(errors.department_head_id)}>
              <option value="">Not assigned</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.first_name} {employee.last_name} · {employee.employee_number}
                </option>
              ))}
            </select>
            <ErrorText message={errors.department_head_id} />
          </label>
          <label className="checkbox-field">
            <input type="checkbox" name="is_active" defaultChecked={department?.is_active ?? true} />
            <span><strong>Active department</strong><small>Active departments are available when assigning employees and job titles.</small></span>
          </label>
        </div>
      </section>

      <div className="form-actions">
        <Link className="btn" href={department ? `/settings/departments/${department.id}` : "/settings/departments"}>Cancel</Link>
        <button className="btn primary" disabled={pending}>
          {pending ? "Saving…" : department ? "Save changes" : "Create department"}
        </button>
      </div>
    </form>
  );
}
