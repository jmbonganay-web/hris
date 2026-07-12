import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export default function ForgotPasswordPage() {
  return <main className="auth-page"><section className="card auth-card"><h1>Reset your password</h1><p className="muted auth-copy">Enter your account email and we will send a secure reset link.</p><ForgotPasswordForm /><Link className="auth-link" href="/login">Back to sign in</Link></section></main>;
}
