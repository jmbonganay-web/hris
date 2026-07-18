"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import {
  ignoreBlockingPayrollExceptionAction,
  resolvePayrollExceptionAction,
} from "@/app/(dashboard)/payroll/calculation/actions";
import { formatPayrollDateTime } from "@/features/payroll/presentation";
import type { PayrollActionState, PayrollEntryException } from "@/features/payroll/types";

const initialState: PayrollActionState = {};
type PayrollAction = (formData: FormData) => Promise<PayrollActionState>;
function usePayrollAction(action: PayrollAction) { return useActionState(async (_: PayrollActionState, data: FormData) => action(data), initialState); }
function Feedback({ state }: { state: PayrollActionState }) { return <>{state.error ? <p className="form-error">{state.error}</p> : null}{state.success ? <p className="form-success">{state.success}</p> : null}</>; }

function ExceptionActions({ periodId, item, canApprove }: { periodId: string; item: PayrollEntryException; canApprove: boolean }) {
  const [resolveState, resolveAction, resolvePending] = usePayrollAction(resolvePayrollExceptionAction);
  const [ignoreState, ignoreAction, ignorePending] = usePayrollAction(ignoreBlockingPayrollExceptionAction);
  if (item.status !== "open") return null;
  if (item.severity === "warning") return <form className="content-stack payroll-exception-action" action={resolveAction}><input type="hidden" name="payrollPeriodId" value={periodId}/><input type="hidden" name="exceptionId" value={item.id}/><label>Resolution note<textarea className="field" name="reason" required maxLength={1000}/></label><Feedback state={resolveState}/><button className="btn" disabled={resolvePending}>{resolvePending ? "Resolving…" : "Resolve warning"}</button></form>;
  if (canApprove) return <form className="content-stack payroll-exception-action" action={ignoreAction}><input type="hidden" name="payrollPeriodId" value={periodId}/><input type="hidden" name="exceptionId" value={item.id}/><label>Private override reason<textarea className="field" name="reason" required maxLength={1000}/></label><p className="form-error">Blocking exceptions should normally be corrected and recalculated. Override only with documented authorization.</p><Feedback state={ignoreState}/><button className="btn danger-outline" disabled={ignorePending}>{ignorePending ? "Overriding…" : "Ignore blocking exception"}</button></form>;
  return <p className="muted">A Super Admin must review this Blocking exception or the source data must be corrected and recalculated.</p>;
}

export function PayrollExceptionQueue({ periodId, items, canApprove }: { periodId: string; items: PayrollEntryException[]; canApprove: boolean }) {
  const [severity, setSeverity] = useState("all");
  const [status, setStatus] = useState("open");
  const filtered = useMemo(() => items.filter((item) => (severity === "all" || item.severity === severity) && (status === "all" || item.status === status)), [items, severity, status]);
  return <div className="content-stack"><section className="card payroll-filter-bar"><label>Severity<select className="field" value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="all">All</option><option value="blocking">Blocking</option><option value="warning">Warning</option></select></label><label>Status<select className="field" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All</option><option value="open">Open</option><option value="resolved">Resolved</option><option value="ignored">Ignored</option></select></label></section>{filtered.length ? <div className="payroll-exception-card-grid">{filtered.map((item) => <article className="card content-stack" key={item.id}><div className="card-header-row"><div><h2>{item.exceptionCode.replaceAll("_", " ")}</h2><p className="muted">{item.employee.fullName} · {item.employee.employeeNumber}</p></div><div className="header-actions"><span className={`badge ${item.severity === "blocking" ? "danger" : "warning"}`}>{item.severity === "blocking" ? "Blocking" : "Warning"}</span><span className="badge info">{item.status}</span></div></div><p>{item.message}</p><dl className="detail-list"><div><dt>Source</dt><dd>{item.sourceType?.replaceAll("_", " ") ?? "Not linked"}</dd></div><div><dt>Created</dt><dd>{formatPayrollDateTime(item.createdAt)}</dd></div><div><dt>Resolved</dt><dd>{formatPayrollDateTime(item.resolvedAt)}</dd></div></dl>{item.resolutionNote ? <p><strong>Resolution:</strong> {item.resolutionNote}</p> : null}<div className="form-actions"><Link className="btn" href={`/payroll/periods/${periodId}/employees/${item.employeeId}`}>Open employee</Link></div><ExceptionActions periodId={periodId} item={item} canApprove={canApprove}/></article>)}</div> : <div className="card empty">No payroll exceptions match the selected filters.</div>}</div>;
}
