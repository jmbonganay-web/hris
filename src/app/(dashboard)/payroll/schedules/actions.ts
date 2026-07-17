"use server";

import { revalidatePath } from "next/cache";
import { requirePayrollAdministrator } from "@/features/payroll/auth";
import { mapPayrollError } from "@/features/payroll/errors";
import type { PayrollActionState } from "@/features/payroll/types";
import { formDataToRecord, validatePayrollScheduleInput, validateRecordVersion } from "@/features/payroll/validation";

function refresh(scheduleId?: string) {
  revalidatePath("/payroll");
  revalidatePath("/payroll/schedules");
  if (scheduleId) revalidatePath(`/payroll/schedules/${scheduleId}`);
  revalidatePath("/payroll/periods");
  revalidatePath("/dashboard");
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
}

export async function createPayrollScheduleAction(formData: FormData): Promise<PayrollActionState> {
  const checked = validatePayrollScheduleInput(formDataToRecord(formData));
  if (!checked.data) return checked.state ?? { error: "Review the payroll schedule." };
  const { supabase } = await requirePayrollAdministrator();
  const { error } = await supabase.rpc("create_payroll_schedule", {
    p_name: checked.data.name,
    p_code: checked.data.code,
    p_schedule_type: checked.data.scheduleType,
    p_anchor_date: checked.data.anchorDate,
    p_first_period_end_day: checked.data.firstPeriodEndDay,
    p_cutoff_offset_days: checked.data.cutoffOffsetDays,
    p_payment_offset_days: checked.data.paymentOffsetDays,
    p_request_id: crypto.randomUUID(),
  });
  if (error) return { error: mapPayrollError(error.message) };
  refresh();
  return { success: "Payroll schedule created." };
}

export async function updatePayrollScheduleAction(formData: FormData): Promise<PayrollActionState> {
  const idVersion = validateRecordVersion(formData.get("scheduleId"), formData.get("expectedVersion"));
  const checked = validatePayrollScheduleInput(formDataToRecord(formData));
  if (!idVersion.data) return idVersion.state ?? { error: "Reload the payroll schedule." };
  if (!checked.data) return checked.state ?? { error: "Review the payroll schedule." };
  const { supabase } = await requirePayrollAdministrator();
  const { error } = await supabase.rpc("update_payroll_schedule", {
    p_schedule_id: idVersion.data.id,
    p_expected_version: idVersion.data.expectedVersion,
    p_name: checked.data.name,
    p_code: checked.data.code,
    p_anchor_date: checked.data.anchorDate,
    p_first_period_end_day: checked.data.firstPeriodEndDay,
    p_cutoff_offset_days: checked.data.cutoffOffsetDays,
    p_payment_offset_days: checked.data.paymentOffsetDays,
    p_request_id: crypto.randomUUID(),
  });
  if (error) return { error: mapPayrollError(error.message) };
  refresh(idVersion.data.id);
  return { success: "Payroll schedule updated." };
}

export async function setPayrollScheduleActiveAction(formData: FormData): Promise<PayrollActionState> {
  const checked = validateRecordVersion(formData.get("scheduleId"), formData.get("expectedVersion"));
  if (!checked.data) return checked.state ?? { error: "Reload the payroll schedule." };
  const { supabase } = await requirePayrollAdministrator();
  const { error } = await supabase.rpc("set_payroll_schedule_active", {
    p_schedule_id: checked.data.id,
    p_expected_version: checked.data.expectedVersion,
    p_is_active: formData.get("isActive") === "true",
    p_request_id: crypto.randomUUID(),
  });
  if (error) return { error: mapPayrollError(error.message) };
  refresh(checked.data.id);
  return { success: "Payroll schedule status updated." };
}
