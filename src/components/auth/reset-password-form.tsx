"use client";

import { useActionState } from "react";
import { updatePassword, type UpdatePasswordState } from "@/app/(auth)/reset-password/actions";

const initialState: UpdatePasswordState = {};

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, initialState);
  return <form action={action} className="list"><label>New password<input className="field" style={{ width: "100%", marginTop: 6 }} name="password" type="password" minLength={8} required /></label><label>Confirm password<input className="field" style={{ width: "100%", marginTop: 6 }} name="confirmation" type="password" minLength={8} required /></label>{state.error ? <p className="form-error" role="alert">{state.error}</p> : null}<button className="btn primary" disabled={pending}>{pending ? "Updating…" : "Update password"}</button></form>;
}
