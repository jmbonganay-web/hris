import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";
import { createClient } from "@/lib/supabase/server";

export default async function LoginPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");

  return (
    <main className="auth-page">
      <section className="card auth-card">
        <div className="brand auth-brand">
          <span className="brand-mark auth-brand-mark"><ShieldCheck size={20} /></span>
          <span>Northstar HR</span>
        </div>
        <h1>Welcome back</h1>
        <p className="muted auth-copy">Sign in to access your HR workspace.</p>
        <LoginForm />
      </section>
    </main>
  );
}
