"use client";

import { useActionState } from "react";
import type { LeaveActionState } from "@/features/leave/types";

export function ArchiveLeaveTypeForm({ companyDate, action }: { companyDate: string; action: (state: LeaveActionState, formData: FormData) => Promise<LeaveActionState> }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="card form-card danger-zone-form">
      <h2 className="card-title">Archive leave type</h2>
      <div className="form-grid"><label><span>Effective date</span><input className="field" type="date" name="effective_from" defaultValue={companyDate} required /></label></div>
      <label><span>Change reason <span className="muted">(required, private)</span></span><textarea className="field" name="change_reason" rows={4} maxLength={1000} required /></label>
      {state.error && <p className="form-error">{state.error}</p>}
      <div className="form-actions"><button className="btn danger" type="submit" disabled={pending}>{pending ? "Archiving…" : "Archive leave type"}</button></div>
    </form>
  );
}
