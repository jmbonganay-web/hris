import { mapDocumentError } from "@/features/documents/errors";
import { getDocumentPermissionContext } from "@/features/documents/auth";
import { getDocumentCategoryDetail } from "@/features/documents/categories/queries";
import { createSignedDocumentUploadTickets, removeDocumentObjects } from "@/features/documents/uploads/storage";
import { validateDocumentMetadata, validateUploadBatch, validateVisibilityOverride } from "@/features/documents/validation";
import type { DocumentCoreMetadata, DocumentUploadManifest, DocumentVisibility } from "@/features/documents/types";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PrepareBody = {
  employeeId?: string;
  categoryId?: string;
  categoryVersionId?: string;
  source?: "employee" | "hr";
  mode?: "employee" | "hr";
  saveAsDraft?: boolean;
  replacementDocumentId?: string | null;
  supersedesVersionId?: string | null;
  visibilityOverride?: DocumentVisibility | null;
  commonMetadata?: DocumentCoreMetadata;
  files?: DocumentUploadManifest[];
  idempotencyKey?: string;
};

const noStore = { "Cache-Control": "no-store" };

function badRequest(code: string, message: string) {
  return Response.json({ code, message }, { status: 400, headers: noStore });
}

export async function POST(request: Request) {
  let sessionId: string | null = null;
  let storagePaths: string[] = [];
  try {
    const body = await request.json() as PrepareBody;
    const context = await getDocumentPermissionContext();
    const employeeId = String(body.employeeId ?? "");
    const categoryId = String(body.categoryId ?? "");
    const categoryVersionId = String(body.categoryVersionId ?? "");
    const source = body.source ?? body.mode ?? "employee";
    const idempotencyKey = String(body.idempotencyKey ?? "");
    if (!employeeId || !categoryId || !categoryVersionId || !idempotencyKey) {
      return badRequest("DOCUMENT_INVALID_METADATA", mapDocumentError("DOCUMENT_INVALID_METADATA"));
    }

    const category = await getDocumentCategoryDetail(categoryId);
    if (category.currentVersion.id !== categoryVersionId) {
      return badRequest("DOCUMENT_CATEGORY_STALE", mapDocumentError("DOCUMENT_CATEGORY_STALE"));
    }
    const files = Array.isArray(body.files) ? body.files : [];
    const upload = validateUploadBatch(files, {
      cardinality: category.currentVersion.cardinality,
      allowedMimeTypes: category.currentVersion.allowedMimeTypes,
    });
    if (upload.error) return badRequest("DOCUMENT_INVALID_FILE", upload.error);

    const metadataInput: DocumentCoreMetadata = {
      title: String(body.commonMetadata?.title ?? ""),
      referenceNumber: String(body.commonMetadata?.referenceNumber ?? ""),
      issueDate: String(body.commonMetadata?.issueDate ?? ""),
      expirationDate: String(body.commonMetadata?.expirationDate ?? ""),
      issuingOrganization: String(body.commonMetadata?.issuingOrganization ?? ""),
      notes: String(body.commonMetadata?.notes ?? ""),
      tags: Array.isArray(body.commonMetadata?.tags) ? body.commonMetadata.tags.map(String) : [],
      customMetadata: body.commonMetadata?.customMetadata && typeof body.commonMetadata.customMetadata === "object"
        ? body.commonMetadata.customMetadata
        : {},
    };
    const metadata = validateDocumentMetadata(metadataInput, {
      expirationMode: category.currentVersion.expirationMode,
      defaultValidityMonths: category.currentVersion.defaultValidityMonths,
      customFields: category.currentVersion.fields,
    });
    if (metadata.error || !metadata.data) return badRequest("DOCUMENT_INVALID_METADATA", metadata.error ?? mapDocumentError("DOCUMENT_INVALID_METADATA"));

    const visibility = validateVisibilityOverride(
      category.currentVersion.defaultVisibility,
      body.visibilityOverride ?? null,
      context.role,
    );
    if (visibility.error) return badRequest("DOCUMENT_INVALID_VISIBILITY", visibility.error);
    if (source === "employee" && body.visibilityOverride) {
      return badRequest("DOCUMENT_INVALID_VISIBILITY", mapDocumentError("DOCUMENT_INVALID_VISIBILITY"));
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_document_upload_session", {
      p_employee_id: employeeId,
      p_category_id: categoryId,
      p_category_version_id: categoryVersionId,
      p_source: source,
      p_save_as_draft: Boolean(body.saveAsDraft),
      p_replacement_document_id: body.replacementDocumentId ?? null,
      p_supersedes_version_id: body.supersedesVersionId ?? null,
      p_visibility_override: body.visibilityOverride ?? null,
      p_common_metadata: metadata.data,
      p_manifest: upload.data,
      p_idempotency_key: idempotencyKey,
    });
    if (error || !data) throw new Error(error?.message ?? "DOCUMENT_UPLOAD_SESSION_INVALID");
    const result = data as {
      session_id: string;
      expires_at: string;
      files: Array<{ client_file_key: string; storage_path: string }>;
    };
    sessionId = result.session_id;
    storagePaths = result.files.map((file) => file.storage_path);
    const tickets = await createSignedDocumentUploadTickets(result.files.map((file) => ({
      clientFileKey: file.client_file_key,
      storagePath: file.storage_path,
    })));
    return Response.json({ sessionId: result.session_id, expiresAt: result.expires_at, tickets }, { headers: noStore });
  } catch (error) {
    if (sessionId) {
      try {
        const supabase = await createClient();
        await supabase.rpc("cancel_document_upload_session", { p_session_id: sessionId });
      } catch { /* best-effort state cleanup */ }
    }
    try { await removeDocumentObjects(storagePaths); } catch { /* no uploaded objects may exist yet */ }
    const message = error instanceof Error ? error.message : String(error);
    return badRequest("DOCUMENT_UPLOAD_SESSION_INVALID", mapDocumentError(message, "The upload session could not be prepared."));
  }
}
