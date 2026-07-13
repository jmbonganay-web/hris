"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { encryptSensitiveValue } from "@/lib/security/sensitive-data";
import {
  requireDeletedHrNoteManager,
  requireHrNoteManager,
} from "@/features/employees/hr-notes/auth";
import type { HrNoteActionState } from "@/features/employees/hr-notes/types";
import { validateHrNote } from "@/features/employees/hr-notes/validation";

function revalidateHrNotes(employeeId: string) {
  revalidatePath(`/employees/${employeeId}/hr-notes`);
  revalidatePath(`/employees/${employeeId}/hr-notes/deleted`);
  revalidatePath(`/employees/${employeeId}/activity`);
}

export async function createHrNote(
  employeeId: string,
  _state: HrNoteActionState,
  formData: FormData,
): Promise<HrNoteActionState> {
  const { supabase, user } = await requireHrNoteManager(employeeId);
  const validation = validateHrNote(formData);
  if (!validation.data) {
    return validation.state ?? { error: "Invalid HR note." };
  }

  let contentCiphertext: string;
  try {
    contentCiphertext = encryptSensitiveValue(validation.data.content);
  } catch {
    return {
      error: "Unable to save the HR note.",
      values: { category: validation.data.category },
    };
  }

  const { error } = await supabase.from("employee_hr_notes").insert({
    employee_id: employeeId,
    category: validation.data.category,
    content_ciphertext: contentCiphertext,
    created_by: user.id,
  });

  if (error) {
    console.error("HR note creation failed:", error.code, error.message);
    return {
      error: "Unable to save the HR note.",
      values: { category: validation.data.category },
    };
  }

  revalidateHrNotes(employeeId);
  redirect(`/employees/${employeeId}/hr-notes?success=note_created`);
}

export async function updateHrNote(
  employeeId: string,
  noteId: string,
  _state: HrNoteActionState,
  formData: FormData,
): Promise<HrNoteActionState> {
  const { supabase, user, role } = await requireHrNoteManager(employeeId);
  const validation = validateHrNote(formData);
  if (!validation.data) {
    return validation.state ?? { error: "Invalid HR note." };
  }

  const { data: note, error: noteError } = await supabase
    .from("employee_hr_notes")
    .select("id,created_by,deleted_at")
    .eq("id", noteId)
    .eq("employee_id", employeeId)
    .maybeSingle();

  if (noteError || !note || note.deleted_at) {
    return { error: "HR note not found." };
  }

  if (role !== "super_admin" && note.created_by !== user.id) {
    return { error: "You do not have permission to edit this note." };
  }

  let contentCiphertext: string;
  try {
    contentCiphertext = encryptSensitiveValue(validation.data.content);
  } catch {
    return {
      error: "Unable to update the HR note.",
      values: { category: validation.data.category },
    };
  }

  const { error } = await supabase
    .from("employee_hr_notes")
    .update({
      category: validation.data.category,
      content_ciphertext: contentCiphertext,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", noteId)
    .eq("employee_id", employeeId)
    .is("deleted_at", null);

  if (error) {
    console.error("HR note update failed:", error.code, error.message);
    return {
      error: "Unable to update the HR note.",
      values: { category: validation.data.category },
    };
  }

  revalidateHrNotes(employeeId);
  redirect(`/employees/${employeeId}/hr-notes?success=note_updated`);
}

export async function deleteHrNote(
  employeeId: string,
  noteId: string,
) {
  const { supabase, user, role } = await requireHrNoteManager(employeeId);
  const { data: note, error: noteError } = await supabase
    .from("employee_hr_notes")
    .select("id,created_by,deleted_at")
    .eq("id", noteId)
    .eq("employee_id", employeeId)
    .maybeSingle();

  if (noteError || !note || note.deleted_at) {
    redirect(`/employees/${employeeId}/hr-notes?error=note_not_found`);
  }

  if (role !== "super_admin" && note.created_by !== user.id) {
    redirect(`/employees/${employeeId}/hr-notes?error=unauthorized`);
  }

  const { error } = await supabase
    .from("employee_hr_notes")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: user.id,
    })
    .eq("id", noteId)
    .eq("employee_id", employeeId)
    .is("deleted_at", null);

  if (error) {
    console.error("HR note deletion failed:", error.code, error.message);
    redirect(`/employees/${employeeId}/hr-notes?error=note_delete_failed`);
  }

  revalidateHrNotes(employeeId);
  redirect(`/employees/${employeeId}/hr-notes?success=note_deleted`);
}

export async function restoreHrNote(
  employeeId: string,
  noteId: string,
) {
  const { supabase, user, employeeExists } =
    await requireDeletedHrNoteManager(employeeId);

  if (!employeeExists) {
    redirect("/employees?error=not_found");
  }

  const { error } = await supabase
    .from("employee_hr_notes")
    .update({
      deleted_at: null,
      deleted_by: null,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", noteId)
    .eq("employee_id", employeeId)
    .not("deleted_at", "is", null);

  if (error) {
    console.error("HR note restoration failed:", error.code, error.message);
    redirect(
      `/employees/${employeeId}/hr-notes/deleted?error=note_restore_failed`,
    );
  }

  revalidateHrNotes(employeeId);
  redirect(`/employees/${employeeId}/hr-notes?success=note_restored`);
}
