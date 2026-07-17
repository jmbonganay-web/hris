import "server-only";
import { createClient } from "@/lib/supabase/server";
import { normalizePayrollApprovalQueue } from "../normalize";
import type { PayrollApprovalQueue } from "../types";

export async function listPayrollApprovals(): Promise<PayrollApprovalQueue> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_payroll_approvals");
  if (error) throw new Error("Unable to load payroll approvals.");
  return normalizePayrollApprovalQueue(data);
}
