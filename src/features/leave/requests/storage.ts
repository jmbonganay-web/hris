import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  LEAVE_ATTACHMENT_BUCKET,
  LEAVE_ATTACHMENT_EXTENSIONS,
  LEAVE_ATTACHMENT_MAX_BYTES,
  LEAVE_ATTACHMENT_MAX_COUNT,
  LEAVE_ATTACHMENT_MIME_TYPES,
} from "../constants";

export function validateLeaveAttachmentFile(file: { name: string; type: string; size: number }) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mimeAllowed = LEAVE_ATTACHMENT_MIME_TYPES.includes(
    file.type as (typeof LEAVE_ATTACHMENT_MIME_TYPES)[number],
  );
  const extensionAllowed = LEAVE_ATTACHMENT_EXTENSIONS.includes(
    extension as (typeof LEAVE_ATTACHMENT_EXTENSIONS)[number],
  );
  const pairAllowed =
    (file.type === "application/pdf" && extension === "pdf") ||
    (file.type === "image/jpeg" && ["jpg", "jpeg"].includes(extension)) ||
    (file.type === "image/png" && extension === "png");

  if (
    !file.name.trim() ||
    file.name.length > 255 ||
    !mimeAllowed ||
    !extensionAllowed ||
    !pairAllowed ||
    !Number.isSafeInteger(file.size) ||
    file.size < 1 ||
    file.size > LEAVE_ATTACHMENT_MAX_BYTES
  ) {
    throw new Error("LEAVE_ATTACHMENT_INVALID");
  }
  return { extension, bucket: LEAVE_ATTACHMENT_BUCKET };
}

export function validateAttachmentCount(count: number) {
  if (!Number.isSafeInteger(count) || count < 0 || count >= LEAVE_ATTACHMENT_MAX_COUNT) {
    throw new Error("LEAVE_ATTACHMENT_INVALID");
  }
}

export async function deleteLeaveAttachment(input: {
  attachmentId: string;
  expectedRevisionId: string;
}) {
  const supabase = await createClient();
  const { data: storagePath, error } = await supabase.rpc("delete_leave_attachment", {
    p_attachment_id: input.attachmentId,
    p_expected_revision_id: input.expectedRevisionId,
  });
  if (error || !storagePath) throw new Error(error?.message ?? "LEAVE_ATTACHMENT_INVALID");
  const { error: storageError } = await supabase.storage
    .from(LEAVE_ATTACHMENT_BUCKET)
    .remove([storagePath]);
  if (storageError) throw new Error("LEAVE_ATTACHMENT_INVALID");
  return storagePath;
}

export function getLeaveAttachmentDownloadUrl(attachmentId: string) {
  return `/api/leave/attachments/${encodeURIComponent(attachmentId)}/download`;
}
