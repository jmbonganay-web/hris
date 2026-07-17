"use server";

import { revalidatePath } from "next/cache";
import { requirePayrollApprover } from "@/features/payroll/auth";
import { mapPayrollError } from "@/features/payroll/errors";
import type { PayrollActionState } from "@/features/payroll/types";

function refreshPayroll() {
  revalidatePath("/payroll");
  revalidatePath("/payroll/periods");
  revalidatePath("/dashboard");
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
}

export async function runPayrollPeriodGenerationAction(formData: FormData): Promise<PayrollActionState> {
  if (formData.get("confirm") !== "yes") return { error: "Confirm payroll period generation." };
  const { supabase } = await requirePayrollApprover();
  const { error } = await supabase.rpc("ensure_payroll_period_horizon", {
    p_source: "manual",
    p_request_id: crypto.randomUUID(),
  });
  if (error) return { error: mapPayrollError(error.message) };
  refreshPayroll();
  return { success: "Payroll period generation completed." };
}
