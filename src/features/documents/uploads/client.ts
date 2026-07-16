export function matchUploadTicketsToFiles<T extends { clientFileKey: string; file: { name: string } }>(
  files: T[],
  tickets: Array<{ clientFileKey: string; path: string; token: string }>,
) {
  const byKey = new Map(tickets.map((ticket) => [ticket.clientFileKey, ticket]));
  if (byKey.size !== tickets.length || files.length !== tickets.length || files.some((file) => !byKey.has(file.clientFileKey))) {
    throw new Error("DOCUMENT_UPLOAD_SESSION_INVALID");
  }
  return files.map((file) => ({ file, ticket: byKey.get(file.clientFileKey)! }));
}

export async function uploadDocumentBatch(input: {
  sessionId: string;
  files: Array<{ clientFileKey: string; file: File }>;
  tickets: Array<{ clientFileKey: string; path: string; token: string }>;
  onProgress?: (completed: number, total: number) => void;
}) {
  const { createClient } = await import("../../../lib/supabase/client.ts");
  const supabase = createClient();
  const matched = matchUploadTicketsToFiles(input.files, input.tickets);
  let completed = 0;
  for (const item of matched) {
    const { error } = await supabase.storage.from("employee-documents").uploadToSignedUrl(
      item.ticket.path,
      item.ticket.token,
      item.file.file,
      { contentType: item.file.file.type, upsert: false },
    );
    if (error) throw new Error("DOCUMENT_UPLOAD_INCOMPLETE");
    completed += 1;
    input.onProgress?.(completed, matched.length);
  }
  const response = await fetch("/api/documents/uploads/finalize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: input.sessionId }),
  });
  if (!response.ok) {
    const body = await response.json() as { code?: string };
    throw new Error(body.code ?? "DOCUMENT_UPLOAD_INCOMPLETE");
  }
  return response.json();
}
