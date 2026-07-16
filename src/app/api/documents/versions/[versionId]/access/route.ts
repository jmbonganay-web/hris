import { randomUUID } from "node:crypto";
import { mapDocumentError } from "@/features/documents/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request, context: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await context.params;
  const body = await request.json() as { disposition?: "preview" | "download" };
  const disposition = body.disposition;
  if (disposition !== "preview" && disposition !== "download") {
    return Response.json({ code: "DOCUMENT_ACCESS_DENIED", message: mapDocumentError("DOCUMENT_ACCESS_DENIED") }, { status: 403, headers: noStore });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("authorize_document_file_access", {
    p_version_id: versionId,
    p_disposition: disposition,
    p_request_id: randomUUID(),
  });
  if (error || !data) {
    return Response.json({ code: "DOCUMENT_ACCESS_DENIED", message: mapDocumentError(error?.message ?? "DOCUMENT_ACCESS_DENIED") }, { status: 403, headers: noStore });
  }
  const access = data as { bucket: string; path: string; filename: string; mime_type: string; expires_in: number };
  const { data: signed, error: signedError } = await createAdminClient().storage.from(access.bucket).createSignedUrl(
    access.path,
    access.expires_in,
    { download: disposition === "download" ? access.filename : false },
  );
  if (signedError || !signed) {
    return Response.json({ code: "DOCUMENT_ACCESS_DENIED", message: mapDocumentError("DOCUMENT_ACCESS_DENIED") }, { status: 403, headers: noStore });
  }
  return Response.json({
    url: signed.signedUrl,
    filename: access.filename,
    mimeType: access.mime_type,
    disposition,
    expiresIn: access.expires_in,
  }, { headers: noStore });
}
