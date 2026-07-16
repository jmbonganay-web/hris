import { randomUUID } from "node:crypto";
import { requireUser } from "@/features/employees/auth";
import { removeDocumentObjects, verifyUploadedDocumentObjects } from "@/features/documents/uploads/storage";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

type ManifestFile = {
  id: string;
  storage_path: string;
  expected_mime_type: string;
  expected_size_bytes: number;
};

type UploadManifest = {
  session_id: string;
  source: "employee" | "hr";
  files: ManifestFile[];
};

export async function POST(request: Request) {
  const correlationId = randomUUID();
  let supabase: Awaited<ReturnType<typeof requireUser>>["supabase"] | null = null;
  let manifest: UploadManifest | null = null;
  try {
    const body = await request.json() as { sessionId?: string };
    const sessionId = String(body.sessionId ?? "");
    if (!sessionId) throw new Error("DOCUMENT_UPLOAD_SESSION_INVALID");
    ({ supabase } = await requireUser());
    const { data: manifestData, error: manifestError } = await supabase.rpc("get_document_upload_session_manifest", {
      p_session_id: sessionId,
    });
    if (manifestError || !manifestData) throw new Error(manifestError?.message ?? "DOCUMENT_UPLOAD_SESSION_INVALID");
    manifest = manifestData as UploadManifest;
    const verified = await verifyUploadedDocumentObjects(manifest.files.map((file) => ({
      id: file.id,
      storagePath: file.storage_path,
      expectedMimeType: file.expected_mime_type,
      expectedSizeBytes: Number(file.expected_size_bytes),
    })));
    const { error: verifiedError } = await supabase.rpc("mark_document_upload_files_verified", {
      p_session_id: sessionId,
      p_files: verified.map((file) => ({ fileId: file.fileId, sha256: file.sha256 })),
    });
    if (verifiedError) throw new Error(verifiedError.message);

    const requestId = randomUUID();
    const rpcName = manifest.source === "employee"
      ? "finalize_employee_document_upload"
      : "finalize_hr_document_upload";
    const { data, error } = await supabase.rpc(rpcName, { p_session_id: sessionId, p_request_id: requestId });
    if (error || !data) throw new Error(error?.message ?? "DOCUMENT_UPLOAD_INCOMPLETE");
    return Response.json(data, { headers: noStore });
  } catch {
    if (manifest) {
      try { await removeDocumentObjects(manifest.files.map((file) => file.storage_path)); } catch { /* best-effort object cleanup */ }
    }
    if (supabase && manifest) {
      try { await supabase.rpc("fail_document_upload_session", { p_session_id: manifest.session_id }); } catch { /* best-effort state cleanup */ }
    }
    return Response.json({
      code: "DOCUMENT_UPLOAD_INCOMPLETE",
      message: "The upload could not be completed. No official records were saved.",
      correlationId,
    }, { status: 400, headers: noStore });
  }
}
