"use client";

import { useActionState, useMemo, useState } from "react";
import {
  approvePayrollBasisRuleAction,
  createPayrollBasisRuleAction,
  rejectPayrollBasisRuleAction,
  submitPayrollBasisRuleAction,
} from "@/app/(dashboard)/payroll/calculation/actions";
import {
  formatPayrollDate,
  formatPayrollDateTime,
  payrollRequestStatusLabel,
} from "@/features/payroll/presentation";
import type {
  PayrollActionState,
  PayrollBasisRule,
  PayrollBasisRuleList,
} from "@/features/payroll/types";

const initialState: PayrollActionState = {};
type PayrollAction = (formData: FormData) => Promise<PayrollActionState>;
function usePayrollAction(action: PayrollAction) {
  return useActionState(async (_: PayrollActionState, data: FormData) => action(data), initialState);
}
function Feedback({ state }: { state: PayrollActionState }) { return <>{state.error ? <p className="form-error">{state.error}</p> : null}{state.success ? <p className="form-success">{state.success}</p> : null}</>; }

function RuleActions({ rule, canApprove }: { rule: PayrollBasisRule; canApprove: boolean }) {
  const [submitState, submitAction, submitPending] = usePayrollAction(submitPayrollBasisRuleAction);
  const [approveState, approveAction, approvePending] = usePayrollAction(approvePayrollBasisRuleAction);
  const [rejectState, rejectAction, rejectPending] = usePayrollAction(rejectPayrollBasisRuleAction);
  if (["draft", "rejected"].includes(rule.status)) return <div className="content-stack"><form action={submitAction}><input type="hidden" name="ruleId" value={rule.id}/><input type="hidden" name="expectedVersion" value={rule.version}/><button className="btn primary" disabled={submitPending}>{submitPending ? "Submitting…" : "Submit for approval"}</button></form><Feedback state={submitState}/></div>;
  if (rule.status === "pending_approval" && canApprove) return <div className="payroll-basis-actions"><form action={approveAction}><input type="hidden" name="ruleId" value={rule.id}/><input type="hidden" name="expectedVersion" value={rule.version}/><button className="btn primary" disabled={approvePending}>{approvePending ? "Approving…" : "Approve"}</button><Feedback state={approveState}/></form><form className="content-stack" action={rejectAction}><input type="hidden" name="ruleId" value={rule.id}/><input type="hidden" name="expectedVersion" value={rule.version}/><label>Rejection reason<textarea className="field" name="reason" required maxLength={1000}/></label><button className="btn danger-outline" disabled={rejectPending}>{rejectPending ? "Rejecting…" : "Reject"}</button><Feedback state={rejectState}/></form></div>;
  return null;
}

export function PayrollBasisRuleListView({ data, canApprove }: { data: PayrollBasisRuleList; canApprove: boolean }) {
  const [presetCode, setPresetCode] = useState("261");
  const preset = useMemo(() => data.presets.find((item) => item.code === presetCode) ?? data.presets[0], [data.presets, presetCode]);
  const [createState, createAction, createPending] = usePayrollAction(createPayrollBasisRuleAction);
  const active = data.rules.find((rule) => rule.status === "approved" && rule.effectiveFrom <= new Date().toISOString().slice(0, 10) && (!rule.effectiveTo || rule.effectiveTo >= new Date().toISOString().slice(0, 10)));
  return <div className="content-stack">
    {!active ? <section className="card payroll-setup-warning"><span className="badge warning">Setup required</span><div><h2>No active payroll basis</h2><p>A Super Admin must approve a basis rule before payroll calculation can start. Presets are suggestions and are never activated automatically.</p></div></section> : <section className="card payroll-run-summary"><div><span className="muted">Active basis</span><h2>{active.name}</h2><p>{active.annualDivisor}-day divisor · {active.standardHoursPerDay} hours per day · effective {formatPayrollDate(active.effectiveFrom)}</p></div><span className="badge success">Approved</span></section>}

    <form className="card content-stack" action={createAction}>
      <div className="section-heading"><div><h2>Create payroll basis draft</h2><p>Select a preset or enter a custom divisor. Approval is always required.</p></div></div>
      <div className="form-grid"><label>Preset<select className="field" value={presetCode} onChange={(event) => setPresetCode(event.target.value)}><option value="261">261-day basis</option><option value="310">310-day basis</option><option value="313">313-day basis</option><option value="365">365-day basis</option><option value="custom">Custom divisor</option></select></label><label>Rule name<input className="field" name="name" key={`name-${presetCode}`} defaultValue={presetCode === "custom" ? "Custom payroll basis" : preset?.name ?? "Payroll basis"} required maxLength={120}/></label><label>Annual divisor<input className="field" type="number" step="0.0001" min="0.0001" max="1000" name="annual_divisor" key={`divisor-${presetCode}`} defaultValue={presetCode === "custom" ? "" : preset?.annualDivisor ?? ""} required/></label><label>Standard hours per day<input className="field" type="number" step="0.25" min="0.25" max="24" name="standard_hours_per_day" key={`hours-${presetCode}`} defaultValue={preset?.standardHoursPerDay ?? 8} required/></label><label>Rounding method<select className="field" name="rounding_mode" defaultValue="half_up"><option value="half_up">Half up</option><option value="half_even">Half even</option><option value="truncate">Truncate</option></select></label><label>Effective date<input className="field" type="date" name="effective_from" required/></label><label className="detail-span">Change reason<textarea className="field" name="change_reason" required maxLength={1000}/></label></div>
      <Feedback state={createState}/><button className="btn primary" disabled={createPending}>{createPending ? "Creating…" : "Create draft"}</button>
    </form>

    <section className="content-stack"><div className="section-heading"><div><h2>Payroll basis history</h2><p>Draft, pending, approved, rejected, future, and superseded rules.</p></div><span className="badge info">{data.rules.length}</span></div>{data.rules.length ? <div className="payroll-basis-grid">{data.rules.map((rule) => <article className="card content-stack" key={rule.id}><div className="card-header-row"><div><h3>{rule.name}</h3><p className="muted">Version {rule.version}</p></div><span className={`badge ${rule.status === "approved" ? "success" : rule.status === "rejected" ? "danger" : rule.status === "pending_approval" ? "warning" : "info"}`}>{payrollRequestStatusLabel(rule.status)}</span></div><dl className="detail-list"><div><dt>Annual divisor</dt><dd>{rule.annualDivisor}</dd></div><div><dt>Hours per day</dt><dd>{rule.standardHoursPerDay}</dd></div><div><dt>Rounding</dt><dd>{rule.roundingMode.replaceAll("_", " ")}</dd></div><div><dt>Effective</dt><dd>{formatPayrollDate(rule.effectiveFrom)} – {formatPayrollDate(rule.effectiveTo)}</dd></div><div><dt>Submitted</dt><dd>{formatPayrollDateTime(rule.submittedAt)}</dd></div><div><dt>Approved</dt><dd>{formatPayrollDateTime(rule.approvedAt)}</dd></div></dl>{rule.changeReason ? <p><strong>Change reason:</strong> {rule.changeReason}</p> : null}{rule.rejectionReason ? <p className="form-error"><strong>Rejection reason:</strong> {rule.rejectionReason}</p> : null}<RuleActions rule={rule} canApprove={canApprove}/></article>)}</div> : <div className="card empty">No payroll basis rules have been created.</div>}</section>
  </div>;
}
