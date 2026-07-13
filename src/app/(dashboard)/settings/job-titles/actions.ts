"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganizationAdmin } from "@/features/organization/auth";
import type { OrganizationActionState } from "@/features/organization/types";
import { evaluateDepartmentAvailability, validateJobTitle } from "@/features/organization/validation";

function databaseError(message: string) {
  if (message.includes("job_titles_title_department_active_unique") || message.includes("duplicate")) {
    return "This job title already exists in the selected department.";
  }
  return "The job title could not be saved. Please try again.";
}

async function validateDepartment(
  supabase: Awaited<ReturnType<typeof requireOrganizationAdmin>>["supabase"],
  departmentId: string | null,
  currentDepartmentId: string | null = null,
) {
  if (!departmentId) return null;

  const { data, error } = await supabase
    .from("departments")
    .select("id,is_active,archived_at")
    .eq("id", departmentId)
    .maybeSingle();

  if (error) return "Unable to validate the selected department.";
  return evaluateDepartmentAvailability({
    requestedDepartmentId: departmentId,
    currentDepartmentId,
    department: data,
  });
}

export async function createJobTitle(
  _state: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  const { supabase } = await requireOrganizationAdmin();
  const result = validateJobTitle(formData);
  if (!result.data) return result.state ?? { error: "Invalid job-title data." };

  const departmentError = await validateDepartment(supabase, result.data.department_id);
  if (departmentError) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: { department_id: departmentError },
    };
  }

  const { data, error } = await supabase
    .from("job_titles")
    .insert(result.data)
    .select("id")
    .single();

  if (error) return { error: databaseError(error.message) };

  revalidatePath("/settings/job-titles");
  revalidatePath("/employees");
  redirect(`/settings/job-titles/${data.id}?success=created`);
}

export async function updateJobTitle(
  id: string,
  _state: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  const { supabase } = await requireOrganizationAdmin();
  const result = validateJobTitle(formData);
  if (!result.data) return result.state ?? { error: "Invalid job-title data." };

  const { data: current, error: currentError } = await supabase
    .from("job_titles")
    .select("id,archived_at,department_id")
    .eq("id", id)
    .maybeSingle();

  if (currentError || !current) return { error: "Job title not found." };
  if (current.archived_at) return { error: "Archived job titles cannot be edited." };

  const departmentError = await validateDepartment(supabase, result.data.department_id, current.department_id);
  if (departmentError) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: { department_id: departmentError },
    };
  }

  const { error } = await supabase
    .from("job_titles")
    .update({ ...result.data, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: databaseError(error.message) };

  revalidatePath("/settings/job-titles");
  revalidatePath(`/settings/job-titles/${id}`);
  revalidatePath("/employees");
  redirect(`/settings/job-titles/${id}?success=updated`);
}

export async function archiveJobTitle(id: string) {
  const { supabase } = await requireOrganizationAdmin();
  const { error } = await supabase
    .from("job_titles")
    .update({
      archived_at: new Date().toISOString(),
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("archived_at", null);

  if (error) redirect(`/settings/job-titles/${id}?error=archive_failed`);

  revalidatePath("/settings/job-titles");
  revalidatePath("/employees");
  redirect("/settings/job-titles?success=archived");
}
