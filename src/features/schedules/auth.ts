import { requireAttendanceEmployee } from "@/features/attendance/auth";
import { requireOrganizationAdmin } from "@/features/organization/auth";

export async function requireScheduleAdmin() {
  return requireOrganizationAdmin();
}

export async function requireOwnScheduleEmployee() {
  return requireAttendanceEmployee();
}
