"use client";

import { useActionState } from "react";
import { requestPasswordReset, type ResetRequestState } from "@/app/(auth)/forgot-password/actions";

const initialState: ResetRequestState = {};

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initialState);
  return (
    <form action={action} className="list">
      <label>Email<input className="field" style={{ width: "100%", marginTop: 6 }} name="email" type="email" required /></label>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      {state.success ? <p className="form-success" role="status">{state.success}</p> : null}
      <button className="btn primary" disabled={pending}>{pending ? "Sending…" : "Send reset link"}</button>
    </form>
  );
}
