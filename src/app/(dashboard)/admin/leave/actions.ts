"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { companyDateAt } from "@/features/attendance/time";
import { requireLeaveAdmin } from "@/features/leave/auth";
import { mapLeaveError } from "@/features/leave/errors";
import { previewLeaveRequest } from "@/features/leave/requests/queries";
import { deleteLeaveAttachment } from "@/features/leave/requests/storage";
import type { LeaveActionState, LeavePreviewResult } from "@/features/leave/types";
import {
  validateLeaveAdjustment,
  validateLeaveCancellation,
  validateLeaveDraft,
  validateLeaveReview,
  validateLeaveYearOpening,
} from "@/features/leave/validation";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function revalidateAdminLeave(requestGroupId?: string) {
  revalidatePath("/admin/leave");
  revalidatePath("/admin/leave/conflicts");
  revalidatePath("/admin/leave/balances");
  revalidatePath("/employee/leave");
  revalidatePath("/attendance");
  revalidatePath("/admin/attendance");
  revalidatePath("/reports");
  if (requestGroupId) revalidatePath(`/admin/leave/${requestGroupId}`);
}

function leaveDraftValues(data: {
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  durationMode: string;
  replacesRequestGroupId: string | null;
}) {
  return {
    employee_id: data.employeeId,
    leave_type_id: data.leaveTypeId,
    start_date: data.startDate,
    end_date: data.endDate,
    duration_mode: data.durationMode,
    replaces_request_group_id: data.replacesRequestGroupId ?? "",
  };
}

export async function createHrLeaveDraft(
  _state: LeaveActionState,
  formData: FormData,
): Promise<LeaveActionState> {
  const { supabase } = await requireLeaveAdmin();
  const validation = validateLeaveDraft(formData);
  if (!validation.data) {
    return validation.state ?? { error: "Invalid leave request." };
  }

  const { data, error } = await supabase.rpc("create_leave_draft", {
    p_employee_id: validation.data.employeeId,
    p_leave_type_id: validation.data.leaveTypeId,
    p_start_date: validation.data.startDate,
    p_end_date: validation.data.endDate,
    p_duration_mode: validation.data.durationMode,
    p_employee_note: validation.data.employeeNote,
    p_replaces_request_group_id: validation.data.replacesRequestGroupId,
    p_created_source: "hr",
  });
  if (error) {
    return {
      error: mapLeaveError(error.message),
      values: leaveDraftValues(validation.data),
    };
  }

  const requestGroupId = String(data);
  revalidateAdminLeave(requestGroupId);
  redirect(`/admin/leave/${requestGroupId}?success=draft-created`);
}

export async function previewHrLeaveDraft(formData: FormData): Promise<LeavePreviewResult> {
  await requireLeaveAdmin();
  const validation = validateLeaveDraft(formData);
  if (!validation.data) {
    throw new Error(validation.state?.error ?? "Invalid leave request.");
  }
  return previewLeaveRequest({
    employeeId: validation.data.employeeId,
    leaveTypeId: validation.data.leaveTypeId,
    startDate: validation.data.startDate,
    endDate: validation.data.endDate,
    durationMode: validation.data.durationMode,
    excludeRequestGroupId: String(formData.get("request_group_id") ?? "").trim() || null,
  });
}

export async function deleteHrLeaveDraftAttachment(
  requestGroupId: string,
  attachmentId: string,
  expectedRevisionId: string,
): Promise<void> {
  await requireLeaveAdmin();
  try {
    await deleteLeaveAttachment({ attachmentId, expectedRevisionId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "LEAVE_ATTACHMENT_INVALID";
    redirect(`/admin/leave/${requestGroupId}?error=${encodeURIComponent(mapLeaveError(message))}`);
  }
  revalidateAdminLeave(requestGroupId);
  redirect(`/admin/leave/${requestGroupId}?success=attachment-deleted`);
}

export async function submitHrLeaveRequest(
  requestGroupId: string,
  expectedRevisionId: string,
): Promise<void> {
  const { supabase } = await requireLeaveAdmin();
  const { error } = await supabase.rpc("create_hr_leave_request", {
    p_request_group_id: requestGroupId,
    p_expected_revision_id: expectedRevisionId,
  });
  if (error) {
    redirect(
      `/admin/leave/${requestGroupId}?error=${encodeURIComponent(
        mapLeaveError(error.message),
      )}`,
    );
  }

  revalidateAdminLeave(requestGroupId);
  redirect(`/admin/leave/${requestGroupId}?success=submitted`);
}

export async function reviewLeaveRequest(
  requestGroupId: string,
  _state: LeaveActionState,
  formData: FormData,
): Promise<LeaveActionState> {
  const { supabase } = await requireLeaveAdmin();
  const validation = validateLeaveReview(formData);
  if (!validation.data) {
    return validation.state ?? { error: "Invalid leave review." };
  }
  if (validation.data.requestGroupId !== requestGroupId) {
    return { error: mapLeaveError("LEAVE_REQUEST_STALE") };
  }

  const { error } = await supabase.rpc("review_leave_request", {
    p_request_group_id: requestGroupId,
    p_expected_revision_id: validation.data.expectedRequestRevisionId,
    p_expected_status: validation.data.expectedStatus,
    p_expected_day_fingerprint: validation.data.expectedDayFingerprint,
    p_expected_chargeable_units: validation.data.expectedChargeableUnits,
    p_decision: validation.data.decision,
    p_review_text: validation.data.reviewText,
  });
  if (error) return { error: mapLeaveError(error.message) };

  revalidateAdminLeave(requestGroupId);
  redirect(`/admin/leave/${requestGroupId}?success=${validation.data.decision}`);
}

export async function cancelApprovedLeaveRequest(
  requestGroupId: string,
  expectedRevisionId: string,
  _state: LeaveActionState,
  formData: FormData,
): Promise<LeaveActionState> {
  const { supabase } = await requireLeaveAdmin();
  const validation = validateLeaveCancellation(formData);
  if (!validation.data) {
    return validation.state ?? { error: "Invalid cancellation." };
  }
  if (validation.data.requestGroupId !== requestGroupId) {
    return { error: mapLeaveError("LEAVE_REQUEST_STALE") };
  }

  const { error } = await supabase.rpc("cancel_approved_leave_request", {
    p_request_group_id: requestGroupId,
    p_expected_revision_id: expectedRevisionId,
    p_reason: validation.data.reason,
  });
  if (error) return { error: mapLeaveError(error.message) };

  revalidateAdminLeave(requestGroupId);
  redirect(`/admin/leave/${requestGroupId}?success=cancelled`);
}

export async function createLeaveBalanceAdjustment(
  _state: LeaveActionState,
  formData: FormData,
): Promise<LeaveActionState> {
  const { supabase } = await requireLeaveAdmin();
  const validation = validateLeaveAdjustment(
    formData,
    Number(companyDateAt().slice(0, 4)),
  );
  if (!validation.data) {
    return validation.state ?? { error: "Invalid balance adjustment." };
  }

  const { error } = await supabase.rpc("create_leave_balance_adjustment", {
    p_employee_id: validation.data.employeeId,
    p_leave_type_id: validation.data.leaveTypeId,
    p_leave_year: validation.data.leaveYear,
    p_units: validation.data.units,
    p_reason: validation.data.reason,
  });
  if (error) {
    return {
      error: mapLeaveError(error.message),
      values: {
        employee_id: validation.data.employeeId,
        leave_type_id: validation.data.leaveTypeId,
        leave_year: String(validation.data.leaveYear),
        units: String(validation.data.units),
      },
    };
  }

  revalidateAdminLeave();
  return { success: "Leave balance adjusted." };
}

export async function previewLeaveYearOpening(
  _state: LeaveActionState,
  formData: FormData,
): Promise<LeaveActionState> {
  const validation = validateLeaveYearOpening(
    formData,
    Number(companyDateAt().slice(0, 4)),
  );
  if (!validation.data) {
    return validation.state ?? { error: "Invalid leave year." };
  }

  const { supabase } = await requireLeaveAdmin();
  const { data, error } = await supabase.rpc("preview_leave_year_opening", {
    p_leave_year: validation.data.leaveYear,
  });
  if (error) return { error: mapLeaveError(error.message) };
  return {
    success: "Preview generated.",
    data: data ?? [],
    values: { leave_year: String(validation.data.leaveYear) },
  };
}

export async function generateLeaveYearOpening(
  _state: LeaveActionState,
  formData: FormData,
): Promise<LeaveActionState> {
  const validation = validateLeaveYearOpening(
    formData,
    Number(companyDateAt().slice(0, 4)),
  );
  if (!validation.data) {
    return validation.state ?? { error: "Invalid leave year." };
  }
  if (formData.get("confirmed") !== "true") {
    return { error: "Confirm the year-opening generation before continuing." };
  }

  const { supabase } = await requireLeaveAdmin();
  const { data, error } = await supabase.rpc("generate_leave_year_opening", {
    p_leave_year: validation.data.leaveYear,
  });
  if (error) return { error: mapLeaveError(error.message) };

  revalidateAdminLeave();
  return { success: "Leave year generated.", data: data ?? [] };
}

export async function generateIndividualLeaveAllocation(
  _state: LeaveActionState,
  formData: FormData,
): Promise<LeaveActionState> {
  const { supabase } = await requireLeaveAdmin();
  const employeeId = String(formData.get("employee_id") ?? "").trim();
  const leaveTypeId = String(formData.get("leave_type_id") ?? "").trim();
  const leaveYear = Number(formData.get("leave_year"));
  const units = Number(formData.get("units"));
  const effectiveDate = String(formData.get("effective_date") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const validUnits =
    Number.isFinite(units) && units > 0 && Number.isInteger(units * 2);

  if (
    !uuidPattern.test(employeeId) ||
    !uuidPattern.test(leaveTypeId) ||
    !Number.isInteger(leaveYear) ||
    leaveYear < 2000 ||
    leaveYear > 2200 ||
    !validUnits ||
    !datePattern.test(effectiveDate) ||
    Number(effectiveDate.slice(0, 4)) !== leaveYear ||
    !reason ||
    reason.length > 1000
  ) {
    return {
      error:
        "Employee, leave type, year, effective date, half-day units, and a reason of up to 1,000 characters are required.",
    };
  }

  const { error: settingError } = await supabase.rpc(
    "upsert_employee_leave_year_setting",
    {
      p_employee_id: employeeId,
      p_leave_type_id: leaveTypeId,
      p_leave_year: leaveYear,
      p_is_excluded: false,
      p_annual_allocation_override_units: units,
      p_private_reason: reason,
    },
  );
  if (settingError) return { error: mapLeaveError(settingError.message) };

  const { error } = await supabase.rpc("generate_individual_leave_allocation", {
    p_employee_id: employeeId,
    p_leave_type_id: leaveTypeId,
    p_leave_year: leaveYear,
    p_effective_date: effectiveDate,
  });
  if (error) return { error: mapLeaveError(error.message) };

  revalidateAdminLeave();
  return { success: "Individual allocation generated." };
}

export async function resolveLeaveAttendanceConflict(
  conflictId: string,
  _state: LeaveActionState,
  formData: FormData,
): Promise<LeaveActionState> {
  const { supabase } = await requireLeaveAdmin();
  const resolutionType = String(formData.get("resolution_type") ?? "").trim();
  const note = String(formData.get("private_resolution_note") ?? "").trim();
  const allowed = new Set([
    "reviewed_no_change",
    "leave_cancelled",
    "attendance_corrected",
    "replacement_requested",
  ]);
  if (
    !uuidPattern.test(conflictId) ||
    !allowed.has(resolutionType) ||
    note.length > 1000
  ) {
    return {
      error:
        "Choose a valid conflict, resolution, and keep the note within 1,000 characters.",
    };
  }

  const { error } = await supabase.rpc("resolve_leave_attendance_conflict", {
    p_conflict_id: conflictId,
    p_resolution_type: resolutionType,
    p_private_resolution_note: note || null,
  });
  if (error) return { error: mapLeaveError(error.message) };

  revalidateAdminLeave();
  return { success: "Conflict marked as resolved." };
}
