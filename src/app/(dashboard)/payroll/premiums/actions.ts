"use server";

import { revalidatePath } from "next/cache";
import { requirePayrollAdministrator, requirePayrollApprover } from "@/features/payroll/auth";
import { mapPayrollError } from "@/features/payroll/errors";
import type { PayrollActionState } from "@/features/payroll/types";
import {
  formDataToRecord,
  validateAttendanceDeductionRuleInput,
  validatePremiumCalculationInput,
  validatePremiumPresetCloneInput,
  validatePremiumRuleCloneInput,
  validatePremiumRuleSetInput,
  validatePayrollReasonActionInput,
  validateRecordVersion,
  validateDraftUpdateIdentity,
} from "@/features/payroll/validation";

function refreshPremiumPayroll(periodId?: string, employeeId?: string) {
  for (const path of [
    "/payroll",
    "/payroll/settings/premium-rules",
    "/payroll/settings/attendance-deduction-rules",
    "/payroll/approvals",
    "/payroll/approvals/premium-rules",
    "/payroll/periods",
    "/dashboard",
    "/notifications",
  ]) revalidatePath(path);
  if (periodId) {
    revalidatePath(`/payroll/periods/${periodId}`);
    revalidatePath(`/payroll/periods/${periodId}/workspace`);
    revalidatePath(`/payroll/periods/${periodId}/exceptions`);
    if (employeeId) revalidatePath(`/payroll/periods/${periodId}/employees/${employeeId}`);
  }
  revalidatePath("/", "layout");
}

export async function createPremiumRuleSetAction(formData: FormData): Promise<PayrollActionState> {
  const checked = validatePremiumRuleSetInput(formDataToRecord(formData));
  if (!checked.data) return checked.state ?? { error: "Review the premium rule." };
  const { supabase } = await requirePayrollAdministrator();
  const d = checked.data;
  const { error } = await supabase.rpc("create_premium_rule_set", {
    p_name: d.name,
    p_scope_type: d.scopeType,
    p_employment_type: d.employmentType,
    p_department_id: d.departmentId,
    p_position_id: d.positionId,
    p_payroll_group_id: d.payrollGroupId,
    p_effective_from: d.effectiveFrom,
    p_effective_to: d.effectiveTo,
    p_change_reason: d.changeReason,
    p_source_agency: d.sourceAgency,
    p_source_reference: d.sourceReference,
    p_source_publication_date: d.sourcePublicationDate,
    p_source_url: d.sourceUrl,
    p_day_rules: d.dayRules.map((rule) => ({
      day_type: rule.dayType,
      regular_time_multiplier: rule.regularTimeMultiplier,
      overtime_multiplier: rule.overtimeMultiplier,
      additional_premium_only: rule.additionalPremiumOnly,
      night_differential_percentage: rule.nightDifferentialPercentage,
      night_window_start: rule.nightWindowStart,
      night_window_end: rule.nightWindowEnd,
      overtime_rounding_mode: rule.overtimeRoundingMode,
      overtime_rounding_increment_minutes: rule.overtimeRoundingIncrementMinutes,
      night_rounding_mode: rule.nightRoundingMode,
      night_rounding_increment_minutes: rule.nightRoundingIncrementMinutes,
    })),
    p_request_id: crypto.randomUUID(),
  });
  if (error) return { error: mapPayrollError(error.message) };
  refreshPremiumPayroll();
  return { success: "Premium rule draft created." };
}

export async function updatePremiumRuleSetDraftAction(formData: FormData): Promise<PayrollActionState> {
  const identity = validateDraftUpdateIdentity(formData.get("ruleId"), formData.get("expectedUpdatedAt"));
  const checked = validatePremiumRuleSetInput(formDataToRecord(formData));
  if (!identity.data || !checked.data) return identity.state ?? checked.state ?? { error: "Reload and review the premium-rule draft." };
  const { supabase } = await requirePayrollAdministrator();
  const d = checked.data;
  const { error } = await supabase.rpc("update_premium_rule_set_draft", {
    p_rule_set_id: identity.data.id,
    p_expected_updated_at: identity.data.expectedUpdatedAt,
    p_name: d.name,
    p_scope_type: d.scopeType,
    p_employment_type: d.employmentType,
    p_department_id: d.departmentId,
    p_position_id: d.positionId,
    p_payroll_group_id: d.payrollGroupId,
    p_effective_from: d.effectiveFrom,
    p_effective_to: d.effectiveTo,
    p_change_reason: d.changeReason,
    p_source_agency: d.sourceAgency,
    p_source_reference: d.sourceReference,
    p_source_publication_date: d.sourcePublicationDate,
    p_source_url: d.sourceUrl,
    p_day_rules: d.dayRules.map((rule) => ({
      day_type: rule.dayType,
      regular_time_multiplier: rule.regularTimeMultiplier,
      overtime_multiplier: rule.overtimeMultiplier,
      additional_premium_only: rule.additionalPremiumOnly,
      night_differential_percentage: rule.nightDifferentialPercentage,
      night_window_start: rule.nightWindowStart,
      night_window_end: rule.nightWindowEnd,
      overtime_rounding_mode: rule.overtimeRoundingMode,
      overtime_rounding_increment_minutes: rule.overtimeRoundingIncrementMinutes,
      night_rounding_mode: rule.nightRoundingMode,
      night_rounding_increment_minutes: rule.nightRoundingIncrementMinutes,
    })),
    p_request_id: crypto.randomUUID(),
  });
  if (error) return { error: mapPayrollError(error.message) };
  refreshPremiumPayroll();
  return { success: "Premium-rule draft updated." };
}

export async function clonePremiumRulePresetAction(formData: FormData): Promise<PayrollActionState> {
  const checked = validatePremiumPresetCloneInput(formDataToRecord(formData));
  if (!checked.data) return checked.state ?? { error: "Review the preset draft." };
  const { supabase } = await requirePayrollAdministrator();
  const d = checked.data;
  const { error } = await supabase.rpc("clone_premium_rule_preset", {
    p_preset_code: d.presetCode,
    p_name: d.name,
    p_scope_type: d.scopeType,
    p_employment_type: d.employmentType,
    p_department_id: d.departmentId,
    p_position_id: d.positionId,
    p_payroll_group_id: d.payrollGroupId,
    p_effective_from: d.effectiveFrom,
    p_effective_to: d.effectiveTo,
    p_change_reason: d.changeReason,
    p_request_id: crypto.randomUUID(),
  });
  if (error) return { error: mapPayrollError(error.message) };
  refreshPremiumPayroll();
  return { success: "Reference preset cloned as an inactive draft." };
}

export async function clonePremiumRuleVersionAction(formData: FormData): Promise<PayrollActionState> {
  const checked = validatePremiumRuleCloneInput(formDataToRecord(formData));
  if (!checked.data) return checked.state ?? { error: "Review the rule version." };
  const { supabase } = await requirePayrollAdministrator();
  const { error } = await supabase.rpc("clone_premium_rule_version", {
    p_rule_set_id: checked.data.id,
    p_effective_from: checked.data.effectiveFrom,
    p_effective_to: checked.data.effectiveTo,
    p_change_reason: checked.data.changeReason,
    p_request_id: crypto.randomUUID(),
  });
  if (error) return { error: mapPayrollError(error.message) };
  refreshPremiumPayroll();
  return { success: "New premium-rule version created as a draft." };
}

async function versionAction(
  formData: FormData,
  rpc: "submit_premium_rule_set" | "approve_premium_rule_set" | "submit_attendance_deduction_rule" | "approve_attendance_deduction_rule",
  approver: boolean,
  success: string,
): Promise<PayrollActionState> {
  const checked = validateRecordVersion(formData.get("ruleId"), formData.get("expectedVersion"));
  if (!checked.data) return checked.state ?? { error: "Reload the selected rule." };
  const { supabase } = approver ? await requirePayrollApprover() : await requirePayrollAdministrator();
  const { error } = await supabase.rpc(rpc, {
    [rpc.includes("attendance") ? "p_rule_id" : "p_rule_set_id"]: checked.data.id,
    p_expected_version: checked.data.expectedVersion,
    p_request_id: crypto.randomUUID(),
  });
  if (error) return { error: mapPayrollError(error.message) };
  refreshPremiumPayroll();
  return { success };
}

export async function submitPremiumRuleSetAction(formData: FormData): Promise<PayrollActionState> {
  return versionAction(formData, "submit_premium_rule_set", false, "Premium rule submitted for approval.");
}
export async function approvePremiumRuleSetAction(formData: FormData): Promise<PayrollActionState> {
  return versionAction(formData, "approve_premium_rule_set", true, "Premium rule approved.");
}
export async function submitAttendanceDeductionRuleAction(formData: FormData): Promise<PayrollActionState> {
  return versionAction(formData, "submit_attendance_deduction_rule", false, "Attendance deduction rule submitted for approval.");
}
export async function approveAttendanceDeductionRuleAction(formData: FormData): Promise<PayrollActionState> {
  return versionAction(formData, "approve_attendance_deduction_rule", true, "Attendance deduction rule approved.");
}

async function rejectAction(formData: FormData, rpc: "reject_premium_rule_set" | "reject_attendance_deduction_rule"): Promise<PayrollActionState> {
  const version = validateRecordVersion(formData.get("ruleId"), formData.get("expectedVersion"));
  if (!version.data) return version.state ?? { error: "Reload the selected rule." };
  const reason = validatePayrollReasonActionInput({ id: version.data.id, reason: formData.get("reason") });
  if (!reason.data) return reason.state ?? { error: "Enter a rejection reason." };
  const { supabase } = await requirePayrollApprover();
  const { error } = await supabase.rpc(rpc, {
    [rpc.includes("attendance") ? "p_rule_id" : "p_rule_set_id"]: version.data.id,
    p_expected_version: version.data.expectedVersion,
    p_reason: reason.data.reason,
    p_request_id: crypto.randomUUID(),
  });
  if (error) return { error: mapPayrollError(error.message) };
  refreshPremiumPayroll();
  return { success: "Rule rejected." };
}

export async function rejectPremiumRuleSetAction(formData: FormData): Promise<PayrollActionState> {
  return rejectAction(formData, "reject_premium_rule_set");
}
export async function rejectAttendanceDeductionRuleAction(formData: FormData): Promise<PayrollActionState> {
  return rejectAction(formData, "reject_attendance_deduction_rule");
}

export async function createAttendanceDeductionRuleAction(formData: FormData): Promise<PayrollActionState> {
  const checked = validateAttendanceDeductionRuleInput(formDataToRecord(formData));
  if (!checked.data) return checked.state ?? { error: "Review the attendance deduction rule." };
  const d = checked.data;
  const { supabase } = await requirePayrollAdministrator();
  const { error } = await supabase.rpc("create_attendance_deduction_rule", {
    p_scope_type: d.scopeType,
    p_employment_type: d.employmentType,
    p_department_id: d.departmentId,
    p_position_id: d.positionId,
    p_payroll_group_id: d.payrollGroupId,
    p_late_grace_minutes: d.lateGraceMinutes,
    p_undertime_grace_minutes: d.undertimeGraceMinutes,
    p_late_rounding_mode: d.lateRoundingMode,
    p_late_rounding_increment_minutes: d.lateRoundingIncrementMinutes,
    p_undertime_rounding_mode: d.undertimeRoundingMode,
    p_undertime_rounding_increment_minutes: d.undertimeRoundingIncrementMinutes,
    p_effective_from: d.effectiveFrom,
    p_effective_to: d.effectiveTo,
    p_change_reason: d.changeReason,
    p_request_id: crypto.randomUUID(),
  });
  if (error) return { error: mapPayrollError(error.message) };
  refreshPremiumPayroll();
  return { success: "Attendance deduction rule draft created." };
}

export async function updateAttendanceDeductionRuleDraftAction(formData: FormData): Promise<PayrollActionState> {
  const identity = validateDraftUpdateIdentity(formData.get("ruleId"), formData.get("expectedUpdatedAt"));
  const checked = validateAttendanceDeductionRuleInput(formDataToRecord(formData));
  if (!identity.data || !checked.data) return identity.state ?? checked.state ?? { error: "Reload and review the attendance deduction draft." };
  const d = checked.data;
  const { supabase } = await requirePayrollAdministrator();
  const { error } = await supabase.rpc("update_attendance_deduction_rule_draft", {
    p_rule_id: identity.data.id,
    p_expected_updated_at: identity.data.expectedUpdatedAt,
    p_scope_type: d.scopeType,
    p_employment_type: d.employmentType,
    p_department_id: d.departmentId,
    p_position_id: d.positionId,
    p_payroll_group_id: d.payrollGroupId,
    p_late_grace_minutes: d.lateGraceMinutes,
    p_undertime_grace_minutes: d.undertimeGraceMinutes,
    p_late_rounding_mode: d.lateRoundingMode,
    p_late_rounding_increment_minutes: d.lateRoundingIncrementMinutes,
    p_undertime_rounding_mode: d.undertimeRoundingMode,
    p_undertime_rounding_increment_minutes: d.undertimeRoundingIncrementMinutes,
    p_effective_from: d.effectiveFrom,
    p_effective_to: d.effectiveTo,
    p_change_reason: d.changeReason,
    p_request_id: crypto.randomUUID(),
  });
  if (error) return { error: mapPayrollError(error.message) };
  refreshPremiumPayroll();
  return { success: "Attendance deduction draft updated." };
}

export async function cloneAttendanceDeductionRuleAction(formData: FormData): Promise<PayrollActionState> {
  const checked = validatePremiumRuleCloneInput(formDataToRecord(formData));
  if (!checked.data) return checked.state ?? { error: "Review the rule version." };
  const { supabase } = await requirePayrollAdministrator();
  const { error } = await supabase.rpc("clone_attendance_deduction_rule", {
    p_rule_id: checked.data.id,
    p_effective_from: checked.data.effectiveFrom,
    p_effective_to: checked.data.effectiveTo,
    p_change_reason: checked.data.changeReason,
    p_request_id: crypto.randomUUID(),
  });
  if (error) return { error: mapPayrollError(error.message) };
  refreshPremiumPayroll();
  return { success: "New attendance deduction-rule version created." };
}

export async function calculatePayrollPremiumsAction(formData: FormData): Promise<PayrollActionState> {
  const checked = validatePremiumCalculationInput({
    ...formDataToRecord(formData),
    employee_ids: formData.getAll("employeeIds"),
  });
  if (!checked.data) return checked.state ?? { error: "Review the premium calculation request." };
  const { supabase } = await requirePayrollAdministrator();
  const request = checked.data;

  if (request.mode === "recalculate") {
    const refreshedEmployeeIds: string[] = [];
    let baseFailureCount = 0;
    for (const employeeId of request.employeeIds) {
      const { data: baseResult, error: baseError } = await supabase.rpc("recalculate_payroll_employee", {
        p_payroll_period_id: request.payrollPeriodId,
        p_employee_id: employeeId,
        p_request_id: crypto.randomUUID(),
      });
      if (baseError) {
        baseFailureCount += 1;
        continue;
      }
      const baseStatus =
        baseResult && typeof baseResult === "object" && "status" in baseResult
          ? String(baseResult.status)
          : null;
      if (baseStatus === "calculated" || baseStatus === "recalculated") {
        refreshedEmployeeIds.push(employeeId);
      } else {
        baseFailureCount += 1;
      }
    }

    if (refreshedEmployeeIds.length === 0) {
      refreshPremiumPayroll(request.payrollPeriodId);
      return { error: "No affected employee completed base payroll recalculation. Review the payroll exceptions." };
    }

    const { data, error } = await supabase.rpc("calculate_payroll_premiums", {
      p_payroll_period_id: request.payrollPeriodId,
      p_mode: "selected",
      p_employee_ids: refreshedEmployeeIds,
      p_idempotency_key: crypto.randomUUID(),
    });
    if (error) {
      refreshPremiumPayroll(request.payrollPeriodId);
      return { error: `Base payroll was refreshed, but premiums remain pending: ${mapPayrollError(error.message)}` };
    }
    const status = data && typeof data === "object" && "status" in data ? String(data.status) : "completed";
    refreshPremiumPayroll(request.payrollPeriodId);
    return {
      success:
        baseFailureCount > 0 || status === "completed_with_exceptions"
          ? "Affected entries were recalculated with exceptions. Review the exception queue."
          : "Affected base payroll and premium entries were recalculated.",
    };
  }

  const { data, error } = await supabase.rpc("calculate_payroll_premiums", {
    p_payroll_period_id: request.payrollPeriodId,
    p_mode: request.mode,
    p_employee_ids: request.employeeIds.length ? request.employeeIds : null,
    p_idempotency_key: crypto.randomUUID(),
  });
  if (error) return { error: mapPayrollError(error.message) };
  const status = data && typeof data === "object" && "status" in data ? String(data.status) : "completed";
  refreshPremiumPayroll(request.payrollPeriodId);
  return { success: status === "completed_with_exceptions" ? "Premium calculation completed with exceptions." : "Premium calculation completed." };
}
