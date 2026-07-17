import type { AppRole } from "../employees/types.ts";

export function canViewPayrollAdministration(role: AppRole) {
  return role === "hr_admin" || role === "super_admin";
}

export function canManagePayroll(role: AppRole) {
  return role === "hr_admin" || role === "super_admin";
}

export function canApprovePayroll(role: AppRole) {
  return role === "super_admin";
}

export async function requirePayrollAdministrator() {
  const { requireHrAdmin } = await import("../employees/auth.ts");
  return requireHrAdmin();
}

export async function requirePayrollApprover() {
  const { requireSuperAdmin } = await import("../employees/auth.ts");
  return requireSuperAdmin();
}

export async function requirePayrollViewer() {
  const { requireUser } = await import("../employees/auth.ts");
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = (data?.role ?? "employee") as AppRole;
  return {
    supabase,
    user,
    role,
    canAdminister: canViewPayrollAdministration(role),
    canApprove: canApprovePayroll(role),
  };
}
