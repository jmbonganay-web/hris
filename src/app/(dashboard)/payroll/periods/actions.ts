"use server";

import { revalidatePath } from "next/cache";
import { requirePayrollAdministrator, requirePayrollApprover } from "@/features/payroll/auth";
import { payrollPeriodStatusValues, type PayrollPeriodStatus } from "@/features/payroll/constants";
import { mapPayrollError } from "@/features/payroll/errors";
import type { PayrollActionState } from "@/features/payroll/types";
import { validateRecordVersion } from "@/features/payroll/validation";

function refresh(periodId: string) {
  revalidatePath("/payroll");
  revalidatePath("/payroll/periods");
  revalidatePath(`/payroll/periods/${periodId}`);
  revalidatePath("/dashboard");
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
}

export async function transitionPayrollPeriodAction(formData: FormData): Promise<PayrollActionState> {
  const checked = validateRecordVersion(formData.get("periodId"), formData.get("expectedVersion"));
  if (!checked.data) return checked.state ?? { error: "Reload the payroll period." };
  const toStatus = String(formData.get("toStatus")) as PayrollPeriodStatus;
  if (!payrollPeriodStatusValues.includes(toStatus)) return { error: "Choose a valid payroll period status." };
  const guard = toStatus === "approved" || toStatus === "locked" ? requirePayrollApprover : requirePayrollAdministrator;
  const { supabase } = await guard();
  const { error } = await supabase.rpc("transition_payroll_period", {
    p_period_id: checked.data.id,
    p_expected_version: checked.data.expectedVersion,
    p_to_status: toStatus,
    p_request_id: crypto.randomUUID(),
  });
  if (error) return { error: mapPayrollError(error.message) };
  refresh(checked.data.id);
  return { success: "Payroll period status updated." };
}

export async function reopenPayrollPeriodAction(formData: FormData): Promise<PayrollActionState> {
  const checked = validateRecordVersion(formData.get("periodId"), formData.get("expectedVersion"));
  if (!checked.data) return checked.state ?? { error: "Reload the payroll period." };
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason || reason.length > 1000) return { error: "Enter a reopening reason of 1,000 characters or fewer." };
  const { supabase } = await requirePayrollApprover();
  const { error } = await supabase.rpc("reopen_payroll_period", {
    p_period_id: checked.data.id,
    p_expected_version: checked.data.expectedVersion,
    p_reason: reason,
    p_request_id: crypto.randomUUID(),
  });
  if (error) return { error: mapPayrollError(error.message) };
  refresh(checked.data.id);
  return { success: "Payroll period reopened for review." };
}
