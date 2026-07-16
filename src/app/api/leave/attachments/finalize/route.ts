import { NextResponse } from "next/server";
import { mapLeaveError } from "@/features/leave/errors";
import { createClient } from "@/lib/supabase/server";
import { decryptSensitiveValue } from "@/lib/security/sensitive-data";

export const dynamic = "force-dynamic";

type UploadTicket = {
  attachmentId: string;
  requestGroupId: string;
  expectedRevisionId: string;
  originalFilename: string;
  storagePath: string;
  expiresAt: number;
};

export async function POST(request: Request) {
  let ticket: UploadTicket | null = null;
  try {
    const body = await request.json() as { finalizeToken?: string };
    ticket = JSON.parse(
      decryptSensitiveValue(String(body.finalizeToken ?? "")),
    ) as UploadTicket;
    if (
      !ticket.attachmentId ||
      !ticket.requestGroupId ||
      !ticket.expectedRevisionId ||
      !ticket.originalFilename ||
      !ticket.storagePath ||
      !Number.isFinite(ticket.expiresAt) ||
      ticket.expiresAt < Date.now()
    ) {
      throw new Error("LEAVE_ATTACHMENT_INVALID");
    }

    const supabase = await createClient();
    const { data: attachmentId, error } = await supabase.rpc("finalize_leave_attachment", {
      p_request_group_id: ticket.requestGroupId,
      p_expected_revision_id: ticket.expectedRevisionId,
      p_attachment_id: ticket.attachmentId,
      p_storage_path: ticket.storagePath,
      p_original_filename: ticket.originalFilename,
    });
    if (error || !attachmentId) {
      await supabase.storage.from("leave-documents").remove([ticket.storagePath]);
      throw new Error(error?.message ?? "LEAVE_ATTACHMENT_INVALID");
    }

    return NextResponse.json(
      { attachmentId },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: mapLeaveError(error instanceof Error ? error.message : "") },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
