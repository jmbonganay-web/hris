"use client";

import { useActionState } from "react";
import type { OvertimePolicyActionState } from "@/features/overtime/policy/types";

const initialState: OvertimePolicyActionState = {};

export function OvertimePolicyForm({
  action,
  companyDate,
}: {
  action: (
    state: OvertimePolicyActionState,
    formData: FormData,
  ) => Promise<OvertimePolicyActionState>;
  companyDate: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="card form-card">
      <div className="form-grid">
        <label>
          <span>Effective date</span>
          <input
            className="field"
            type="date"
            name="effective_date"
            defaultValue={state.values?.effectiveDate ?? companyDate}
            required
          />
          {state.fieldErrors?.effective_date && (
            <span className="form-error">{state.fieldErrors.effective_date}</span>
          )}
        </label>
        <label>
          <span>Minimum qualifying minutes</span>
          <input
            className="field"
            type="number"
            name="minimum_qualifying_minutes"
            min={1}
            max={480}
            step={1}
            defaultValue={state.values?.minimumQualifyingMinutes ?? "30"}
            required
          />
          {state.fieldErrors?.minimum_qualifying_minutes && (
            <span className="form-error">
              {state.fieldErrors.minimum_qualifying_minutes}
            </span>
          )}
        </label>
        <label className="full">
          <span>
            Change reason <span className="muted">(required when backdated)</span>
          </span>
          <textarea className="field" name="change_reason" maxLength={1000} rows={4} />
          {state.fieldErrors?.change_reason && (
            <span className="form-error">{state.fieldErrors.change_reason}</span>
          )}
        </label>
      </div>
      <p className="info-callout">
        Existing overtime detections will not change automatically. Run explicit
        overtime recalculation for affected finalized dates after saving.
      </p>
      {state.error && <p className="form-error">{state.error}</p>}
      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Create policy version"}
      </button>
    </form>
  );
}
