import "server-only";

import { createClient } from "@/lib/supabase/server";
import { decryptSensitiveValue } from "@/lib/security/sensitive-data";
import type {
  HrNoteCategory,
  HrNoteRecord,
} from "./types";

const noteSelect = `
  id,
  employee_id,
  category,
  content_ciphertext,
  created_by,
  created_at,
  updated_by,
  updated_at,
  deleted_by,
  deleted_at,
  author:profiles!employee_hr_notes_created_by_fkey(
    id,display_name,first_name,last_name
  ),
  updater:profiles!employee_hr_notes_updated_by_fkey(
    id,display_name,first_name,last_name
  ),
  deleter:profiles!employee_hr_notes_deleted_by_fkey(
    id,display_name,first_name,last_name
  )
`;

function mapNote(row: Record<string, unknown>): HrNoteRecord {
  let content: string | null = null;
  let contentUnavailable = false;

  try {
    content = decryptSensitiveValue(String(row.content_ciphertext));
  } catch {
    contentUnavailable = true;
    console.error("HR note decryption failed for note:", String(row.id));
  }

  return {
    id: String(row.id),
    employee_id: String(row.employee_id),
    category: row.category as HrNoteCategory,
    content,
    contentUnavailable,
    created_by: String(row.created_by),
    created_at: String(row.created_at),
    updated_by: row.updated_by ? String(row.updated_by) : null,
    updated_at: row.updated_at ? String(row.updated_at) : null,
    deleted_by: row.deleted_by ? String(row.deleted_by) : null,
    deleted_at: row.deleted_at ? String(row.deleted_at) : null,
    author: (row.author ?? null) as HrNoteRecord["author"],
    updater: (row.updater ?? null) as HrNoteRecord["updater"],
    deleter: (row.deleter ?? null) as HrNoteRecord["deleter"],
  };
}

export async function getActiveHrNotes(
  employeeId: string,
  category?: HrNoteCategory,
) {
  const supabase = await createClient();
  let query = supabase
    .from("employee_hr_notes")
    .select(noteSelect)
    .eq("employee_id", employeeId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (category) {
    query = query.eq("category", category);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Unable to load HR note metadata:", error.code, error.message);
    throw new Error("Unable to load HR notes.");
  }

  return (data ?? []).map((row) =>
    mapNote(row as unknown as Record<string, unknown>),
  );
}

export async function getDeletedHrNotes(employeeId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_hr_notes")
    .select(noteSelect)
    .eq("employee_id", employeeId)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  if (error) {
    console.error("Unable to load deleted HR note metadata:", error.code, error.message);
    throw new Error("Unable to load deleted HR notes.");
  }

  return (data ?? []).map((row) =>
    mapNote(row as unknown as Record<string, unknown>),
  );
}

export async function getHrNoteForEdit(
  employeeId: string,
  noteId: string,
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_hr_notes")
    .select(noteSelect)
    .eq("employee_id", employeeId)
    .eq("id", noteId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("Unable to load HR note metadata:", error.code, error.message);
    throw new Error("Unable to load HR note.");
  }

  return data
    ? mapNote(data as unknown as Record<string, unknown>)
    : null;
}
