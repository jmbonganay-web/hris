import { createHash } from "node:crypto";
import { DOCUMENT_BUCKET } from "../constants.ts";

const extensions: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export function documentExtensionForMime(mime: string) {
  const extension = extensions[mime];
  if (!extension) throw new Error("DOCUMENT_INVALID_FILE");
  return extension;
}

export function sanitizeDocumentFilename(filename: string) {
  const normalized = filename.trim();
  const extension = normalized.split(".").pop()?.toLowerCase() ?? "";
  const base = normalized.slice(0, Math.max(0, normalized.length - extension.length - 1))
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 180) || "document";
  return `${base}.${extension}`.toLowerCase();
}

export function verifyDocumentSignature(bytes: Buffer, mime: string) {
  if (mime === "application/pdf") return bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  if (mime === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  return false;
}

export function sha256Document(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function adminClient() {
  const { createAdminClient } = await import("../../../lib/supabase/admin.ts");
  return createAdminClient();
}

export async function createSignedDocumentUploadTickets(files: Array<{ clientFileKey: string; storagePath: string }>) {
  const admin = await adminClient();
  const tickets: Array<{ clientFileKey: string; path: string; token: string }> = [];
  for (const file of files) {
    const { data, error } = await admin.storage.from(DOCUMENT_BUCKET).createSignedUploadUrl(file.storagePath, { upsert: false });
    if (error || !data) throw new Error("DOCUMENT_UPLOAD_SESSION_INVALID");
    tickets.push({ clientFileKey: file.clientFileKey, path: data.path, token: data.token });
  }
  return tickets;
}

export async function verifyUploadedDocumentObjects(files: Array<{ id: string; storagePath: string; expectedMimeType: string; expectedSizeBytes: number }>) {
  const admin = await adminClient();
  const verified: Array<{ fileId: string; sha256: string }> = [];
  for (const file of files) {
    const { data, error } = await admin.storage.from(DOCUMENT_BUCKET).download(file.storagePath);
    if (error || !data) throw new Error("DOCUMENT_UPLOAD_INCOMPLETE");
    const bytes = Buffer.from(await data.arrayBuffer());
    if (bytes.byteLength !== file.expectedSizeBytes || !verifyDocumentSignature(bytes, file.expectedMimeType)) {
      throw new Error("DOCUMENT_INVALID_FILE");
    }
    verified.push({ fileId: file.id, sha256: sha256Document(bytes) });
  }
  return verified;
}

export async function removeDocumentObjects(paths: string[]) {
  if (paths.length === 0) return;
  const admin = await adminClient();
  const { error } = await admin.storage.from(DOCUMENT_BUCKET).remove(paths);
  if (error) throw new Error("DOCUMENT_UPLOAD_INCOMPLETE");
}
