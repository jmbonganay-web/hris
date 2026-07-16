export function normalizeReviewQueueRows(rows: Array<Record<string, unknown>>) {
  return rows.map((row) => ({
    documentId: String(row.document_id),
    versionId: String(row.version_id),
    employeeId: String(row.employee_id),
    employeeName: String(row.employee_name),
    categoryId: String(row.category_id),
    categoryName: String(row.category_name),
    title: String(row.title),
    submittedAt: String(row.submitted_at),
    expirationDate: row.expiration_date ? String(row.expiration_date) : null,
    reviewStatus: String(row.review_status),
    expectedUpdatedAt: String(row.expected_updated_at),
  }));
}

export async function listDocumentReviewQueue(filters: {
  status?: "pending_review" | "replacement_requested";
  categoryId?: string;
  employeeQuery?: string;
  submittedFrom?: string;
  submittedTo?: string;
  expiration?: "none" | "valid" | "expiring_soon" | "expired";
  page?: number;
} = {}) {
  const { createClient } = await import("../../../lib/supabase/server.ts");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_document_review_queue", {
    p_status: filters.status ?? "pending_review",
    p_category_id: filters.categoryId ?? null,
    p_employee_query: filters.employeeQuery?.trim() || null,
    p_submitted_from: filters.submittedFrom ?? null,
    p_submitted_to: filters.submittedTo ?? null,
    p_expiration: filters.expiration ?? null,
    p_page: filters.page ?? 1,
    p_page_size: 25,
  });
  if (error) throw new Error(error.message);
  return normalizeReviewQueueRows((data ?? []) as Array<Record<string, unknown>>);
}

export async function getDocumentReviewDetail(documentId: string) {
  const { createClient } = await import("../../../lib/supabase/server.ts");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_document_review_detail", { p_document_id: documentId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("DOCUMENT_NOT_FOUND");
  return data;
}
