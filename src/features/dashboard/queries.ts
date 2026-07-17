import "server-only";

import { requireUser } from "@/features/employees/auth";
import type { AppRole } from "@/features/employees/types";
import { normalizeDashboardPayload } from "./normalize";
import type { DashboardAnalytics, DashboardRange } from "./types";

const rpcArgs = (range: DashboardRange) => ({
  p_start_date: range.startDate,
  p_end_date: range.endDate,
});

export async function getDashboardAnalytics(
  range: DashboardRange,
): Promise<DashboardAnalytics> {
  const { supabase, user } = await requireUser();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError) throw new Error("Unable to load dashboard analytics.");
  const role = (profile?.role ?? "employee") as AppRole;

  try {
    if (role === "hr_admin" || role === "super_admin") {
      const { data, error } = await supabase.rpc("get_hr_dashboard_analytics", rpcArgs(range));
      if (error) throw error;
      return normalizeDashboardPayload("hr", data, range);
    }

    const { data: managerData, error: managerError } = await supabase.rpc(
      "get_manager_dashboard_analytics",
      rpcArgs(range),
    );
    if (managerError) throw managerError;
    const manager = normalizeDashboardPayload("manager", managerData, range);
    if (manager.kind === "manager" && manager.directReportCount > 0) return manager;

    const { data: employeeData, error: employeeError } = await supabase.rpc(
      "get_employee_dashboard_analytics",
      rpcArgs(range),
    );
    if (employeeError) throw employeeError;
    return normalizeDashboardPayload("employee", employeeData, range);
  } catch {
    throw new Error("Unable to load dashboard analytics.");
  }
}
