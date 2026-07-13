import {
  requireEmployeeProfileManager,
  requireSuperAdmin,
} from "@/features/employees/auth";

export async function requireHrNoteManager(employeeId: string) {
  return requireEmployeeProfileManager(employeeId);
}

export async function requireDeletedHrNoteManager(employeeId: string) {
  const context = await requireSuperAdmin();
  const { data: employee } = await context.supabase
    .from("employees")
    .select("id")
    .eq("id", employeeId)
    .maybeSingle();

  return {
    ...context,
    employeeExists: Boolean(employee),
  };
}
