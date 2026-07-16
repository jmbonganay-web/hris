"use client";

import { useActionState } from "react";
import type { LeaveActionState, LeaveTypeOption } from "@/features/leave/types";
import type { EmployeeOption } from "@/features/organization/types";

export function EmployeeLeaveSettingForm({
  employees,
  leaveTypes,
  defaultYear,
  action,
}: {
  employees: EmployeeOption[];
  leaveTypes: LeaveTypeOption[];
  defaultYear: number;
  action: (state: LeaveActionState, formData: FormData) => Promise<LeaveActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="card form-card">
      <h2 className="card-title">Employee leave setting</h2>
      <div className="form-grid">
        <label><span>Leave year</span><input className="field" type="number" name="leave_year" min="2000" max="2200" defaultValue={defaultYear} required /></label>
        <label><span>Employee</span><select className="field" name="employee_id" required><option value="">Select employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.last_name}, {employee.first_name} · {employee.employee_number}</option>)}</select></label>
        <label><span>Leave type</span><select className="field" name="leave_type_id" required><option value="">Select leave type</option>{leaveTypes.map((item) => <option key={item.leaveTypeId} value={item.leaveTypeId}>{item.name}</option>)}</select></label>
        <label><span>Annual allocation override</span><input className="field" type="number" name="annual_allocation_override_units" min="0" step="0.5" placeholder="Use leave-type default" /></label>
      </div>
      <label className="checkbox-row"><input type="checkbox" name="is_excluded" /> Exclude this employee from the leave type</label>
      <label><span>Change reason <span className="muted">(required, private)</span></span><textarea className="field" name="private_reason" rows={4} maxLength={1000} required /></label>
      {state.error && <p className="form-error">{state.error}</p>}
      {state.success && <p className="form-success">{state.success}</p>}
      <div className="form-actions"><button className="btn primary" type="submit" disabled={pending}>{pending ? "Saving…" : "Save employee setting"}</button></div>
    </form>
  );
}
