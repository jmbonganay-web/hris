"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  approveAttendanceDeductionRuleAction,
  approvePremiumRuleSetAction,
  rejectAttendanceDeductionRuleAction,
  rejectPremiumRuleSetAction,
} from "@/app/(dashboard)/payroll/premiums/actions";
import { formatPayrollDate, premiumDayTypeLabel } from "@/features/payroll/presentation";
import type { PayrollActionState, PremiumApprovalQueue } from "@/features/payroll/types";

const initial: PayrollActionState = {};
type Action = (data: FormData) => Promise<PayrollActionState>;
function Decision({ id, version, approve, reject }: { id: string; version: number; approve: Action; reject: Action }) {
  const [approveState, approveAction, approving] = useActionState(async (_: PayrollActionState, data: FormData) => approve(data), initial);
  const [rejectState, rejectAction, rejecting] = useActionState(async (_: PayrollActionState, data: FormData) => reject(data), initial);
  return <div className="payroll-basis-actions"><form action={approveAction}><input type="hidden" name="ruleId" value={id}/><input type="hidden" name="expectedVersion" value={version}/><button className="btn primary" disabled={approving}>{approving ? "Approving…" : "Approve"}</button>{approveState.error ? <p className="form-error">{approveState.error}</p> : null}</form><form className="content-stack" action={rejectAction}><input type="hidden" name="ruleId" value={id}/><input type="hidden" name="expectedVersion" value={version}/><label>Rejection reason<textarea className="field" name="reason" required maxLength={1000}/></label><button className="btn danger-outline" disabled={rejecting}>{rejecting ? "Rejecting…" : "Reject"}</button>{rejectState.error ? <p className="form-error">{rejectState.error}</p> : null}</form></div>;
}

export function PremiumRuleApprovalList({ queue }: { queue: PremiumApprovalQueue }) {
  return <div className="content-stack"><section className="content-stack"><div className="section-heading"><div><h2>Premium rule sets</h2><p>Review source metadata, effective dates, scope, and all multipliers.</p></div><span className="badge warning">{queue.premiumRules.length}</span></div>{queue.premiumRules.length ? queue.premiumRules.map((rule) => <article className="card content-stack" key={rule.id}><div className="card-header-row"><div><h3>{rule.name}</h3><p>{rule.scopeLabel} · effective {formatPayrollDate(rule.effectiveFrom)}</p></div><span className="badge warning">Pending approval</span></div><p><strong>Legal source:</strong> {rule.sourceAgency} · {rule.sourceReference}</p><Link className="btn" href={`/payroll/settings/premium-rules/${rule.id}`}>Review coverage and full rule</Link><div className="premium-rule-grid compact">{rule.dayRules.map((day) => <div className="premium-rule-day-card" key={day.id}><strong>{premiumDayTypeLabel(day.dayType)}</strong><span>Day {day.regularTimeMultiplier}× · OT {day.overtimeMultiplier}× · ND {day.nightDifferentialPercentage}</span></div>)}</div><Decision id={rule.id} version={rule.version} approve={approvePremiumRuleSetAction} reject={rejectPremiumRuleSetAction}/></article>) : <div className="card empty">No premium rules are awaiting approval.</div>}</section><section className="content-stack"><div className="section-heading"><div><h2>Attendance deduction rules</h2><p>Confirm grace and rounding policies.</p></div><span className="badge warning">{queue.attendanceDeductionRules.length}</span></div>{queue.attendanceDeductionRules.length ? queue.attendanceDeductionRules.map((rule) => <article className="card content-stack" key={rule.id}><div><h3>{rule.scopeLabel}</h3><p>Late grace {rule.lateGraceMinutes} minutes · Undertime grace {rule.undertimeGraceMinutes} minutes</p></div><Decision id={rule.id} version={rule.version} approve={approveAttendanceDeductionRuleAction} reject={rejectAttendanceDeductionRuleAction}/></article>) : <div className="card empty">No attendance deduction rules are awaiting approval.</div>}</section></div>;
}
