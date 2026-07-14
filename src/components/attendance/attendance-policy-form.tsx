"use client";

import { useActionState } from "react";
import type { AttendancePolicyActionState } from "@/features/attendance/policy/types";

const initialState: AttendancePolicyActionState = {};

export function AttendancePolicyForm({
  action,
  companyDate,
}: {
  action: (
    state: AttendancePolicyActionState,
    formData: FormData,
  ) => Promise<AttendancePolicyActionState>;
  companyDate: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form action={formAction} className="card form-card attendance-policy-form">
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
          <span>Late grace period in minutes</span>
          <input
            className="field"
            type="number"
            name="late_grace_minutes"
            min={0}
            max={120}
            step={1}
            defaultValue={state.values?.lateGraceMinutes ?? "0"}
            required
          />
          {state.fieldErrors?.late_grace_minutes && (
            <span className="form-error">{state.fieldErrors.late_grace_minutes}</span>
          )}
        </label>
        <label className="full">
          <span>Change reason <span className="muted">(required when backdated)</span></span>
          <textarea className="field" name="change_reason" maxLength={1000} rows={4} />
          {state.fieldErrors?.change_reason && (
            <span className="form-error">{state.fieldErrors.change_reason}</span>
          )}
        </label>
      </div>
      <p className="info-callout">
        A backdated policy will not automatically change existing finalized attendance.
        Run a manual recalculation for the affected date range after saving.
      </p>
      {state.error && <p className="form-error">{state.error}</p>}
      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Create policy version"}
      </button>
    </form>
  );
}
