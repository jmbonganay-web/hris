"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireLeaveEmployee } from "@/features/leave/auth";
import { mapLeaveError } from "@/features/leave/errors";
import { previewLeaveRequest } from "@/features/leave/requests/queries";
import { deleteLeaveAttachment } from "@/features/leave/requests/storage";
import type {
  LeaveActionState,
  LeavePreviewActionResult,
} from "@/features/leave/types";
import { validateLeaveDraft } from "@/features/leave/validation";

function revalidateEmployeeLeave(requestGroupId?: string) {
  revalidatePath("/leave");
  revalidatePath("/employee/leave");
  if (requestGroupId) revalidatePath(`/employee/leave/${requestGroupId}`);
  revalidatePath("/attendance");
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

export async function createLeaveDraft(
  _state: LeaveActionState,
  formData: FormData,
): Promise<LeaveActionState> {
  const { supabase, employee } = await requireLeaveEmployee();
  const validation = validateLeaveDraft(formData);
  if (!validation.data) {
    return validation.state ?? { error: "Invalid leave request." };
  }
  if (validation.data.employeeId !== employee.id) {
    return {
      error: mapLeaveError("LEAVE_PERMISSION_DENIED"),
      values: leaveDraftValues(validation.data),
    };
  }

  const { data, error } = await supabase.rpc("create_leave_draft", {
    p_employee_id: employee.id,
    p_leave_type_id: validation.data.leaveTypeId,
    p_start_date: validation.data.startDate,
    p_end_date: validation.data.endDate,
    p_duration_mode: validation.data.durationMode,
    p_employee_note: validation.data.employeeNote,
    p_replaces_request_group_id: validation.data.replacesRequestGroupId,
    p_created_source: "employee",
  });
  if (error) {
    return {
      error: mapLeaveError(error.message),
      values: leaveDraftValues(validation.data),
    };
  }

  const requestGroupId = String(data);
  revalidateEmployeeLeave(requestGroupId);
  redirect(`/employee/leave/${requestGroupId}/edit?success=draft-created`);
}

export async function updateLeaveDraft(
  requestGroupId: string,
  expectedRevisionId: string,
  _state: LeaveActionState,
  formData: FormData,
): Promise<LeaveActionState> {
  const { supabase, employee } = await requireLeaveEmployee();
  const validation = validateLeaveDraft(formData);
  if (!validation.data) {
    return validation.state ?? { error: "Invalid leave request." };
  }
  if (validation.data.employeeId !== employee.id) {
    return {
      error: mapLeaveError("LEAVE_PERMISSION_DENIED"),
      values: leaveDraftValues(validation.data),
    };
  }

  const { error } = await supabase.rpc("update_leave_draft", {
    p_request_group_id: requestGroupId,
    p_expected_revision_id: expectedRevisionId,
    p_leave_type_id: validation.data.leaveTypeId,
    p_start_date: validation.data.startDate,
    p_end_date: validation.data.endDate,
    p_duration_mode: validation.data.durationMode,
    p_employee_note: validation.data.employeeNote,
    p_replaces_request_group_id: validation.data.replacesRequestGroupId,
  });
  if (error) {
    return {
      error: mapLeaveError(error.message),
      values: leaveDraftValues(validation.data),
    };
  }

  revalidateEmployeeLeave(requestGroupId);
  return { success: "Draft saved." };
}

export async function deleteLeaveDraft(
  requestGroupId: string,
  expectedRevisionId: string,
): Promise<void> {
  const { supabase } = await requireLeaveEmployee();
  const { data: attachments, error: attachmentError } = await supabase
    .from("leave_request_attachments")
    .select("id")
    .eq("request_group_id", requestGroupId)
    .order("created_at", { ascending: true });

  if (attachmentError) {
    redirect(
      `/employee/leave/${requestGroupId}/edit?error=${encodeURIComponent(
        mapLeaveError(attachmentError.message),
      )}`,
    );
  }

  try {
    for (const attachment of attachments ?? []) {
      await deleteLeaveAttachment({
        attachmentId: String(attachment.id),
        expectedRevisionId,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "LEAVE_ATTACHMENT_INVALID";
    redirect(
      `/employee/leave/${requestGroupId}/edit?error=${encodeURIComponent(
        mapLeaveError(message),
      )}`,
    );
  }

  const { error } = await supabase.rpc("delete_leave_draft", {
    p_request_group_id: requestGroupId,
    p_expected_revision_id: expectedRevisionId,
  });
  if (error) {
    redirect(
      `/employee/leave/${requestGroupId}/edit?error=${encodeURIComponent(
        mapLeaveError(error.message),
      )}`,
    );
  }

  revalidateEmployeeLeave();
  redirect("/employee/leave?success=draft-deleted");
}

export async function deleteLeaveDraftAttachment(
  requestGroupId: string,
  attachmentId: string,
  expectedRevisionId: string,
): Promise<void> {
  await requireLeaveEmployee();
  try {
    await deleteLeaveAttachment({ attachmentId, expectedRevisionId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "LEAVE_ATTACHMENT_INVALID";
    redirect(
      `/employee/leave/${requestGroupId}/edit?error=${encodeURIComponent(
        mapLeaveError(message),
      )}`,
    );
  }

  revalidateEmployeeLeave(requestGroupId);
  redirect(`/employee/leave/${requestGroupId}/edit?success=attachment-deleted`);
}

export async function submitLeaveRequest(
  requestGroupId: string,
  expectedRevisionId: string,
): Promise<void> {
  const { supabase } = await requireLeaveEmployee();
  const { error } = await supabase.rpc("submit_leave_request", {
    p_request_group_id: requestGroupId,
    p_expected_revision_id: expectedRevisionId,
  });
  if (error) {
    redirect(
      `/employee/leave/${requestGroupId}/edit?error=${encodeURIComponent(
        mapLeaveError(error.message),
      )}`,
    );
  }

  revalidateEmployeeLeave(requestGroupId);
  redirect(`/employee/leave/${requestGroupId}?success=submitted`);
}

export async function withdrawLeaveRequest(
  requestGroupId: string,
  expectedRevisionId: string,
): Promise<void> {
  const { supabase } = await requireLeaveEmployee();
  const { error } = await supabase.rpc("withdraw_leave_request", {
    p_request_group_id: requestGroupId,
    p_expected_revision_id: expectedRevisionId,
  });
  if (error) {
    redirect(
      `/employee/leave/${requestGroupId}?error=${encodeURIComponent(
        mapLeaveError(error.message),
      )}`,
    );
  }

  revalidateEmployeeLeave(requestGroupId);
  redirect(`/employee/leave/${requestGroupId}?success=withdrawn`);
}

export async function previewLeaveDraft(formData: FormData): Promise<LeavePreviewActionResult> {
  const { employee } = await requireLeaveEmployee();
  const validation = validateLeaveDraft(formData);
  if (!validation.data) {
    return { ok: false, error: validation.state?.error ?? "Invalid leave request." };
  }
  if (validation.data.employeeId !== employee.id) {
    return { ok: false, error: mapLeaveError("LEAVE_PERMISSION_DENIED") };
  }

  try {
    const preview = await previewLeaveRequest({
      employeeId: employee.id,
      leaveTypeId: validation.data.leaveTypeId,
      startDate: validation.data.startDate,
      endDate: validation.data.endDate,
      durationMode: validation.data.durationMode,
      excludeRequestGroupId:
        String(formData.get("request_group_id") ?? "").trim() || null,
    });
    return { ok: true, preview };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return { ok: false, error: mapLeaveError(message) };
  }
}
