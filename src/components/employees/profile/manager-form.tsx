"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { EmployeeActionState, EmployeeRecord, ManagerOption } from "@/features/employees/types";

const initialState: EmployeeActionState = {};

export function ManagerForm({
  employee,
  managers,
  action,
}: {
  employee: EmployeeRecord;
  managers: ManagerOption[];
  action: (state: EmployeeActionState, formData: FormData) => Promise<EmployeeActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form action={formAction} className="card manager-form">
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <label>
        <span>Manager</span>
        <select className="field" name="manager_id" defaultValue={employee.manager_id ?? ""} aria-invalid={Boolean(state.fieldErrors?.manager_id)}>
          <option value="">No manager assigned</option>
          {managers.map((manager) => {
            const unavailable = manager.archived_at || manager.employment_status !== "active";
            return <option key={manager.id} value={manager.id}>{manager.first_name} {manager.last_name} · {manager.job_title?.title ?? manager.employee_number}{unavailable ? " (Historical)" : ""}</option>;
          })}
        </select>
        {state.fieldErrors?.manager_id && <span className="field-error">{state.fieldErrors.manager_id}</span>}
        <small className="muted">Only active employees can be newly assigned. Circular reporting chains are blocked.</small>
      </label>
      <div className="form-actions"><Link className="btn" href={`/employees/${employee.id}?tab=employment`}>Cancel</Link><button className="btn primary" disabled={pending}>{pending ? "Saving…" : "Save manager"}</button></div>
    </form>
  );
}
