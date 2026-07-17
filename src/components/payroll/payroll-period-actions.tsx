"use client";
import { useActionState } from "react";
import { reopenPayrollPeriodAction, transitionPayrollPeriodAction } from "@/app/(dashboard)/payroll/periods/actions";
import type { PayrollActionState, PayrollPeriodDetail } from "@/features/payroll/types";
import type { PayrollPeriodStatus } from "@/features/payroll/constants";
const initial: PayrollActionState = {};
function transitionOptions(status: PayrollPeriodStatus, canApprove: boolean): Array<{ value: PayrollPeriodStatus; label: string }> {
  if (status === "draft") return [{ value: "open", label: "Open period" }];
  if (status === "open") return [{ value: "under_review", label: "Submit for review" }];
  if (status === "under_review") return [{ value: "open", label: "Return to open" }, ...(canApprove ? [{ value: "approved" as const, label: "Approve period" }] : [])];
  if (status === "approved" && canApprove) return [{ value: "locked", label: "Lock period" }];
  return [];
}
export function PayrollPeriodActions({ period, canApprove }: { period: PayrollPeriodDetail; canApprove: boolean }) {
  const [transitionState, transitionAction, transitionPending] = useActionState(async (_: PayrollActionState, data: FormData) => transitionPayrollPeriodAction(data), initial);
  const [reopenState, reopenAction, reopenPending] = useActionState(async (_: PayrollActionState, data: FormData) => reopenPayrollPeriodAction(data), initial);
  const options = transitionOptions(period.status, canApprove);
  return <section className="card content-stack"><div className="section-heading"><div><h2>Period controls</h2><p>Only valid database-enforced transitions are available.</p></div></div>{options.length ? <form action={transitionAction} className="form-actions"><input type="hidden" name="periodId" value={period.id}/><input type="hidden" name="expectedVersion" value={period.version}/><select className="field" name="toStatus" required defaultValue=""><option value="" disabled>Choose action</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><button className="btn primary" disabled={transitionPending}>{transitionPending ? "Updating…" : "Apply transition"}</button></form> : null}{transitionState.error ? <p className="form-error">{transitionState.error}</p> : null}{transitionState.success ? <p className="form-success">{transitionState.success}</p> : null}{period.status === "locked" && canApprove ? <form action={reopenAction} className="form-grid one-column"><input type="hidden" name="periodId" value={period.id}/><input type="hidden" name="expectedVersion" value={period.version}/><label>Reopening reason<textarea className="field" name="reason" required maxLength={1000}/></label><label className="checkbox-row"><input type="checkbox" required/>Confirm reopening this locked period</label><button className="btn danger-outline" disabled={reopenPending}>{reopenPending ? "Reopening…" : "Reopen for review"}</button></form> : null}{reopenState.error ? <p className="form-error">{reopenState.error}</p> : null}{reopenState.success ? <p className="form-success">{reopenState.success}</p> : null}{options.length === 0 && !(period.status === "locked" && canApprove) ? <p className="muted">No period actions are available for your role and the current status.</p> : null}</section>;
}
