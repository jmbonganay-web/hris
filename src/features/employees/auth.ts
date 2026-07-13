import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "./types";

export async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

async function getRoleForUser(userId: string): Promise<AppRole> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("role").eq("id", userId).single();
  return (data?.role ?? "employee") as AppRole;
}

export async function getCurrentRole(): Promise<AppRole> {
  const { user } = await requireUser();
  return getRoleForUser(user.id);
}

export async function requireHrAdmin() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = (data?.role ?? "employee") as AppRole;
  if (role !== "super_admin" && role !== "hr_admin") redirect("/employees?error=unauthorized");
  return { supabase, user, role };
}

export async function requireEmployeeProfileAccess(employeeId: string) {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = (profile?.role ?? "employee") as AppRole;
  const canManage = role === "super_admin" || role === "hr_admin";

  if (!canManage) {
    const { data: ownEmployee } = await supabase
      .from("employees")
      .select("id")
      .eq("id", employeeId)
      .eq("profile_id", user.id)
      .maybeSingle();
    if (!ownEmployee) redirect("/dashboard?error=unauthorized");
  }

  return { supabase, user, role, canManage, isSelf: !canManage };
}

export async function requireEmployeeProfileManager(employeeId: string) {
  const context = await requireHrAdmin();
  const { data: employee } = await context.supabase
    .from("employees")
    .select("id")
    .eq("id", employeeId)
    .maybeSingle();
  if (!employee) redirect("/employees?error=not_found");
  return context;
}
