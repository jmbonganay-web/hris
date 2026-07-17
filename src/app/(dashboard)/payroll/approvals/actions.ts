"use server";

import { revalidatePath } from "next/cache";
import { requirePayrollApprover } from "@/features/payroll/auth";
import { mapPayrollError } from "@/features/payroll/errors";
import type { PayrollActionState } from "@/features/payroll/types";
import { validateRecordVersion } from "@/features/payroll/validation";

function refresh(employeeId?: string) {
  revalidatePath("/payroll");
  revalidatePath("/payroll/approvals");
  revalidatePath("/payroll/periods");
  if (employeeId) revalidatePath(`/employees/${employeeId}/compensation`);
  revalidatePath("/me/compensation");
  revalidatePath("/dashboard");
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
}

async function decide(
  rpc: string,
  idKey: "p_record_id" | "p_assignment_id",
  formData: FormData,
  extra: Record<string, unknown>,
  success: string,
): Promise<PayrollActionState> {
  const checked = validateRecordVersion(formData.get("requestId"), formData.get("expectedVersion"));
  if (!checked.data) return checked.state ?? { error: "Reload the approval request." };
  const { supabase } = await requirePayrollApprover();
  const { error } = await supabase.rpc(rpc, {
    [idKey]: checked.data.id,
    p_expected_version: checked.data.expectedVersion,
    ...extra,
    p_request_id: crypto.randomUUID(),
  });
  if (error) return { error: mapPayrollError(error.message) };
  refresh(String(formData.get("employeeId") ?? "") || undefined);
  return { success };
}

export async function approveCompensationAction(formData: FormData): Promise<PayrollActionState> {
  const isBackdated = formData.get("isBackdated") === "true";
  const confirmed = formData.get("confirmBackdated") === "yes";
  if (isBackdated && !confirmed) return { error: "Confirm the backdated compensation approval." };
  return decide("approve_compensation_record", "p_record_id", formData, { p_backdated_confirmation: confirmed }, "Compensation request approved.");
}

export async function rejectCompensationAction(formData: FormData): Promise<PayrollActionState> {
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason || reason.length > 1000) return { error: "Enter a rejection reason of 1,000 characters or fewer." };
  return decide("reject_compensation_record", "p_record_id", formData, { p_rejection_reason: reason }, "Compensation request rejected.");
}

export async function approveScheduleAssignmentAction(formData: FormData): Promise<PayrollActionState> {
  const requiresOverride = formData.get("midPeriodConflict") === "true";
  const confirmed = formData.get("confirmMidPeriod") === "yes";
  if (requiresOverride && !confirmed) return { error: "Confirm the mid-period payroll schedule override." };
  return decide("approve_schedule_assignment", "p_assignment_id", formData, { p_mid_period_confirmation: confirmed }, "Payroll schedule assignment approved.");
}

export async function rejectScheduleAssignmentAction(formData: FormData): Promise<PayrollActionState> {
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason || reason.length > 1000) return { error: "Enter a rejection reason of 1,000 characters or fewer." };
  return decide("reject_schedule_assignment", "p_assignment_id", formData, { p_rejection_reason: reason }, "Payroll schedule assignment rejected.");
}