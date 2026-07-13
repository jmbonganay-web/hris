"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganizationAdmin } from "@/features/organization/auth";
import type { OrganizationActionState } from "@/features/organization/types";
import { validateDepartment } from "@/features/organization/validation";

function databaseError(message: string) {
  if (message.includes("departments_name_key") || message.includes("name")) {
    return "A department with this name already exists.";
  }
  if (message.includes("departments_code_key") || message.includes("code")) {
    return "A department with this code already exists.";
  }
  return "The department could not be saved. Please try again.";
}

async function validateDepartmentHead(
  supabase: Awaited<ReturnType<typeof requireOrganizationAdmin>>["supabase"],
  employeeId: string | null,
) {
  if (!employeeId) return null;

  const { data, error } = await supabase
    .from("employees")
    .select("id")
    .eq("id", employeeId)
    .is("archived_at", null)
    .in("employment_status", ["active", "probation", "on_leave"])
    .maybeSingle();

  if (error || !data) return "Select an active employee as department head.";
  return null;
}

export async function createDepartment(
  _state: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  const { supabase } = await requireOrganizationAdmin();
  const result = validateDepartment(formData);
  if (!result.data) return result.state ?? { error: "Invalid department data." };

  const headError = await validateDepartmentHead(supabase, result.data.department_head_id);
  if (headError) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: { department_head_id: headError },
    };
  }

  const { data, error } = await supabase
    .from("departments")
    .insert(result.data)
    .select("id")
    .single();

  if (error) return { error: databaseError(error.message) };

  revalidatePath("/settings");
  revalidatePath("/settings/departments");
  revalidatePath("/employees");
  redirect(`/settings/departments/${data.id}?success=created`);
}

export async function updateDepartment(
  id: string,
  _state: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  const { supabase } = await requireOrganizationAdmin();
  const result = validateDepartment(formData);
  if (!result.data) return result.state ?? { error: "Invalid department data." };

  const { data: current, error: currentError } = await supabase
    .from("departments")
    .select("id,archived_at")
    .eq("id", id)
    .maybeSingle();

  if (currentError || !current) return { error: "Department not found." };
  if (current.archived_at) return { error: "Archived departments cannot be edited." };

  const headError = await validateDepartmentHead(supabase, result.data.department_head_id);
  if (headError) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: { department_head_id: headError },
    };
  }

  const { error } = await supabase
    .from("departments")
    .update({ ...result.data, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: databaseError(error.message) };

  revalidatePath("/settings");
  revalidatePath("/settings/departments");
  revalidatePath(`/settings/departments/${id}`);
  revalidatePath("/settings/job-titles");
  revalidatePath("/employees");
  redirect(`/settings/departments/${id}?success=updated`);
}

export async function archiveDepartment(id: string) {
  const { supabase } = await requireOrganizationAdmin();
  const { error } = await supabase
    .from("departments")
    .update({
      archived_at: new Date().toISOString(),
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("archived_at", null);

  if (error) redirect(`/settings/departments/${id}?error=archive_failed`);

  revalidatePath("/settings/departments");
  revalidatePath("/settings/job-titles");
  revalidatePath("/employees");
  redirect("/settings/departments?success=archived");
}
