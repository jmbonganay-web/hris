import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { mapLeaveError } from "@/features/leave/errors";
import { validateLeaveAttachmentFile } from "@/features/leave/requests/storage";
import { createClient } from "@/lib/supabase/server";
import { encryptSensitiveValue } from "@/lib/security/sensitive-data";

export const dynamic = "force-dynamic";

const TICKET_LIFETIME_MS = 10 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      requestGroupId?: string;
      expectedRevisionId?: string;
      name?: string;
      type?: string;
      size?: number;
    };
    const file = {
      name: String(body.name ?? ""),
      type: String(body.type ?? ""),
      size: Number(body.size ?? 0),
    };
    validateLeaveAttachmentFile(file);

    const attachmentId = randomUUID();
    const requestGroupId = String(body.requestGroupId ?? "");
    const expectedRevisionId = String(body.expectedRevisionId ?? "");
    const supabase = await createClient();
    const { data: storagePath, error } = await supabase.rpc("prepare_leave_attachment", {
      p_request_group_id: requestGroupId,
      p_expected_revision_id: expectedRevisionId,
      p_attachment_id: attachmentId,
      p_original_filename: file.name,
      p_mime_type: file.type,
    });
    if (error || !storagePath) {
      throw new Error(error?.message ?? "LEAVE_ATTACHMENT_INVALID");
    }

    const { data: signed, error: signedError } = await supabase.storage
      .from("leave-documents")
      .createSignedUploadUrl(storagePath);
    if (signedError || !signed?.signedUrl) {
      throw new Error("LEAVE_ATTACHMENT_INVALID");
    }

    const finalizeToken = encryptSensitiveValue(JSON.stringify({
      attachmentId,
      requestGroupId,
      expectedRevisionId,
      originalFilename: file.name,
      storagePath,
      expiresAt: Date.now() + TICKET_LIFETIME_MS,
    }));

    return NextResponse.json(
      { attachmentId, signedUploadUrl: signed.signedUrl, finalizeToken },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: mapLeaveError(error instanceof Error ? error.message : "") },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
