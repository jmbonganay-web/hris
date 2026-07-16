"use server";

import { revalidatePath } from "next/cache";
import { getDocumentPermissionContext } from "@/features/documents/auth";
import { mapDocumentError } from "@/features/documents/errors";
import type { DocumentActionState } from "@/features/documents/types";
import { createClient } from "@/lib/supabase/server";

function refreshEmployeeDocuments(documentId?: string) {
  revalidatePath("/documents");
  revalidatePath("/dashboard");
  if (documentId) revalidatePath(`/documents/${documentId}`);
}

export async function submitDocumentDraft(documentId: string, versionId: string, requestId: string): Promise<DocumentActionState> {
  const context = await getDocumentPermissionContext();
  if (!context.employeeId) return { error: "An employee profile is required." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_document_draft", {
    p_document_id: documentId,
    p_version_id: versionId,
    p_request_id: requestId,
  });
  if (error) return { error: mapDocumentError(error.message) };
  refreshEmployeeDocuments(documentId);
  return { success: "Document submitted for review." };
}

export async function archiveOwnDocumentDraft(documentId: string, requestId: string): Promise<DocumentActionState> {
  const context = await getDocumentPermissionContext();
  if (!context.employeeId) return { error: "An employee profile is required." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_employee_document", {
    p_document_id: documentId,
    p_reason: "Employee removed draft",
    p_request_id: requestId,
  });
  if (error) return { error: mapDocumentError(error.message) };
  refreshEmployeeDocuments(documentId);
  return { success: "Draft archived." };
}

export async function markDocumentNotificationRead(notificationId: string): Promise<void> {
  await getDocumentPermissionContext();
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_notification_read", { p_notification_id: notificationId });
  if (error) throw new Error(mapDocumentError(error.message));
  refreshEmployeeDocuments();
}
