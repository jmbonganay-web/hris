import { redirect } from "next/navigation";
import { requireUser } from "@/features/employees/auth";
import type { AppRole } from "@/features/employees/types";
import { canManageNotificationSettings, canViewNotificationSettings } from "./predicates";
export { canManageNotificationSettings, canViewNotificationSettings } from "./predicates";
export async function requireNotificationSettingsViewer() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = (data?.role ?? "employee") as AppRole;
  if (!canViewNotificationSettings(role)) redirect("/notifications?error=unauthorized");
  return { supabase, user, role, canManage: canManageNotificationSettings(role) };
}
export async function requireNotificationSettingsManager() {
  const context = await requireNotificationSettingsViewer();
  if (!canManageNotificationSettings(context.role)) redirect("/notifications?error=unauthorized");
  return context;
}
