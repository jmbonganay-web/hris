"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import {
  excludeEmployeeFromPayrollAction,
  recalculatePayrollEmployeeAction,
  reversePayrollExclusionAction,
  startPayrollCalculationAction,
} from "@/app/(dashboard)/payroll/calculation/actions";
import { transitionPayrollPeriodAction } from "@/app/(dashboard)/payroll/periods/actions";
import {
  compensationTypeLabel,
  formatPayrollDateTime,
  formatPayrollMinutes,
  formatPayrollMoney,
  payrollCalculationRunStatusLabel,
  payrollEmployeeEntryStatusLabel,
} from "@/features/payroll/presentation";
import type {
  PayrollActionState,
  PayrollCalculationWorkspace,
  PayrollEmployeeEntry,
} from "@/features/payroll/types";

const initialState: PayrollActionState = {};
type PayrollAction = (formData: FormData) => Promise<PayrollActionState>;

function usePayrollAction(action: PayrollAction) {
  return useActionState(
    async (_previous: PayrollActionState, formData: FormData) => action(formData),
    initialState,
  );
}

function Feedback({ state }: { state: PayrollActionState }) {
  return <>
    {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
    {state.success ? <p className="form-success" role="status">{state.success}</p> : null}
  </>;
}

function StartCalculationForm({ workspace }: { workspace: PayrollCalculationWorkspace }) {
  const [state, action, pending] = usePayrollAction(startPayrollCalculationAction);
  const activeRun = workspace.latestRun?.status === "queued" || workspace.latestRun?.status === "running";
  const disabled = workspace.period.status !== "open" || activeRun;
  return <form className="card content-stack payroll-run-form" action={action}>
    <div className="section-heading"><div><h2>Start calculation</h2><p>Calculate eligible employees independently using immutable source snapshots.</p></div></div>
    <input type="hidden" name="payrollPeriodId" value={workspace.period.id}/>
    <label>Calculation scope<select className="field" name="mode" defaultValue="all" disabled={disabled}><option value="all">All eligible employees</option><option value="uncalculated">Only uncalculated employees</option></select></label>
    <Feedback state={state}/>
    <button className="btn primary" disabled={disabled || pending}>{pending ? "Calculating…" : activeRun ? "Calculation running" : "Start calculation"}</button>
  </form>;
}

function RecalculateForm({ periodId, employeeId }: { periodId: string; employeeId: string }) {
  const [state, action, pending] = usePayrollAction(recalculatePayrollEmployeeAction);
  return <form className="inline-action-form" action={action}>
    <input type="hidden" name="payrollPeriodId" value={periodId}/><input type="hidden" name="employeeId" value={employeeId}/>
    <button className="btn small" disabled={pending}>{pending ? "Recalculating…" : "Recalculate"}</button>
    <Feedback state={state}/>
  </form>;
}

function ExcludeForm({ periodId, employeeId }: { periodId: string; employeeId: string }) {
  const [state, action, pending] = usePayrollAction(excludeEmployeeFromPayrollAction);
  return <details className="payroll-inline-details"><summary>Exclude</summary><form className="content-stack" action={action}>
    <input type="hidden" name="payrollPeriodId" value={periodId}/><input type="hidden" name="employeeId" value={employeeId}/>
    <label>Exclusion reason<textarea className="field" name="reason" required maxLength={1000}/></label>
    <p className="muted">This affects only this payroll period and does not change employment status.</p>
    <Feedback state={state}/><button className="btn danger-outline small" disabled={pending}>{pending ? "Excluding…" : "Confirm exclusion"}</button>
  </form></details>;
}

function ReverseExclusionForm({ periodId, exclusionId }: { periodId: string; exclusionId: string }) {
  const [state, action, pending] = usePayrollAction(reversePayrollExclusionAction);
  return <details className="payroll-inline-details"><summary>Reverse exclusion</summary><form className="content-stack" action={action}>
    <input type="hidden" name="payrollPeriodId" value={periodId}/><input type="hidden" name="exclusionId" value={exclusionId}/>
    <label>Reversal reason<textarea className="field" name="reason" required maxLength={1000}/></label>
    <Feedback state={state}/><button className="btn small" disabled={pending}>{pending ? "Reversing…" : "Confirm reversal"}</button>
  </form></details>;
}

function SubmitReviewForm({ workspace }: { workspace: PayrollCalculationWorkspace }) {
  const [state, action, pending] = usePayrollAction(transitionPayrollPeriodAction);
  return <form className="card content-stack payroll-readiness-card" action={action}>
    <div className="section-heading"><div><h2>Submit for review</h2><p>{workspace.readiness.ready ? "All calculated entries satisfy the database readiness checks." : "Resolve blockers, missing employees, and stale entries first."}</p></div><span className={`badge ${workspace.readiness.ready ? "success" : "warning"}`}>{workspace.readiness.ready ? "Ready" : "Not ready"}</span></div>
    <input type="hidden" name="periodId" value={workspace.period.id}/><input type="hidden" name="expectedVersion" value={workspace.period.version}/><input type="hidden" name="toStatus" value="under_review"/>
    <ul className="payroll-readiness-list"><li>Active runs: {workspace.readiness.activeRunCount}</li><li>Blocking exception: {workspace.readiness.blockingExceptionCount}</li><li>Needs recalculation: {workspace.readiness.staleEntryCount}</li><li>Missing employees: {workspace.readiness.missingEmployeeCount}</li></ul>
    <Feedback state={state}/><button className="btn primary" disabled={!workspace.readiness.ready || pending || workspace.period.status !== "open"}>{pending ? "Submitting…" : "Submit for review"}</button>
  </form>;
}

function entryStatus(entry: PayrollEmployeeEntry) {
  if (entry.blockingExceptionCount > 0) return "Blocking exception";
  if (entry.isStale || entry.status === "stale") return "Needs recalculation";
  return payrollEmployeeEntryStatusLabel(entry.status);
}

export function PayrollCalculationWorkspaceView({ workspace }: { workspace: PayrollCalculationWorkspace }) {
  const [filter, setFilter] = useState("all");
  const entries = useMemo(() => workspace.entries.filter((entry) => {
    if (filter === "all") return true;
    if (filter === "calculated") return ["calculated", "recalculated"].includes(entry.status) && !entry.isStale;
    if (filter === "stale") return entry.isStale || entry.status === "stale";
    if (filter === "exception") return entry.openExceptionCount > 0 || entry.status === "exception";
    if (filter === "excluded") return entry.status === "excluded";
    if (filter === "monthly" || filter === "hourly") return entry.compensationType === filter;
    return true;
  }), [filter, workspace.entries]);

  return <div className="content-stack">
    <section className="payroll-calculation-summary-grid">
      <article className="card metric-card"><span>Entries</span><strong>{workspace.summary.entryCount}</strong></article>
      <article className="card metric-card"><span>Calculated</span><strong>{workspace.entries.filter((entry) => ["calculated", "recalculated"].includes(entry.status) && !entry.isStale).length}</strong></article>
      <article className="card metric-card"><span>Exceptions</span><strong>{workspace.summary.exceptionCount}</strong></article>
      <article className="card metric-card"><span>Needs recalculation</span><strong>{workspace.summary.staleCount}</strong></article>
      <article className="card metric-card"><span>Excluded</span><strong>{workspace.summary.excludedCount}</strong></article>
    </section>

    {workspace.latestRun ? <section className="card payroll-run-summary"><div><span className="muted">Latest run</span><h2>{payrollCalculationRunStatusLabel(workspace.latestRun.status)}</h2><p>{formatPayrollDateTime(workspace.latestRun.startedAt)} · {workspace.latestRun.calculatedCount} calculated · {workspace.latestRun.exceptionCount} exceptions</p></div><span className={`badge ${workspace.latestRun.status === "failed" ? "danger" : workspace.latestRun.status === "completed" ? "success" : "warning"}`}>{payrollCalculationRunStatusLabel(workspace.latestRun.status)}</span></section> : null}

    <div className="payroll-workspace-controls"><StartCalculationForm workspace={workspace}/><SubmitReviewForm workspace={workspace}/></div>

    <section className="content-stack">
      <div className="section-heading"><div><h2>Employee calculations</h2><p>Current immutable result version for every processed employee.</p></div><div className="header-actions"><Link className="btn" href={`/payroll/periods/${workspace.period.id}/exceptions`}>Review exceptions</Link><select className="field compact-field" aria-label="Filter payroll entries" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All</option><option value="calculated">Calculated</option><option value="stale">Needs recalculation</option><option value="exception">Exception</option><option value="excluded">Excluded</option><option value="monthly">Monthly</option><option value="hourly">Hourly</option></select></div></div>
      {entries.length ? <div className="card table-wrap payroll-calculation-table"><table><thead><tr><th>Employee</th><th>Type</th><th>Status</th><th>Eligible</th><th>Regular earnings</th><th>Deductions</th><th>Overtime input</th><th>Gross pay</th><th>Actions</th></tr></thead><tbody>{entries.map((entry) => {
        const deductions = entry.absenceDeductionRounded + entry.lateDeductionRounded + entry.undertimeDeductionRounded + entry.unpaidLeaveDeduction;
        return <tr key={entry.id}><td><Link className="table-link" href={`/payroll/periods/${workspace.period.id}/employees/${entry.employeeId}`}>{entry.employee.fullName || "Employee"}</Link><span className="table-subtext">{entry.employee.employeeNumber}</span></td><td>{entry.compensationType ? compensationTypeLabel(entry.compensationType) : "Unavailable"}</td><td><span className={`badge ${entry.blockingExceptionCount ? "danger" : entry.isStale ? "warning" : entry.status === "excluded" ? "info" : "success"}`}>{entryStatus(entry)}</span>{entry.openExceptionCount ? <span className="table-subtext">{entry.openExceptionCount} open</span> : null}</td><td>{entry.eligibleWorkdays} days<span className="table-subtext">{formatPayrollMinutes(entry.eligibleMinutes)}</span></td><td>{formatPayrollMoney(entry.regularEarningsRounded, entry.currencyCode)}</td><td>{formatPayrollMoney(deductions, entry.currencyCode)}</td><td>{formatPayrollMinutes(entry.approvedOvertimeMinutes)}</td><td><strong>{formatPayrollMoney(entry.grossPayRounded, entry.currencyCode)}</strong></td><td><div className="table-actions">{entry.isStale || entry.status === "exception" ? <RecalculateForm periodId={workspace.period.id} employeeId={entry.employeeId}/> : null}{entry.status !== "excluded" ? <ExcludeForm periodId={workspace.period.id} employeeId={entry.employeeId}/> : entry.activeExclusionId ? <ReverseExclusionForm periodId={workspace.period.id} exclusionId={entry.activeExclusionId}/> : null}</div></td></tr>;
      })}</tbody></table></div> : <div className="card empty">No employee calculations match this filter.</div>}
    </section>

    <section id="runs" className="content-stack"><div className="section-heading"><div><h2>Calculation runs</h2><p>Controlled run history and employee-level outcome totals.</p></div></div>{workspace.runs.length ? <div className="card table-wrap"><table><thead><tr><th>Started</th><th>Status</th><th>Eligible</th><th>Calculated</th><th>Exceptions</th><th>Excluded</th></tr></thead><tbody>{workspace.runs.map((run) => <tr key={run.id}><td>{formatPayrollDateTime(run.startedAt)}</td><td>{payrollCalculationRunStatusLabel(run.status)}</td><td>{run.eligibleEmployeeCount}</td><td>{run.calculatedCount}</td><td>{run.exceptionCount}</td><td>{run.excludedCount}</td></tr>)}</tbody></table></div> : <div className="card empty">No calculation runs have been started.</div>}</section>
  </div>;
}
