"use client";

import { useActionState } from "react";
import type { LeaveActionState } from "@/features/leave/types";

const initialState: LeaveActionState = {};

export function CancelApprovedLeaveForm({
  requestGroupId,
  action,
}: {
  requestGroupId: string;
  action: (state: LeaveActionState, formData: FormData) => Promise<LeaveActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form
      action={formAction}
      className="card form-card danger-zone-form"
      onSubmit={(event) => {
        if (!window.confirm("Cancel this approved request and restore its remaining leave charges?")) event.preventDefault();
      }}
    >
      <h2 className="card-title">Cancel approved leave</h2>
      <input type="hidden" name="request_group_id" value={requestGroupId} />
      <input type="hidden" name="expected_status" value="approved" />
      <label>
        <span>Cancellation reason <span className="muted">(required, private)</span></span>
        <textarea className="field" name="reason" rows={4} maxLength={1000} required />
      </label>
      {state.error && <p className="form-error">{state.error}</p>}
      <div className="form-actions"><button className="btn danger" type="submit" disabled={pending}>{pending ? "Cancelling…" : "Cancel approved request"}</button></div>
    </form>
  );
}
