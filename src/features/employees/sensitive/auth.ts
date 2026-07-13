import { requireEmployeeProfileManager } from "@/features/employees/auth";

export async function requireSensitiveEmployeeManager(employeeId: string) {
  return requireEmployeeProfileManager(employeeId);
}
