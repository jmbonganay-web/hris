import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/features/employees/types";

export async function requireOrganizationAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = (profile?.role ?? "employee") as AppRole;
  if (role !== "super_admin" && role !== "hr_admin") {
    redirect("/settings?error=unauthorized");
  }

  return { supabase, user, role };
}
