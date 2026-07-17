export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import { getDocumentPermissionContext } from "@/features/documents/auth";
import { getUnreadNotificationCount } from "@/features/notifications/queries";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name,last_name,display_name,role")
    .eq("id", user.id)
    .maybeSingle();

  const [documentContext, unreadNotificationCount] = await Promise.all([
    getDocumentPermissionContext(),
    getUnreadNotificationCount(),
  ]);

  const name = profile?.display_name?.trim()
    || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ")
    || user.email
    || "User";

  return (
    <AppShell user={{
      name,
      email: user.email ?? "",
      role: profile?.role ?? "employee",
      documentPermissions: documentContext.permissions,
      unreadNotificationCount,
    }}>
      {children}
    </AppShell>
  );
}
