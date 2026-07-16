"use client";

import { useActionState } from "react";
import type { LeaveActionState } from "@/features/leave/types";

export const leaveConflictResolutions = [
  "reviewed_no_change",
  "leave_cancelled",
  "attendance_corrected",
  "replacement_requested",
] as const;

const labels: Record<(typeof leaveConflictResolutions)[number], string> = {
  reviewed_no_change: "Reviewed — no change",
  leave_cancelled: "Leave cancelled",
  attendance_corrected: "Attendance corrected",
  replacement_requested: "Replacement requested",
};

export function ResolveLeaveConflictForm({
  action,
}: {
  action: (state: LeaveActionState, formData: FormData) => Promise<LeaveActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="conflict-resolution-form">
      <select className="field" name="resolution_type" required defaultValue="reviewed_no_change">
        {leaveConflictResolutions.map((value) => <option key={value} value={value}>{labels[value]}</option>)}
      </select>
      <textarea className="field" name="private_resolution_note" rows={2} maxLength={1000} placeholder="Private resolution note (optional)" />
      {state.error && <p className="form-error">{state.error}</p>}
      {state.success && <p className="form-success">{state.success}</p>}
      <button className="btn" type="submit" disabled={pending}>{pending ? "Saving…" : "Record resolution"}</button>
    </form>
  );
}
