"use server";

import { revalidatePath } from "next/cache";
import {
  requirePayrollAdministrator,
  requirePayrollApprover,
} from "@/features/payroll/auth";
import { mapPayrollError } from "@/features/payroll/errors";
import type { PayrollActionState } from "@/features/payroll/types";
import {
  formDataToRecord,
  validatePayrollBasisRuleInput,
  validatePayrollCalculationRunInput,
  validatePayrollReasonActionInput,
  validateRecordVersion,
} from "@/features/payroll/validation";

function refreshPayrollCalculation(periodId?: string, employeeId?: string) {
  revalidatePath("/payroll");
  revalidatePath("/payroll/periods");
  revalidatePath("/payroll/settings/basis-rules");
  if (periodId) {
    revalidatePath(`/payroll/periods/${periodId}`);
    revalidatePath(`/payroll/periods/${periodId}/workspace`);
    revalidatePath(`/payroll/periods/${periodId}/exceptions`);
    if (employeeId) {
      revalidatePath(`/payroll/periods/${periodId}/employees/${employeeId}`);
    }
  }
  revalidatePath("/dashboard");
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
}

export async function createPayrollBasisRuleAction(
  formData: FormData,
): Promise<PayrollActionState> {
  const checked = validatePayrollBasisRuleInput(formDataToRecord(formData));
  if (!checked.data) return checked.state ?? { error: "Review the payroll basis rule." };
  const { supabase } = await requirePayrollAdministrator();
  const { error } = await supabase.rpc("create_payroll_basis_rule", {
    p_name: checked.data.name,
    p_annual_divisor: checked.data.annualDivisor,
    p_standard_hours_per_day: checked.data.standardHoursPerDay,
    p_rounding_mode: checked.data.roundingMode,
    p_effective_from: checked.data.effectiveFrom,
    p_change_reason: checked.data.changeReason,
    p_request_id: crypto.randomUUID(),
  });
  if (error) return { error: mapPayrollError(error.message) };
  refreshPayrollCalculation();
  return { success: "Payroll basis draft created." };
}

export async function submitPayrollBasisRuleAction(
  formData: FormData,
): Promise<PayrollActionState> {
  const checked = validateRecordVersion(
    formData.get("ruleId"),
    formData.get("expectedVersion"),
  );
  if (!checked.data) return checked.state ?? { error: "Reload the payroll basis rule." };
  const { supabase } = await requirePayrollAdministrator();
  const { error } = await supabase.rpc("submit_payroll_basis_rule", {
    p_rule_id: checked.data.id,
    p_expected_version: checked.data.expectedVersion,
    p_request_id: crypto.randomUUID(),
  });
  if (error) return { error: mapPayrollError(error.message) };
  refreshPayrollCalculation();
  return { success: "Payroll basis rule submitted for approval." };
}

export async function approvePayrollBasisRuleAction(
  formData: FormData,
): Promise<PayrollActionState> {
  const checked = validateRecordVersion(
    formData.get("ruleId"),
    formData.get("expectedVersion"),
  );
  if (!checked.data) return checked.state ?? { error: "Reload the payroll basis rule." };
  const { supabase } = await requirePayrollApprover();
  const { error } = await supabase.rpc("approve_payroll_basis_rule", {
    p_rule_id: checked.data.id,
    p_expected_version: checked.data.expectedVersion,
    p_request_id: crypto.randomUUID(),
  });
  if (error) return { error: mapPayrollError(error.message) };
  refreshPayrollCalculation();
  return { success: "Payroll basis rule approved." };
}

export async function rejectPayrollBasisRuleAction(
  formData: FormData,
): Promise<PayrollActionState> {
  const checked = validateRecordVersion(
    formData.get("ruleId"),
    formData.get("expectedVersion"),
  );
  if (!checked.data) return checked.state ?? { error: "Reload the payroll basis rule." };
  const reason = validatePayrollReasonActionInput({
    id: checked.data.id,
    reason: formData.get("reason"),
  });
  if (!reason.data) return reason.state ?? { error: "Enter a rejection reason." };
  const { supabase } = await requirePayrollApprover();
  const { error } = await supabase.rpc("reject_payroll_basis_rule", {
    p_rule_id: checked.data.id,
    p_expected_version: checked.data.expectedVersion,
    p_reason: reason.data.reason,
    p_request_id: crypto.randomUUID(),
  });
  if (error) return { error: mapPayrollError(error.message) };
  refreshPayrollCalculation();
  return { success: "Payroll basis rule rejected." };
}

export async function startPayrollCalculationAction(
  formData: FormData,
): Promise<PayrollActionState> {
  const checked = validatePayrollCalculationRunInput({
    ...formDataToRecord(formData),
    employee_ids: formData.getAll("employeeIds"),
  });
  if (!checked.data) return checked.state ?? { error: "Review the calculation request." };
  const { supabase } = await requirePayrollAdministrator();
  const { data, error } = await supabase.rpc("start_payroll_calculation_run", {
    p_payroll_period_id: checked.data.payrollPeriodId,
    p_mode: checked.data.mode,
    p_employee_ids: checked.data.employeeIds.length ? checked.data.employeeIds : null,
    p_idempotency_key: crypto.randomUUID(),
  });
  if (error) return { error: mapPayrollError(error.message) };
  const runStatus =
    data && typeof data === "object" && "status" in data && typeof data.status === "string"
      ? data.status
      : null;
  if (runStatus === "failed") {
    return { error: "The payroll calculation run could not be completed." };
  }
  refreshPayrollCalculation(checked.data.payrollPeriodId);
  return {
    success:
      runStatus === "completed_with_exceptions"
        ? "Payroll calculation completed with exceptions."
        : "Payroll calculation run completed.",
  };
}

export async function recalculatePayrollEmployeeAction(
  formData: FormData,
): Promise<PayrollActionState> {
  const checked = validatePayrollCalculationRunInput({
    payroll_period_id: formData.get("payrollPeriodId"),
    mode: "recalculate",
    employee_ids: [formData.get("employeeId")],
  });
  if (!checked.data) return checked.state ?? { error: "Review the recalculation request." };
  const employeeId = checked.data.employeeIds[0] as string;
  const { supabase } = await requirePayrollAdministrator();
  const { data: baseResult, error } = await supabase.rpc("recalculate_payroll_employee", {
    p_payroll_period_id: checked.data.payrollPeriodId,
    p_employee_id: employeeId,
    p_request_id: crypto.randomUUID(),
  });
  if (error) return { error: mapPayrollError(error.message) };

  const baseStatus =
    baseResult && typeof baseResult === "object" && "status" in baseResult
      ? String(baseResult.status)
      : null;
  if (baseStatus === "exception" || baseStatus === "excluded") {
    refreshPayrollCalculation(checked.data.payrollPeriodId, employeeId);
    return {
      success:
        baseStatus === "exception"
          ? "Employee base payroll recalculated with exceptions. Resolve them before calculating premiums."
          : "Employee remains excluded from this payroll period.",
    };
  }

  const { error: premiumError } = await supabase.rpc("calculate_payroll_premiums", {
    p_payroll_period_id: checked.data.payrollPeriodId,
    p_mode: "selected",
    p_employee_ids: [employeeId],
    p_idempotency_key: crypto.randomUUID(),
  });
  if (premiumError) {
    refreshPayrollCalculation(checked.data.payrollPeriodId, employeeId);
    return {
      error: `Base payroll was recalculated, but premiums remain pending: ${mapPayrollError(premiumError.message)}`,
    };
  }

  refreshPayrollCalculation(checked.data.payrollPeriodId, employeeId);
  return { success: "Employee base payroll and premiums recalculated." };
}

export async function excludeEmployeeFromPayrollAction(
  formData: FormData,
): Promise<PayrollActionState> {
  const checked = validatePayrollCalculationRunInput({
    payroll_period_id: formData.get("payrollPeriodId"),
    mode: "selected",
    employee_ids: [formData.get("employeeId")],
  });
  if (!checked.data) return checked.state ?? { error: "Review the employee exclusion." };
  const employeeId = checked.data.employeeIds[0] as string;
  const reason = validatePayrollReasonActionInput({
    id: employeeId,
    reason: formData.get("reason"),
  });
  if (!reason.data) return reason.state ?? { error: "Enter an exclusion reason." };
  const { supabase } = await requirePayrollAdministrator();
  const { error } = await supabase.rpc("exclude_employee_from_payroll", {
    p_payroll_period_id: checked.data.payrollPeriodId,
    p_employee_id: employeeId,
    p_reason: reason.data.reason,
    p_request_id: crypto.randomUUID(),
  });
  if (error) return { error: mapPayrollError(error.message) };
  refreshPayrollCalculation(checked.data.payrollPeriodId, employeeId);
  return { success: "Employee excluded from this payroll period." };
}

export async function reversePayrollExclusionAction(
  formData: FormData,
): Promise<PayrollActionState> {
  const checked = validatePayrollReasonActionInput({
    id: formData.get("exclusionId"),
    reason: formData.get("reason"),
  });
  if (!checked.data) return checked.state ?? { error: "Review the exclusion reversal." };
  const period = validatePayrollCalculationRunInput({
    payroll_period_id: formData.get("payrollPeriodId"),
    mode: "all",
  });
  if (!period.data) return period.state ?? { error: "Reload the payroll period." };
  const { supabase } = await requirePayrollAdministrator();
  const { error } = await supabase.rpc("reverse_payroll_exclusion", {
    p_exclusion_id: checked.data.id,
    p_reason: checked.data.reason,
    p_request_id: crypto.randomUUID(),
  });
  if (error) return { error: mapPayrollError(error.message) };
  refreshPayrollCalculation(period.data.payrollPeriodId);
  return { success: "Payroll exclusion reversed." };
}

export async function resolvePayrollExceptionAction(
  formData: FormData,
): Promise<PayrollActionState> {
  const checked = validatePayrollReasonActionInput({
    id: formData.get("exceptionId"),
    reason: formData.get("reason"),
  });
  if (!checked.data) return checked.state ?? { error: "Enter a resolution note." };
  const period = validatePayrollCalculationRunInput({
    payroll_period_id: formData.get("payrollPeriodId"),
    mode: "all",
  });
  if (!period.data) return period.state ?? { error: "Reload the payroll period." };
  const { supabase } = await requirePayrollAdministrator();
  const { error } = await supabase.rpc("resolve_payroll_exception", {
    p_exception_id: checked.data.id,
    p_resolution_note: checked.data.reason,
    p_request_id: crypto.randomUUID(),
  });
  if (error) return { error: mapPayrollError(error.message) };
  refreshPayrollCalculation(period.data.payrollPeriodId);
  return { success: "Payroll warning resolved." };
}

export async function ignoreBlockingPayrollExceptionAction(
  formData: FormData,
): Promise<PayrollActionState> {
  const checked = validatePayrollReasonActionInput({
    id: formData.get("exceptionId"),
    reason: formData.get("reason"),
  });
  if (!checked.data) return checked.state ?? { error: "Enter an override reason." };
  const period = validatePayrollCalculationRunInput({
    payroll_period_id: formData.get("payrollPeriodId"),
    mode: "all",
  });
  if (!period.data) return period.state ?? { error: "Reload the payroll period." };
  const { supabase } = await requirePayrollApprover();
  const { error } = await supabase.rpc("ignore_blocking_payroll_exception", {
    p_exception_id: checked.data.id,
    p_reason: checked.data.reason,
    p_request_id: crypto.randomUUID(),
  });
  if (error) return { error: mapPayrollError(error.message) };
  refreshPayrollCalculation(period.data.payrollPeriodId);
  return { success: "Blocking payroll exception overridden." };
}
