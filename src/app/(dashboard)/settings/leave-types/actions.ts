"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { companyDateAt } from "@/features/attendance/time";
import { requireLeaveAdmin } from "@/features/leave/auth";
import { mapLeaveError } from "@/features/leave/errors";
import type { LeaveActionState } from "@/features/leave/types";
import { validateLeaveTypeVersion } from "@/features/leave/validation";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function revalidateLeaveSettings(leaveTypeId?: string) {
  revalidatePath("/settings/leave-types");
  revalidatePath("/admin/leave");
  revalidatePath("/admin/leave/balances");
  revalidatePath("/employee/leave");
  if (leaveTypeId) revalidatePath(`/settings/leave-types/${leaveTypeId}`);
}

function policyValues(data: {
  code: string;
  effectiveFrom: string;
  name: string;
  description: string | null;
  defaultAnnualUnits: number;
  carryoverCapUnits: number | null;
  documentRequiredMinUnits: number | null;
}) {
  return {
    code: data.code,
    effective_from: data.effectiveFrom,
    name: data.name,
    description: data.description ?? "",
    default_annual_units: String(data.defaultAnnualUnits),
    carryover_cap_units:
      data.carryoverCapUnits === null ? "" : String(data.carryoverCapUnits),
    document_required_min_units:
      data.documentRequiredMinUnits === null
        ? ""
        : String(data.documentRequiredMinUnits),
  };
}

export async function createLeaveType(
  _state: LeaveActionState,
  formData: FormData,
): Promise<LeaveActionState> {
  const { supabase } = await requireLeaveAdmin();
  const validation = validateLeaveTypeVersion(formData, companyDateAt());
  if (!validation.data) {
    return validation.state ?? { error: "Invalid leave type." };
  }
  if (validation.data.leaveTypeId !== null || !validation.data.code) {
    return {
      error: "Create a new leave type without an existing leave type identifier.",
      values: policyValues(validation.data),
    };
  }

  const { data, error } = await supabase.rpc("create_leave_type", {
    p_code: validation.data.code,
    p_name: validation.data.name,
    p_description: validation.data.description,
    p_effective_from: validation.data.effectiveFrom,
    p_is_active: validation.data.isActive,
    p_is_paid: validation.data.isPaid,
    p_is_balance_tracked: validation.data.isBalanceTracked,
    p_default_annual_units: validation.data.defaultAnnualUnits,
    p_carryover_enabled: validation.data.carryoverEnabled,
    p_carryover_cap_units: validation.data.carryoverCapUnits,
    p_employee_note_required: validation.data.employeeNoteRequired,
    p_document_required: validation.data.documentRequired,
    p_document_required_min_units: validation.data.documentRequiredMinUnits,
  });
  if (error) {
    return {
      error: mapLeaveError(error.message),
      values: policyValues(validation.data),
    };
  }

  const leaveTypeId = String(data);
  revalidateLeaveSettings(leaveTypeId);
  redirect(`/settings/leave-types/${leaveTypeId}?success=created`);
}

export async function createLeaveTypeVersion(
  leaveTypeId: string,
  _state: LeaveActionState,
  formData: FormData,
): Promise<LeaveActionState> {
  const { supabase } = await requireLeaveAdmin();
  const validation = validateLeaveTypeVersion(formData, companyDateAt());
  if (!validation.data) {
    return validation.state ?? { error: "Invalid leave policy version." };
  }
  if (
    !uuidPattern.test(leaveTypeId) ||
    validation.data.leaveTypeId !== leaveTypeId
  ) {
    return {
      error: "The leave type changed. Reload and try again.",
      values: policyValues(validation.data),
    };
  }

  const { error } = await supabase.rpc("create_leave_type_version", {
    p_leave_type_id: leaveTypeId,
    p_effective_from: validation.data.effectiveFrom,
    p_name: validation.data.name,
    p_description: validation.data.description,
    p_is_active: validation.data.isActive,
    p_is_paid: validation.data.isPaid,
    p_is_balance_tracked: validation.data.isBalanceTracked,
    p_default_annual_units: validation.data.defaultAnnualUnits,
    p_carryover_enabled: validation.data.carryoverEnabled,
    p_carryover_cap_units: validation.data.carryoverCapUnits,
    p_employee_note_required: validation.data.employeeNoteRequired,
    p_document_required: validation.data.documentRequired,
    p_document_required_min_units: validation.data.documentRequiredMinUnits,
    p_change_reason: validation.data.changeReason,
  });
  if (error) {
    return {
      error: mapLeaveError(error.message),
      values: policyValues(validation.data),
    };
  }

  revalidateLeaveSettings(leaveTypeId);
  redirect(`/settings/leave-types/${leaveTypeId}?success=version-created`);
}

export async function archiveLeaveType(
  leaveTypeId: string,
  _state: LeaveActionState,
  formData: FormData,
): Promise<LeaveActionState> {
  const { supabase } = await requireLeaveAdmin();
  const effectiveFrom = String(formData.get("effective_from") ?? "").trim();
  const reason = String(formData.get("change_reason") ?? "").trim();
  if (
    !uuidPattern.test(leaveTypeId) ||
    !datePattern.test(effectiveFrom) ||
    !reason ||
    reason.length > 1000
  ) {
    return {
      error:
        "Effective date and a change reason of up to 1,000 characters are required.",
      values: { effective_from: effectiveFrom },
    };
  }

  const { error } = await supabase.rpc("archive_leave_type", {
    p_leave_type_id: leaveTypeId,
    p_effective_from: effectiveFrom,
    p_change_reason: reason,
  });
  if (error) {
    return {
      error: mapLeaveError(error.message),
      values: { effective_from: effectiveFrom },
    };
  }

  revalidateLeaveSettings(leaveTypeId);
  redirect(`/settings/leave-types/${leaveTypeId}?success=archived`);
}

export async function upsertEmployeeLeaveYearSetting(
  _state: LeaveActionState,
  formData: FormData,
): Promise<LeaveActionState> {
  const { supabase } = await requireLeaveAdmin();
  const employeeId = String(formData.get("employee_id") ?? "").trim();
  const leaveTypeId = String(formData.get("leave_type_id") ?? "").trim();
  const leaveYear = Number(formData.get("leave_year"));
  const isExcluded = ["true", "on", "1"].includes(
    String(formData.get("is_excluded") ?? ""),
  );
  const overrideText = String(
    formData.get("annual_allocation_override_units") ?? "",
  ).trim();
  const overrideUnits = overrideText === "" ? null : Number(overrideText);
  const reason = String(formData.get("private_reason") ?? "").trim();
  const validOverride =
    overrideUnits === null ||
    (Number.isFinite(overrideUnits) &&
      overrideUnits >= 0 &&
      Number.isInteger(overrideUnits * 2));
  const values = {
    employee_id: employeeId,
    leave_type_id: leaveTypeId,
    leave_year: String(leaveYear),
    is_excluded: isExcluded ? "true" : "false",
    annual_allocation_override_units: overrideText,
  };

  if (
    !uuidPattern.test(employeeId) ||
    !uuidPattern.test(leaveTypeId) ||
    !Number.isInteger(leaveYear) ||
    leaveYear < 2000 ||
    leaveYear > 2200 ||
    !validOverride ||
    !reason ||
    reason.length > 1000
  ) {
    return {
      error:
        "Employee, leave type, year, valid half-day override, and reason are required.",
      values,
    };
  }

  const { error } = await supabase.rpc("upsert_employee_leave_year_setting", {
    p_employee_id: employeeId,
    p_leave_type_id: leaveTypeId,
    p_leave_year: leaveYear,
    p_is_excluded: isExcluded,
    p_annual_allocation_override_units: overrideUnits,
    p_private_reason: reason,
  });
  if (error) return { error: mapLeaveError(error.message), values };

  revalidateLeaveSettings(leaveTypeId);
  return { success: "Employee leave setting saved." };
}
