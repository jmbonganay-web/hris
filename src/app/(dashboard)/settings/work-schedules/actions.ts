"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { companyDateAt } from "@/features/attendance/time";
import { requireOrganizationAdmin } from "@/features/organization/auth";
import type { ScheduleActionState } from "@/features/schedules/types";
import {
  validateScheduleAssignment,
  validateScheduleTemplate,
  validateScheduleVersion,
} from "@/features/schedules/validation";

function rpcError(message: string | undefined) {
  const errors: Record<string, string> = {
    SCHEDULE_CODE_EXISTS: "A schedule with this code already exists.",
    SCHEDULE_VERSION_DATE_EXISTS: "A version already exists for this effective date.",
    SCHEDULE_REASON_REQUIRED: "A reason is required for this backdated change.",
    SCHEDULE_NOT_FOUND: "The schedule was not found.",
    SCHEDULE_TIME_ORDER_INVALID: "The end time must be later than the start time.",
    SCHEDULE_BREAK_TOO_LONG: "Break duration must be shorter than the shift.",
  };
  return errors[message ?? ""] ?? "The schedule could not be saved.";
}

function revalidateSchedules(templateId?: string) {
  revalidatePath("/settings/work-schedules");
  if (templateId) revalidatePath(`/settings/work-schedules/${templateId}`);
  revalidatePath("/my-schedule");
  revalidatePath("/attendance");
  revalidatePath("/dashboard");
}

export async function createScheduleTemplate(
  _state: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const { supabase } = await requireOrganizationAdmin();
  const template = validateScheduleTemplate(formData);
  const version = validateScheduleVersion(formData, companyDateAt());
  if (!template.data || !version.data) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: {
        ...(template.state?.fieldErrors ?? {}),
        ...(version.state?.fieldErrors ?? {}),
      },
      values: {
        ...(template.state?.values ?? {}),
        ...(version.state?.values ?? {}),
      },
    };
  }

  const { data, error } = await supabase.rpc("create_work_schedule_template", {
    p_code: template.data.code,
    p_name: template.data.name,
    p_description: template.data.description,
    p_effective_date: version.data.effective_date,
    p_working_days: version.data.working_days,
    p_start_time: version.data.start_time,
    p_end_time: version.data.end_time,
    p_break_minutes: version.data.break_minutes,
    p_change_reason: version.data.change_reason,
  });
  if (error) return { error: rpcError(error.message), values: { code: template.data.code, name: template.data.name } };

  revalidateSchedules(String(data));
  redirect(`/settings/work-schedules/${data}?success=created`);
}

export async function updateScheduleTemplate(
  templateId: string,
  _state: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const { supabase } = await requireOrganizationAdmin();
  const validation = validateScheduleTemplate(formData);
  if (!validation.data) return validation.state ?? { error: "Invalid schedule." };

  const { error } = await supabase.rpc("update_work_schedule_template", {
    p_template_id: templateId,
    p_code: validation.data.code,
    p_name: validation.data.name,
    p_description: validation.data.description,
  });
  if (error) return { error: rpcError(error.message), values: { code: validation.data.code, name: validation.data.name } };

  revalidateSchedules(templateId);
  redirect(`/settings/work-schedules/${templateId}?success=updated`);
}

export async function createScheduleVersion(
  templateId: string,
  _state: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const { supabase } = await requireOrganizationAdmin();
  const validation = validateScheduleVersion(formData, companyDateAt());
  if (!validation.data) return validation.state ?? { error: "Invalid schedule version." };

  const { error } = await supabase.rpc("create_work_schedule_version", {
    p_template_id: templateId,
    p_effective_date: validation.data.effective_date,
    p_working_days: validation.data.working_days,
    p_start_time: validation.data.start_time,
    p_end_time: validation.data.end_time,
    p_break_minutes: validation.data.break_minutes,
    p_change_reason: validation.data.change_reason,
  });
  if (error) return { error: rpcError(error.message) };

  revalidateSchedules(templateId);
  redirect(`/settings/work-schedules/${templateId}?success=version_created`);
}

export async function setScheduleArchived(
  templateId: string,
  archived: boolean,
) {
  const { supabase } = await requireOrganizationAdmin();
  const { error } = await supabase.rpc("set_work_schedule_template_archived", {
    p_template_id: templateId,
    p_archived: archived,
  });
  if (error) {
    redirect(`/settings/work-schedules/${templateId}?error=archive_failed`);
  }
  revalidateSchedules(templateId);
  redirect(`/settings/work-schedules/${templateId}?success=${archived ? "archived" : "restored"}`);
}


function assignmentError(code: string | undefined, message: string | undefined) {
  const errors: Record<string, string> = {
    SCHEDULE_ARCHIVED: "Archived schedules cannot be assigned.",
    SCHEDULE_EMPLOYEE_INELIGIBLE: "One or more selected employees are no longer eligible.",
    SCHEDULE_REASON_REQUIRED: "A reason is required for this backdated assignment.",
    SCHEDULE_ASSIGNMENT_DATE_INVALID: "The assignment end date must be on or after its start date.",
    SCHEDULE_EMPLOYEE_DUPLICATE: "Each employee may be selected only once.",
    "23P01": "The assignment conflicts with another active schedule range.",
  };
  return errors[message ?? ""] ?? errors[code ?? ""] ?? "The schedule assignment could not be completed. No assignments were changed.";
}

export async function assignScheduleToEmployee(
  _state: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const { supabase } = await requireOrganizationAdmin();
  const validation = validateScheduleAssignment(formData, companyDateAt());
  if (!validation.data) return validation.state ?? { error: "Invalid assignment." };
  const employeeId = validation.data.employee_ids[0];
  const { error } = await supabase.rpc("assign_employee_schedule", {
    p_employee_id: employeeId,
    p_schedule_template_id: validation.data.schedule_template_id,
    p_effective_start_date: validation.data.effective_start_date,
    p_effective_end_date: validation.data.effective_end_date,
    p_assignment_reason: validation.data.assignment_reason,
  });
  if (error) return { error: assignmentError(error.code, error.message) };
  revalidateSchedules(validation.data.schedule_template_id);
  revalidatePath(`/employees/${employeeId}/schedule`);
  revalidatePath(`/employees/${employeeId}/activity`);
  redirect(`/employees/${employeeId}/schedule?success=assigned`);
}

export async function bulkAssignSchedule(
  _state: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const { supabase } = await requireOrganizationAdmin();
  const validation = validateScheduleAssignment(formData, companyDateAt());
  if (!validation.data) return validation.state ?? { error: "Invalid assignment." };
  const { error } = await supabase.rpc("bulk_assign_employee_schedule", {
    p_employee_ids: validation.data.employee_ids,
    p_schedule_template_id: validation.data.schedule_template_id,
    p_effective_start_date: validation.data.effective_start_date,
    p_effective_end_date: validation.data.effective_end_date,
    p_assignment_reason: validation.data.assignment_reason,
  });
  if (error) return { error: assignmentError(error.code, error.message) };
  revalidateSchedules(validation.data.schedule_template_id);
  for (const employeeId of validation.data.employee_ids) {
    revalidatePath(`/employees/${employeeId}/schedule`);
    revalidatePath(`/employees/${employeeId}/activity`);
  }
  redirect("/settings/work-schedules?success=bulk_assigned");
}
