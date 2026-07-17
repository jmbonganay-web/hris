import "server-only";
import { createClient } from "@/lib/supabase/server";
import { normalizeEmployeeCompensationAdmin, normalizeOwnCompensation } from "../normalize";
import type { EmployeeCompensationAdminDetail, OwnCompensationDetail } from "../types";

export async function getEmployeeCompensationAdmin(employeeId: string): Promise<EmployeeCompensationAdminDetail> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_employee_compensation_admin", { p_employee_id: employeeId });
  if (error) throw new Error("Unable to load employee compensation.");
  return normalizeEmployeeCompensationAdmin(data);
}

export async function getOwnCompensation(): Promise<OwnCompensationDetail> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_own_compensation");
  if (error) throw new Error("Unable to load your compensation.");
  return normalizeOwnCompensation(data);
}
