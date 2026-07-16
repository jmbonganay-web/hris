"use client";

import { useActionState, useMemo, useState } from "react";
import type { LeaveActionState, LeaveBalanceSummary, LeaveTypeOption } from "@/features/leave/types";
import type { EmployeeOption } from "@/features/organization/types";

export function LeaveBalanceAdjustmentForm({
  employees,
  leaveTypes,
  balances,
  defaultYear,
  action,
}: {
  employees: EmployeeOption[];
  leaveTypes: LeaveTypeOption[];
  balances: LeaveBalanceSummary[];
  defaultYear: number;
  action: (state: LeaveActionState, formData: FormData) => Promise<LeaveActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [leaveTypeId, setLeaveTypeId] = useState(leaveTypes.find((item) => item.isBalanceTracked)?.leaveTypeId ?? "");
  const [year, setYear] = useState(defaultYear);
  const [units, setUnits] = useState(0.5);
  const available = useMemo(() => balances.find((balance) => balance.employeeId === employeeId && balance.leaveTypeId === leaveTypeId && balance.leaveYear === year)?.availableUnits ?? null, [balances, employeeId, leaveTypeId, year]);
  const debitTooLarge = units < 0 && available !== null && Math.abs(units) > available;

  return (
    <form action={formAction} className="card form-card">
      <h2 className="card-title">Adjust leave balance</h2>
      <div className="form-grid">
        <label><span>Employee</span><select className="field" name="employee_id" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} required>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.last_name}, {employee.first_name} · {employee.employee_number}</option>)}</select></label>
        <label><span>Leave type</span><select className="field" name="leave_type_id" value={leaveTypeId} onChange={(event) => setLeaveTypeId(event.target.value)} required>{leaveTypes.filter((item) => item.isBalanceTracked).map((item) => <option key={item.leaveTypeId} value={item.leaveTypeId}>{item.name}</option>)}</select></label>
        <label><span>Leave year</span><input className="field" type="number" name="leave_year" min={defaultYear - 1} max={defaultYear + 1} value={year} onChange={(event) => setYear(Number(event.target.value))} required /></label>
        <label><span>Signed units</span><input className="field" type="number" name="units" step="0.5" value={units} onChange={(event) => setUnits(Number(event.target.value))} required /><small className="muted">Positive adds units; negative subtracts units.</small></label>
      </div>
      <p className="muted">Available balance: {available === null ? "Not loaded" : `${available} days`}</p>
      {debitTooLarge && <p className="form-error">The debit is larger than the available balance.</p>}
      <label><span>Adjustment reason <span className="muted">(required, private)</span></span><textarea className="field" name="reason" rows={4} maxLength={1000} required /></label>
      {state.error && <p className="form-error">{state.error}</p>}
      {state.success && <p className="form-success">{state.success}</p>}
      <div className="form-actions"><button className="btn primary" type="submit" disabled={pending || debitTooLarge}>{pending ? "Saving…" : "Save adjustment"}</button></div>
    </form>
  );
}
