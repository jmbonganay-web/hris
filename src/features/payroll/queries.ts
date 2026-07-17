import "server-only";
import { createClient } from "@/lib/supabase/server";
import { normalizePayrollOverview } from "./normalize";
import type { PayrollOverview } from "./types";

export async function getPayrollOverview(): Promise<PayrollOverview> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_payroll_overview");
  if (error) throw new Error("Unable to load payroll overview.");
  return normalizePayrollOverview(data);
}
