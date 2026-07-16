"use client";

import { useActionState, useState } from "react";
import type { LeaveActionState, LeaveTypeVersion } from "@/features/leave/types";

export function LeaveTypeForm({
  mode,
  leaveTypeId,
  initial,
  companyDate,
  action,
}: {
  mode: "create" | "version";
  leaveTypeId?: string;
  initial?: LeaveTypeVersion | null;
  companyDate: string;
  action: (state: LeaveActionState, formData: FormData) => Promise<LeaveActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [paid, setPaid] = useState(initial?.is_paid ?? true);
  const [tracked, setTracked] = useState(initial?.is_balance_tracked ?? true);
  const [annualUnits, setAnnualUnits] = useState(initial?.default_annual_units ?? 0);
  const [carryover, setCarryover] = useState(initial?.carryover_enabled ?? false);
  const [carryoverCap, setCarryoverCap] = useState<string>(initial?.carryover_cap_units === null || initial?.carryover_cap_units === undefined ? "" : String(initial.carryover_cap_units));
  const [documentRequired, setDocumentRequired] = useState(initial?.document_required ?? false);
  const [documentThreshold, setDocumentThreshold] = useState<string>(initial?.document_required_min_units === null || initial?.document_required_min_units === undefined ? "" : String(initial.document_required_min_units));

  function setPaidValue(value: boolean) { setPaid(value); if (value) setTracked(true); }
  function setTrackedValue(value: boolean) { setTracked(value); if (!value) { setAnnualUnits(0); setCarryover(false); setCarryoverCap(""); } }
  function setCarryoverValue(value: boolean) { setCarryover(value); if (!value) setCarryoverCap(""); }
  function setDocumentValue(value: boolean) { setDocumentRequired(value); if (!value) setDocumentThreshold(""); }

  return (
    <form action={formAction} className="card form-card leave-type-form">
      {leaveTypeId && <input type="hidden" name="leave_type_id" value={leaveTypeId} />}
      {paid && <input type="hidden" name="is_balance_tracked" value="on" />}
      <div className="form-grid">
        {mode === "create" && <label><span>Code</span><input className="field" name="code" maxLength={40} defaultValue={state.values?.code ?? ""} placeholder="VACATION" required /></label>}
        <label><span>Effective date</span><input className="field" type="date" name="effective_from" defaultValue={state.values?.effective_from ?? companyDate} required /></label>
        <label><span>Name</span><input className="field" name="name" maxLength={100} defaultValue={state.values?.name ?? initial?.name ?? ""} required /></label>
        <label><span>Annual allocation</span><input className="field" type="number" name="default_annual_units" min="0" step="0.5" value={annualUnits} onChange={(event) => setAnnualUnits(Number(event.target.value))} disabled={!tracked} required /></label>
      </div>
      <label><span>Description <span className="muted">(optional)</span></span><textarea className="field" name="description" rows={4} maxLength={1000} defaultValue={state.values?.description ?? initial?.description ?? ""} /></label>
      <div className="leave-policy-checkboxes">
        <label className="checkbox-row"><input type="checkbox" name="is_active" defaultChecked={initial?.is_active ?? true} /> Active policy</label>
        <label className="checkbox-row"><input type="checkbox" name="is_paid" checked={paid} onChange={(event) => setPaidValue(event.target.checked)} /> Paid leave</label>
        <label className="checkbox-row"><input type="checkbox" name="is_balance_tracked" checked={tracked} disabled={paid} onChange={(event) => setTrackedValue(event.target.checked)} /> Balance tracked</label>
        <label className="checkbox-row"><input type="checkbox" name="employee_note_required" defaultChecked={initial?.employee_note_required ?? false} /> Employee note required</label>
        <label className="checkbox-row"><input type="checkbox" name="carryover_enabled" checked={carryover} disabled={!tracked} onChange={(event) => setCarryoverValue(event.target.checked)} /> Carryover enabled</label>
        <label className="checkbox-row"><input type="checkbox" name="document_required" checked={documentRequired} onChange={(event) => setDocumentValue(event.target.checked)} /> Supporting document required</label>
      </div>
      <div className="form-grid">
        <label><span>Carryover cap</span><input className="field" type="number" name="carryover_cap_units" min="0.5" step="0.5" value={carryoverCap} disabled={!carryover} onChange={(event) => setCarryoverCap(event.target.value)} /></label>
        <label><span>Document minimum duration</span><input className="field" type="number" name="document_required_min_units" min="0.5" step="0.5" value={documentThreshold} disabled={!documentRequired} onChange={(event) => setDocumentThreshold(event.target.value)} /></label>
      </div>
      {mode === "version" && <label><span>Change reason <span className="muted">(required for current or backdated versions)</span></span><textarea className="field" name="change_reason" rows={4} maxLength={1000} required /></label>}
      {state.error && <p className="form-error">{state.error}</p>}
      {state.success && <p className="form-success">{state.success}</p>}
      <div className="form-actions"><button className="btn primary" type="submit" disabled={pending}>{pending ? "Saving…" : mode === "create" ? "Create leave type" : "Create policy version"}</button></div>
    </form>
  );
}
