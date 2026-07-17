import type { AppRole } from "@/features/employees/types";
export function canViewNotificationSettings(role: AppRole) {
  return role === "hr_admin" || role === "super_admin";
}
export function canManageNotificationSettings(role: AppRole) {
  return role === "super_admin";
}
