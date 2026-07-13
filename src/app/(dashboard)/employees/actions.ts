"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireHrAdmin } from "@/features/employees/auth";
import { validateEmployeeOrganizationAssignment } from "@/features/employees/organization-validation";
import { validateEmployee } from "@/features/employees/validation";
import type { EmployeeActionState } from "@/features/employees/types";

function friendlyDatabaseError(message: string) {
  if (message.includes("employee_number")) return "That employee ID is already in use.";
  if (message.includes("work_email")) return "That work email is already in use.";
  return "The employee record could not be saved. Please try again.";
}

function organizationErrorState(message: string): EmployeeActionState {
  return {
    error: message,
    fieldErrors: {
      [message.includes("department") && !message.includes("job title") ? "department_id" : "job_title_id"]: message,
    },
  };
}

function revalidateEmployeeOrganizationPaths(id?: string) {
  revalidatePath("/employees");
  revalidatePath("/settings/departments");
  revalidatePath("/settings/job-titles");
  if (id) {
    revalidatePath(`/employees/${id}`);
    revalidatePath(`/employees/${id}/activity`);
  }
}

export async function createEmployee(_state: EmployeeActionState, formData: FormData): Promise<EmployeeActionState> {
  const { supabase } = await requireHrAdmin();
  const result = validateEmployee(formData);
  if (!result.data) return result.state ?? { error: "Invalid employee data." };

  const organizationError = await validateEmployeeOrganizationAssignment(supabase, {
    requestedDepartmentId: result.data.department_id,
    requestedJobTitleId: result.data.job_title_id,
  });
  if (organizationError) return organizationErrorState(organizationError);

  const { data, error } = await supabase.from("employees").insert(result.data).select("id").single();
  if (error) return { error: friendlyDatabaseError(error.message) };

  revalidateEmployeeOrganizationPaths(data.id);
  redirect(`/employees/${data.id}?success=created`);
}

export async function updateEmployee(id: string, _state: EmployeeActionState, formData: FormData): Promise<EmployeeActionState> {
  const { supabase } = await requireHrAdmin();
  const result = validateEmployee(formData);
  if (!result.data) return result.state ?? { error: "Invalid employee data." };

  const { data: current, error: currentError } = await supabase
    .from("employees")
    .select("department_id,job_title_id")
    .eq("id", id)
    .maybeSingle();

  if (currentError || !current) return { error: "Employee not found." };

  const organizationError = await validateEmployeeOrganizationAssignment(supabase, {
    requestedDepartmentId: result.data.department_id,
    requestedJobTitleId: result.data.job_title_id,
    currentDepartmentId: current.department_id,
    currentJobTitleId: current.job_title_id,
  });
  if (organizationError) return organizationErrorState(organizationError);

  const { error } = await supabase.from("employees").update(result.data).eq("id", id);
  if (error) return { error: friendlyDatabaseError(error.message) };

  revalidateEmployeeOrganizationPaths(id);
  redirect(`/employees/${id}?success=updated`);
}

export async function archiveEmployee(id: string) {
  const { supabase } = await requireHrAdmin();
  const { error } = await supabase
    .from("employees")
    .update({ archived_at: new Date().toISOString(), employment_status: "inactive" })
    .eq("id", id);

  if (error) redirect(`/employees/${id}?error=archive_failed`);
  revalidateEmployeeOrganizationPaths(id);
  redirect("/employees?success=archived");
}
