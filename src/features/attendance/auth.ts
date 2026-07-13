import { redirect } from "next/navigation";
import { requireHrAdmin, requireUser } from "@/features/employees/auth";
import type { AttendanceEmployeeSummary } from "./types";

const employeeSelect = `
  id,
  profile_id,
  employee_number,
  first_name,
  last_name,
  department_id,
  department:departments!employees_department_id_fkey(id,name)
`;

export async function requireAttendanceEmployee() {
  const { supabase, user } = await requireUser();
  const { data: employee, error } = await supabase
    .from("employees")
    .select(employeeSelect)
    .eq("profile_id", user.id)
    .is("archived_at", null)
    .maybeSingle();

  if (error || !employee) {
    redirect("/dashboard?error=attendance_profile_missing");
  }

  return {
    supabase,
    user,
    employee: employee as unknown as AttendanceEmployeeSummary,
  };
}

export async function requireAttendanceAdmin() {
  return requireHrAdmin();
}
