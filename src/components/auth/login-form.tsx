"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, type LoginState } from "@/app/(auth)/login/actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="list">
      <label>
        Email
        <input
          className="field"
          style={{ width: "100%", marginTop: 6 }}
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </label>
      <label>
        Password
        <input
          className="field"
          style={{ width: "100%", marginTop: 6 }}
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <button className="btn primary" style={{ justifyContent: "center" }} disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <Link className="auth-link" href="/forgot-password">Forgot password?</Link>
    </form>
  );
}
