"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEmployeeProfileManager } from "@/features/employees/auth";
import { validateManagerAssignment } from "@/features/employees/manager-validation";
import { validateEmployeeOrganizationAssignment } from "@/features/employees/organization-validation";
import {
  validateAvatarFile,
  validateEmergencyContact,
  validateEmploymentDetails,
  validatePersonalDetails,
} from "@/features/employees/profile-validation";
import type { EmployeeActionState } from "@/features/employees/types";

function revalidateProfile(employeeId: string) {
  revalidatePath("/employees");
  revalidatePath(`/employees/${employeeId}`);
  revalidatePath(`/employees/${employeeId}/personal/edit`);
  revalidatePath(`/employees/${employeeId}/employment/edit`);
  revalidatePath(`/employees/${employeeId}/manager/edit`);
}

function databaseMessage(error: { message?: string; code?: string }, fallback: string) {
  console.error("Employee profile mutation error:", error);
  if (error.code === "23505") return "That value is already in use.";
  return fallback;
}

function organizationState(message: string): EmployeeActionState {
  const field = message.includes("department") && !message.includes("job title")
    ? "department_id"
    : "job_title_id";
  return { error: message, fieldErrors: { [field]: message } };
}

export async function updatePersonalDetails(
  employeeId: string,
  _state: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  const { supabase } = await requireEmployeeProfileManager(employeeId);
  const result = validatePersonalDetails(formData);
  if (!result.data) return result.state ?? { error: "Invalid personal details." };

  const { error } = await supabase.from("employee_personal_details").upsert({
    employee_id: employeeId,
    ...result.data,
    updated_at: new Date().toISOString(),
  }, { onConflict: "employee_id" });
  if (error) return { error: databaseMessage(error, "Personal information could not be saved.") };

  await supabase.from("employees").update({
    personal_email: result.data.personal_email,
    phone: result.data.phone,
  }).eq("id", employeeId);

  revalidateProfile(employeeId);
  redirect(`/employees/${employeeId}?tab=personal&success=personal_updated`);
}

export async function updateEmploymentDetails(
  employeeId: string,
  _state: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  const { supabase } = await requireEmployeeProfileManager(employeeId);
  const result = validateEmploymentDetails(formData);
  if (!result.data) return result.state ?? { error: "Invalid employment details." };

  const { data: current, error: currentError } = await supabase
    .from("employees")
    .select("department_id,job_title_id")
    .eq("id", employeeId)
    .maybeSingle();
  if (currentError || !current) return { error: "Employee not found." };

  const organizationError = await validateEmployeeOrganizationAssignment(supabase, {
    requestedDepartmentId: result.data.department_id,
    requestedJobTitleId: result.data.job_title_id,
    currentDepartmentId: current.department_id,
    currentJobTitleId: current.job_title_id,
  });
  if (organizationError) return organizationState(organizationError);

  const { error } = await supabase.from("employees").update({
    ...result.data,
    updated_at: new Date().toISOString(),
  }).eq("id", employeeId);
  if (error) return { error: databaseMessage(error, "Employment information could not be saved.") };

  revalidateProfile(employeeId);
  revalidatePath("/settings/departments");
  revalidatePath("/settings/job-titles");
  redirect(`/employees/${employeeId}?tab=employment&success=employment_updated`);
}

export async function updateManager(
  employeeId: string,
  _state: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  const { supabase } = await requireEmployeeProfileManager(employeeId);
  const managerId = String(formData.get("manager_id") ?? "").trim() || null;
  const { data: currentEmployee, error: currentEmployeeError } = await supabase
    .from("employees")
    .select("manager_id")
    .eq("id", employeeId)
    .maybeSingle();
  if (currentEmployeeError || !currentEmployee) return { error: "Employee not found." };
  const managerError = await validateManagerAssignment(
    supabase,
    employeeId,
    managerId,
    currentEmployee.manager_id,
  );
  if (managerError) return { error: managerError, fieldErrors: { manager_id: managerError } };

  const { error } = await supabase
    .from("employees")
    .update({ manager_id: managerId, updated_at: new Date().toISOString() })
    .eq("id", employeeId);
  if (error) return { error: databaseMessage(error, "Manager assignment could not be saved.") };

  revalidateProfile(employeeId);
  redirect(`/employees/${employeeId}?tab=employment&success=manager_updated`);
}

export async function createEmergencyContact(
  employeeId: string,
  _state: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  const { supabase } = await requireEmployeeProfileManager(employeeId);
  const result = validateEmergencyContact(formData);
  if (!result.data) return result.state ?? { error: "Invalid emergency contact." };

  const { count, error: countError } = await supabase
    .from("employee_emergency_contacts")
    .select("id", { count: "exact", head: true })
    .eq("employee_id", employeeId);
  if (countError) return { error: "Unable to validate emergency contacts." };

  const { error } = await supabase.from("employee_emergency_contacts").insert({
    employee_id: employeeId,
    ...result.data,
    is_primary: (count ?? 0) === 0 ? true : result.data.is_primary,
  });
  if (error) return { error: databaseMessage(error, "Emergency contact could not be added.") };

  revalidateProfile(employeeId);
  redirect(`/employees/${employeeId}?tab=emergency&success=contact_created`);
}

export async function updateEmergencyContact(
  employeeId: string,
  contactId: string,
  _state: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  const { supabase } = await requireEmployeeProfileManager(employeeId);
  const result = validateEmergencyContact(formData);
  if (!result.data) return result.state ?? { error: "Invalid emergency contact." };

  const [{ data: current, error: currentError }, { count, error: countError }] = await Promise.all([
    supabase
      .from("employee_emergency_contacts")
      .select("id,is_primary")
      .eq("id", contactId)
      .eq("employee_id", employeeId)
      .maybeSingle(),
    supabase
      .from("employee_emergency_contacts")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", employeeId),
  ]);
  if (currentError || countError || !current) return { error: "Emergency contact not found." };
  if (current.is_primary && !result.data.is_primary && (count ?? 0) > 1) {
    return { error: "Assign another primary contact before removing this primary status.", fieldErrors: { is_primary: "A primary contact is required." } };
  }

  const { error } = await supabase
    .from("employee_emergency_contacts")
    .update({ ...result.data, is_primary: (count ?? 0) === 1 ? true : result.data.is_primary })
    .eq("id", contactId)
    .eq("employee_id", employeeId);
  if (error) return { error: databaseMessage(error, "Emergency contact could not be updated.") };

  revalidateProfile(employeeId);
  redirect(`/employees/${employeeId}?tab=emergency&success=contact_updated`);
}

export async function deleteEmergencyContact(employeeId: string, contactId: string) {
  const { supabase } = await requireEmployeeProfileManager(employeeId);
  const [{ data: contact, error: contactError }, { count, error: countError }] = await Promise.all([
    supabase
      .from("employee_emergency_contacts")
      .select("id,is_primary")
      .eq("id", contactId)
      .eq("employee_id", employeeId)
      .maybeSingle(),
    supabase
      .from("employee_emergency_contacts")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", employeeId),
  ]);
  if (contactError || countError || !contact) redirect(`/employees/${employeeId}?tab=emergency&error=contact_not_found`);
  if (contact.is_primary && (count ?? 0) > 1) redirect(`/employees/${employeeId}?tab=emergency&error=primary_required`);

  const { error } = await supabase
    .from("employee_emergency_contacts")
    .delete()
    .eq("id", contactId)
    .eq("employee_id", employeeId);
  if (error) redirect(`/employees/${employeeId}?tab=emergency&error=contact_delete_failed`);

  revalidateProfile(employeeId);
  redirect(`/employees/${employeeId}?tab=emergency&success=contact_deleted`);
}

export async function uploadEmployeeAvatar(
  employeeId: string,
  _state: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  const { supabase } = await requireEmployeeProfileManager(employeeId);
  const fileValue = formData.get("avatar");
  const file = fileValue instanceof File ? fileValue : null;
  const validation = validateAvatarFile(file);
  if (!file || validation.error || !validation.extension) return { error: validation.error ?? "Select an image to upload." };

  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("avatar_path")
    .eq("id", employeeId)
    .maybeSingle();
  if (employeeError || !employee) return { error: "Employee not found." };

  const path = `${employeeId}/${randomUUID()}.${validation.extension}`;
  const bytes = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from("employee-avatars")
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (uploadError) return { error: databaseMessage(uploadError, "Profile photo could not be uploaded.") };

  const { error: updateError } = await supabase
    .from("employees")
    .update({ avatar_path: path, updated_at: new Date().toISOString() })
    .eq("id", employeeId);
  if (updateError) {
    await supabase.storage.from("employee-avatars").remove([path]);
    return { error: databaseMessage(updateError, "Profile photo could not be saved.") };
  }

  if (employee.avatar_path) await supabase.storage.from("employee-avatars").remove([employee.avatar_path]);
  revalidateProfile(employeeId);
  redirect(`/employees/${employeeId}?success=avatar_updated`);
}

export async function removeEmployeeAvatar(employeeId: string) {
  const { supabase } = await requireEmployeeProfileManager(employeeId);
  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("avatar_path")
    .eq("id", employeeId)
    .maybeSingle();
  if (employeeError || !employee) redirect(`/employees/${employeeId}?error=avatar_remove_failed`);

  const { error } = await supabase
    .from("employees")
    .update({ avatar_path: null, updated_at: new Date().toISOString() })
    .eq("id", employeeId);
  if (error) redirect(`/employees/${employeeId}?error=avatar_remove_failed`);
  if (employee.avatar_path) await supabase.storage.from("employee-avatars").remove([employee.avatar_path]);

  revalidateProfile(employeeId);
  redirect(`/employees/${employeeId}?success=avatar_removed`);
}
