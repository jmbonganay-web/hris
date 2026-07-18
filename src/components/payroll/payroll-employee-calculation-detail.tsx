"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  excludeEmployeeFromPayrollAction,
  recalculatePayrollEmployeeAction,
  reversePayrollExclusionAction,
} from "@/app/(dashboard)/payroll/calculation/actions";
import {
  formatPayrollDate,
  formatPayrollDateTime,
  formatPayrollMinutes,
  formatPayrollMoney,
  payrollEmployeeEntryStatusLabel,
} from "@/features/payroll/presentation";
import type { PayrollActionState, PayrollEmployeeCalculationDetail } from "@/features/payroll/types";

const initialState: PayrollActionState = {};
function Feedback({ state }: { state: PayrollActionState }) { return <>{state.error ? <p className="form-error">{state.error}</p> : null}{state.success ? <p className="form-success">{state.success}</p> : null}</>; }

export function PayrollEmployeeCalculationDetailView({ periodId, detail }: { periodId: string; detail: PayrollEmployeeCalculationDetail }) {
  const current = detail.currentEntry;
  const [recalculateState, recalculateAction, recalculatePending] = useActionState(async (_: PayrollActionState, data: FormData) => recalculatePayrollEmployeeAction(data), initialState);
  const [excludeState, excludeAction, excludePending] = useActionState(async (_: PayrollActionState, data: FormData) => excludeEmployeeFromPayrollAction(data), initialState);
  const [reverseState, reverseAction, reversePending] = useActionState(async (_: PayrollActionState, data: FormData) => reversePayrollExclusionAction(data), initialState);
  if (!current) return <div className="card empty">No payroll calculation entry exists for this employee.</div>;
  const deductions = current.absenceDeductionRounded + current.lateDeductionRounded + current.undertimeDeductionRounded + current.unpaidLeaveDeduction;
  return <div className="content-stack">
    <section className="card content-stack"><div className="card-header-row"><div><h2>{detail.employee.fullName}</h2><p className="muted">{detail.employee.employeeNumber} · Version {current.versionNumber}</p></div><span className={`badge ${current.isStale ? "warning" : current.status === "exception" ? "danger" : "success"}`}>{current.isStale ? "Needs recalculation" : payrollEmployeeEntryStatusLabel(current.status)}</span></div>
      <div className="payroll-detail-totals"><div><span>Eligible</span><strong>{current.eligibleWorkdays} days</strong><small>{formatPayrollMinutes(current.eligibleMinutes)}</small></div><div><span>Regular earnings</span><strong>{formatPayrollMoney(current.regularEarningsRounded, current.currencyCode)}</strong></div><div><span>Attendance deductions</span><strong>{formatPayrollMoney(deductions, current.currencyCode)}</strong></div><div><span>Overtime input</span><strong>{formatPayrollMinutes(current.approvedOvertimeMinutes)}</strong></div><div><span>Gross pay</span><strong>{formatPayrollMoney(current.grossPayRounded, current.currencyCode)}</strong></div></div>
      <div className="form-actions"><form action={recalculateAction}><input type="hidden" name="payrollPeriodId" value={periodId}/><input type="hidden" name="employeeId" value={detail.employee.id}/><button className="btn primary" disabled={recalculatePending}>{recalculatePending ? "Recalculating…" : "Recalculate"}</button></form>{current.status !== "excluded" ? <details className="payroll-inline-details"><summary>Exclude from period</summary><form className="content-stack" action={excludeAction}><input type="hidden" name="payrollPeriodId" value={periodId}/><input type="hidden" name="employeeId" value={detail.employee.id}/><label>Reason<textarea className="field" name="reason" required maxLength={1000}/></label><button className="btn danger-outline" disabled={excludePending}>{excludePending ? "Excluding…" : "Confirm exclusion"}</button></form></details> : current.activeExclusionId ? <details className="payroll-inline-details"><summary>Reverse exclusion</summary><form className="content-stack" action={reverseAction}><input type="hidden" name="payrollPeriodId" value={periodId}/><input type="hidden" name="exclusionId" value={current.activeExclusionId}/><label>Reversal reason<textarea className="field" name="reason" required maxLength={1000}/></label><button className="btn" disabled={reversePending}>{reversePending ? "Reversing…" : "Confirm reversal"}</button></form></details> : null}</div><Feedback state={recalculateState}/><Feedback state={excludeState}/><Feedback state={reverseState}/>
    </section>

    <section className="content-stack"><div className="section-heading"><div><h2>Daily breakdown</h2><p>Eligible schedule, attendance, leave, overtime input, earnings, and deductions by date.</p></div></div>{detail.dailyBreakdowns.length ? <div className="card table-wrap"><table><thead><tr><th>Date</th><th>Eligible</th><th>Scheduled</th><th>Attendance</th><th>Paid leave</th><th>Unpaid leave</th><th>Late</th><th>Undertime</th><th>Overtime input</th><th>Earnings</th><th>Deductions</th></tr></thead><tbody>{detail.dailyBreakdowns.map((day) => <tr key={day.id}><td>{formatPayrollDate(day.workDate)}</td><td>{day.employmentEligible ? "Yes" : "No"}</td><td>{formatPayrollMinutes(day.scheduledMinutes)}</td><td>{formatPayrollMinutes(day.attendanceMinutes)}</td><td>{formatPayrollMinutes(day.paidLeaveMinutes)}</td><td>{formatPayrollMinutes(day.unpaidLeaveMinutes)}</td><td>{formatPayrollMinutes(day.lateMinutes)}</td><td>{formatPayrollMinutes(day.undertimeMinutes)}</td><td>{formatPayrollMinutes(day.approvedOvertimeMinutes)}</td><td>{formatPayrollMoney(day.regularEarningsRaw, current.currencyCode)}</td><td>{formatPayrollMoney(day.absenceDeductionRaw + day.lateDeductionRaw + day.undertimeDeductionRaw + day.unpaidLeaveDeductionRaw, current.currencyCode)}</td></tr>)}</tbody></table></div> : <div className="card empty">No daily breakdown rows are available.</div>}</section>

    <section className="content-stack"><div className="section-heading"><div><h2>Source snapshots</h2><p>Immutable source identifiers, timestamps, and hashes used by this calculation.</p></div></div>{detail.snapshots.length ? <div className="card table-wrap"><table><thead><tr><th>Source</th><th>Effective date</th><th>Source updated</th><th>Snapshot hash</th></tr></thead><tbody>{detail.snapshots.map((snapshot) => <tr key={snapshot.id}><td>{snapshot.sourceType.replaceAll("_", " ")}<span className="table-subtext">{snapshot.sourceTable}</span></td><td>{formatPayrollDate(snapshot.effectiveDate)}</td><td>{formatPayrollDateTime(snapshot.sourceUpdatedAt)}</td><td><code>{snapshot.snapshotHash.slice(0, 16)}…</code></td></tr>)}</tbody></table></div> : <div className="card empty">No source snapshots are available.</div>}</section>

    <section className="content-stack"><div className="section-heading"><div><h2>Calculation history</h2><p>Immutable calculation versions remain available after recalculation.</p></div></div><div className="card table-wrap"><table><thead><tr><th>Version</th><th>Status</th><th>Calculated</th><th>Eligible</th><th>Gross pay</th></tr></thead><tbody>{detail.versions.map((entry) => <tr key={entry.id}><td>Version {entry.versionNumber}{entry.isCurrent ? <span className="table-subtext">Current</span> : null}</td><td>{payrollEmployeeEntryStatusLabel(entry.status)}</td><td>{formatPayrollDateTime(entry.calculatedAt)}</td><td>{formatPayrollMinutes(entry.eligibleMinutes)}</td><td>{formatPayrollMoney(entry.grossPayRounded, entry.currencyCode)}</td></tr>)}</tbody></table></div></section>

    {detail.exceptions.length ? <section className="content-stack"><div className="section-heading"><div><h2>Exceptions</h2><p>Warnings and blockers recorded for this employee.</p></div><Link className="btn" href={`/payroll/periods/${periodId}/exceptions`}>Open exception queue</Link></div><div className="payroll-exception-card-grid">{detail.exceptions.map((exception) => <article className="card" key={exception.id}><span className={`badge ${exception.severity === "blocking" ? "danger" : "warning"}`}>{exception.severity}</span><h3>{exception.exceptionCode.replaceAll("_", " ")}</h3><p>{exception.message}</p><p className="muted">{formatPayrollDateTime(exception.createdAt)}</p></article>)}</div></section> : null}
  </div>;
}
