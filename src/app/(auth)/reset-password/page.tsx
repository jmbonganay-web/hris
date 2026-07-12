import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default function ResetPasswordPage() {
  return <main className="auth-page"><section className="card auth-card"><h1>Create a new password</h1><p className="muted auth-copy">Use at least eight characters.</p><ResetPasswordForm /></section></main>;
}
