import type { DocumentVisibility } from "../types.ts";

const visibilityRank: Record<DocumentVisibility, number> = { employee_hr: 0, hr_only: 1, super_admin_only: 2 };

export function resolveEffectiveVisibility(categoryDefault: DocumentVisibility, override: DocumentVisibility | null) {
  const effective = override ?? categoryDefault;
  if (visibilityRank[effective] < visibilityRank[categoryDefault]) throw new Error("DOCUMENT_INVALID_VISIBILITY");
  return effective;
}

export function canPreviewMime(mime: string) {
  return mime === "application/pdf" || mime === "image/jpeg" || mime === "image/png";
}

export function normalizeEmployeeDocumentRow(row: Record<string, unknown>) {
  return {
    id: String(row.document_id),
    title: String(row.title),
    categoryName: String(row.category_name),
    visibility: String(row.effective_visibility),
    reviewStatus: String(row.review_status),
    expirationStatus: String(row.expiration_status),
    issueDate: row.issue_date ? String(row.issue_date) : null,
    expirationDate: row.expiration_date ? String(row.expiration_date) : null,
    versionNumber: Number(row.version_number),
    updatedAt: String(row.updated_at),
    canAccessFile: Boolean(row.can_access_file),
  };
}

async function rpc(name: string, args: Record<string, unknown>) {
  const { createClient } = await import("../../../lib/supabase/server.ts");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

export async function listOwnDocuments(filters: { categoryId?: string; reviewStatus?: string; expirationStatus?: string; page?: number } = {}) {
  const data = await rpc("list_own_documents", {
    p_category_id: filters.categoryId ?? null,
    p_review_status: filters.reviewStatus ?? null,
    p_expiration_status: filters.expirationStatus ?? null,
    p_page: filters.page ?? 1,
    p_page_size: 25,
  });
  return ((data ?? []) as Array<Record<string, unknown>>).map(normalizeEmployeeDocumentRow);
}

export async function getOwnDocumentDetail(documentId: string) {
  const data = await rpc("get_own_document_detail", { p_document_id: documentId });
  if (!data) throw new Error("DOCUMENT_NOT_FOUND");
  return data;
}

export async function listEmployeeDocumentsForHr(employeeId: string, filters: { includeArchived?: boolean; categoryId?: string } = {}) {
  return (await rpc("list_employee_documents_for_hr", {
    p_employee_id: employeeId,
    p_include_archived: filters.includeArchived ?? false,
    p_category_id: filters.categoryId ?? null,
  })) ?? [];
}

export async function getDocumentDetailForHr(documentId: string) {
  const data = await rpc("get_document_detail_for_hr", { p_document_id: documentId });
  if (!data) throw new Error("DOCUMENT_NOT_FOUND");
  return data;
}

export async function listRecentDocumentActivity(limit = 10) {
  return (await rpc("list_recent_document_activity", { p_limit: Math.max(1, Math.min(50, limit)) })) ?? [];
}

export type AdminDocumentActivity = {
  id: string;
  documentId: string;
  employeeId: string;
  employeeName: string;
  categoryName: string;
  title: string;
  action: string;
  occurredAt: string;
};

export type DocumentAdminDashboard = {
  pendingReviewCount: number;
  missingDocumentCount: number;
  expiringSoonCount: number;
  expiredCount: number;
  recentUploads: AdminDocumentActivity[];
  recentDecisions: AdminDocumentActivity[];
};

export async function getDocumentAdminDashboard(): Promise<DocumentAdminDashboard> {
  const data = await rpc("get_document_admin_dashboard", {}) as Partial<DocumentAdminDashboard> | null;
  return {
    pendingReviewCount: Number(data?.pendingReviewCount ?? 0),
    missingDocumentCount: Number(data?.missingDocumentCount ?? 0),
    expiringSoonCount: Number(data?.expiringSoonCount ?? 0),
    expiredCount: Number(data?.expiredCount ?? 0),
    recentUploads: Array.isArray(data?.recentUploads) ? data.recentUploads : [],
    recentDecisions: Array.isArray(data?.recentDecisions) ? data.recentDecisions : [],
  };
}
