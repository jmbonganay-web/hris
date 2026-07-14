"use client";

import { useActionState } from "react";

type State = { error?: string; fieldErrors?: Record<string, string>; values?: { targetDate?: string } };
const initialState: State = {};

export function ManualFinalizationForm({ action, defaultDate }: { action: (state: State, formData: FormData) => Promise<State>; defaultDate: string }) {
  const [state, formAction, pending] = useActionState(action, initialState);
  return <form className="card form-card" action={formAction} onSubmit={(event) => { if (!window.confirm("Finalize attendance for this date?")) event.preventDefault(); }}><div className="form-grid"><label><span>Target date</span><input className="field" type="date" name="target_date" defaultValue={state.values?.targetDate ?? defaultDate} required />{state.fieldErrors?.target_date && <span className="form-error">{state.fieldErrors.target_date}</span>}</label><label className="full"><span>Manual finalization reason</span><textarea className="field" name="manual_reason" maxLength={1000} rows={3} required />{state.fieldErrors?.manual_reason && <span className="form-error">{state.fieldErrors.manual_reason}</span>}</label></div>{state.error && <p className="form-error">{state.error}</p>}<button className="btn primary" disabled={pending}>{pending ? "Finalizing…" : "Run finalization"}</button></form>;
}
