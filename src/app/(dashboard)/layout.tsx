export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name,last_name,display_name,role")
    .eq("id", user.id)
    .maybeSingle();

  const name = profile?.display_name?.trim()
    || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ")
    || user.email
    || "User";

  return (
    <AppShell user={{ name, email: user.email ?? "", role: profile?.role ?? "employee" }}>
      {children}
    </AppShell>
  );
}
