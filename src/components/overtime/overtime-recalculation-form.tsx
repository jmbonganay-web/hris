"use client";

import { useActionState, useState } from "react";
import type { AttendanceEmployeeSummary } from "@/features/attendance/types";
import type { OvertimeRecalculationActionState } from "@/features/overtime/types";

const initialState: OvertimeRecalculationActionState = {};

export function OvertimeRecalculationForm({
  action,
  employees,
  companyDate,
}: {
  action: (
    state: OvertimeRecalculationActionState,
    formData: FormData,
  ) => Promise<OvertimeRecalculationActionState>;
  employees: AttendanceEmployeeSummary[];
  companyDate: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [scope, setScope] = useState(state.values?.scope ?? "one_employee");

  return (
    <form
      action={formAction}
      className="card form-card"
      onSubmit={(event) => {
        const confirmed = window.confirm(
          "Recalculate overtime?\n\nPrevious detections and approval items remain in history. Changed results supersede active items and newly qualifying results return to Pending.",
        );
        if (!confirmed) event.preventDefault();
      }}
    >
      <div className="form-grid">
        <label>
          <span>Employee scope</span>
          <select
            className="field"
            name="scope"
            value={scope}
            onChange={(event) =>
              setScope(event.target.value as "one_employee" | "all_active")
            }
          >
            <option value="one_employee">One employee</option>
            <option value="all_active">All active employees</option>
          </select>
          {state.fieldErrors?.scope && <span className="form-error">{state.fieldErrors.scope}</span>}
        </label>
        <label>
          <span>Employee</span>
          <select
            className="field"
            name="employee_id"
            defaultValue={state.values?.employeeId ?? ""}
            disabled={scope === "all_active"}
          >
            <option value="">Select employee</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.employee_number} · {employee.first_name} {employee.last_name}
              </option>
            ))}
          </select>
          {state.fieldErrors?.employee_id && <span className="form-error">{state.fieldErrors.employee_id}</span>}
        </label>
        <label>
          <span>Start date</span>
          <input
            className="field"
            type="date"
            name="start_date"
            max={companyDate}
            defaultValue={state.values?.startDate ?? companyDate}
            required
          />
          {state.fieldErrors?.start_date && <span className="form-error">{state.fieldErrors.start_date}</span>}
        </label>
        <label>
          <span>End date</span>
          <input
            className="field"
            type="date"
            name="end_date"
            max={companyDate}
            defaultValue={state.values?.endDate ?? companyDate}
            required
          />
          {state.fieldErrors?.end_date && <span className="form-error">{state.fieldErrors.end_date}</span>}
        </label>
        <label className="full">
          <span>Recalculation reason</span>
          <textarea className="field" name="reason" maxLength={1000} rows={4} required />
          {state.fieldErrors?.reason && <span className="form-error">{state.fieldErrors.reason}</span>}
        </label>
      </div>
      <p className="info-callout">
        Attendance calculation revisions are not modified. The active finalized attendance result is reused, and only changed overtime results create new immutable revisions.
      </p>
      {state.error && <p className="form-error">{state.error}</p>}
      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? "Recalculating…" : "Recalculate overtime"}
      </button>
    </form>
  );
}
