"use server";

import { revalidatePath } from "next/cache";
import { requirePayrollAdministrator } from "@/features/payroll/auth";
import { mapPayrollError } from "@/features/payroll/errors";
import type { PayrollActionState } from "@/features/payroll/types";
import { formDataToRecord, validateCompensationInput, validateRecordVersion, validateScheduleAssignmentInput } from "@/features/payroll/validation";

function refresh(employeeId: string) {
  revalidatePath("/payroll");
  revalidatePath("/payroll/approvals");
  revalidatePath(`/employees/${employeeId}`);
  revalidatePath(`/employees/${employeeId}/compensation`);
  revalidatePath("/me/compensation");
  revalidatePath("/dashboard");
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
}

export async function createCompensationDraftAction(employeeId: string, formData: FormData): Promise<PayrollActionState> {
  const checked = validateCompensationInput(formDataToRecord(formData));
  if (!checked.data) return checked.state ?? { error: "Review the compensation details." };
  const { supabase } = await requirePayrollAdministrator();
  const { error } = await supabase.rpc("create_compensation_draft", {
    p_employee_id: employeeId,
    p_compensation_type: checked.data.compensationType,
    p_monthly_salary: checked.data.monthlySalary,
    p_hourly_rate: checked.data.hourlyRate,
    p_standard_hours_per_day: checked.data.standardHoursPerDay,
    p_standard_hours_per_week: checked.data.standardHoursPerWeek,
    p_effective_from: checked.data.effectiveFrom,
    p_change_reason: checked.data.changeReason,
    p_request_id: crypto.randomUUID(),
  });
  if (error) return { error: mapPayrollError(error.message) };
  refresh(employeeId);
  return { success: "Compensation draft created." };
}

export async function updateCompensationDraftAction(employeeId: string, formData: FormData): Promise<PayrollActionState> {
  const version = validateRecordVersion(formData.get("recordId"), formData.get("expectedVersion"));
  const checked = validateCompensationInput(formDataToRecord(formData));
  if (!version.data) return version.state ?? { error: "Reload the compensation record." };
  if (!checked.data) return checked.state ?? { error: "Review the compensation details." };
  const { supabase } = await requirePayrollAdministrator();
  const { error } = await supabase.rpc("update_compensation_draft", {
    p_record_id: version.data.id,
    p_expected_version: version.data.expectedVersion,
    p_compensation_type: checked.data.compensationType,
    p_monthly_salary: checked.data.monthlySalary,
    p_hourly_rate: checked.data.hourlyRate,
    p_standard_hours_per_day: checked.data.standardHoursPerDay,
    p_standard_hours_per_week: checked.data.standardHoursPerWeek,
    p_effective_from: checked.data.effectiveFrom,
    p_change_reason: checked.data.changeReason,
    p_request_id: crypto.randomUUID(),
  });
  if (error) return { error: mapPayrollError(error.message) };
  refresh(employeeId);
  return { success: "Compensation draft updated." };
}

export async function submitCompensationAction(employeeId: string, formData: FormData): Promise<PayrollActionState> {
  const checked = validateRecordVersion(formData.get("recordId"), formData.get("expectedVersion"));
  if (!checked.data) return checked.state ?? { error: "Reload the compensation record." };
  const { supabase } = await requirePayrollAdministrator();
  const { error } = await supabase.rpc("submit_compensation_record", {
    p_record_id: checked.data.id,
    p_expected_version: checked.data.expectedVersion,
    p_request_id: crypto.randomUUID(),
  });
  if (error) return { error: mapPayrollError(error.message) };
  refresh(employeeId);
  return { success: "Compensation request submitted for approval." };
}

export async function createScheduleAssignmentDraftAction(employeeId: string, formData: FormData): Promise<PayrollActionState> {
  const checked = validateScheduleAssignmentInput(formDataToRecord(formData));
  if (!checked.data) return checked.state ?? { error: "Review the payroll schedule assignment." };
  const { supabase } = await requirePayrollAdministrator();
  const { error } = await supabase.rpc("create_schedule_assignment_draft", {
    p_employee_id: employeeId,
    p_payroll_schedule_id: checked.data.payrollScheduleId,
    p_effective_from: checked.data.effectiveFrom,
    p_change_reason: checked.data.changeReason,
    p_override_mid_period: checked.data.overrideMidPeriod,
    p_override_reason: checked.data.overrideReason,
    p_request_id: crypto.randomUUID(),
  });
  if (error) return { error: mapPayrollError(error.message) };
  refresh(employeeId);
  return { success: "Payroll schedule assignment draft created." };
}

export async function updateScheduleAssignmentDraftAction(employeeId: string, formData: FormData): Promise<PayrollActionState> {
  const version = validateRecordVersion(formData.get("assignmentId"), formData.get("expectedVersion"));
  const checked = validateScheduleAssignmentInput(formDataToRecord(formData));
  if (!version.data) return version.state ?? { error: "Reload the payroll schedule assignment." };
  if (!checked.data) return checked.state ?? { error: "Review the payroll schedule assignment." };
  const { supabase } = await requirePayrollAdministrator();
  const { error } = await supabase.rpc("update_schedule_assignment_draft", {
    p_assignment_id: version.data.id,
    p_expected_version: version.data.expectedVersion,
    p_payroll_schedule_id: checked.data.payrollScheduleId,
    p_effective_from: checked.data.effectiveFrom,
    p_change_reason: checked.data.changeReason,
    p_override_mid_period: checked.data.overrideMidPeriod,
    p_override_reason: checked.data.overrideReason,
    p_request_id: crypto.randomUUID(),
  });
  if (error) return { error: mapPayrollError(error.message) };
  refresh(employeeId);
  return { success: "Payroll schedule assignment updated." };
}

export async function submitScheduleAssignmentAction(employeeId: string, formData: FormData): Promise<PayrollActionState> {
  const checked = validateRecordVersion(formData.get("assignmentId"), formData.get("expectedVersion"));
  if (!checked.data) return checked.state ?? { error: "Reload the payroll schedule assignment." };
  const { supabase } = await requirePayrollAdministrator();
  const { error } = await supabase.rpc("submit_schedule_assignment", {
    p_assignment_id: checked.data.id,
    p_expected_version: checked.data.expectedVersion,
    p_request_id: crypto.randomUUID(),
  });
  if (error) return { error: mapPayrollError(error.message) };
  refresh(employeeId);
  return { success: "Payroll schedule assignment submitted for approval." };
}
