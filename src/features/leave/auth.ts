import { requireAttendanceEmployee } from "@/features/attendance/auth";
import { requireOrganizationAdmin } from "@/features/organization/auth";

export async function requireLeaveEmployee() {
  return requireAttendanceEmployee();
}
export async function requireLeaveAdmin() {
  return requireOrganizationAdmin();
}
