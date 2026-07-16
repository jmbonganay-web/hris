import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ attachmentId: string }> },
) {
  const params = await context.params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_leave_attachment_download", {
    p_attachment_id: params.attachmentId,
  });
  const item = data?.[0];
  if (error || !item) {
    return new Response("Not found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const { data: signed, error: signedError } = await supabase.storage
    .from("leave-documents")
    .createSignedUrl(item.storage_path, 60, { download: item.original_filename });
  if (signedError || !signed?.signedUrl) {
    return new Response("Unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const response = NextResponse.redirect(signed.signedUrl, 302);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}
