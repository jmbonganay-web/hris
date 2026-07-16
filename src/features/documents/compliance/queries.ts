import type { DocumentExpirationStatus, DocumentRequirementStatus } from "../types.ts";

export function classifyExpiration(expirationDate: string | null, expiringSoonDays: number, today: string): DocumentExpirationStatus {
  if (!expirationDate) return "no_expiration";
  if (expirationDate < today) return "expired";
  const start = Date.parse(`${today}T00:00:00.000Z`);
  const end = Date.parse(`${expirationDate}T00:00:00.000Z`);
  return Math.floor((end - start) / 86_400_000) <= expiringSoonDays ? "expiring_soon" : "valid";
}

export function deriveRequirementStatus(input: {
  requiredCount: number;
  approvedValidCount: number;
  approvedExpiringCount: number;
  approvedExpiredCount: number;
  pendingCount: number;
  replacementRequestedCount: number;
  expiredSatisfies: boolean;
}): DocumentRequirementStatus {
  const approvedSatisfyingCount = input.approvedValidCount
    + input.approvedExpiringCount
    + (input.expiredSatisfies ? input.approvedExpiredCount : 0);
  if (approvedSatisfyingCount >= input.requiredCount) {
    if (input.approvedValidCount >= input.requiredCount) return "approved";
    if (input.approvedExpiringCount > 0) return "expiring_soon";
    return "approved";
  }
  if (input.pendingCount > 0) return "pending_review";
  if (input.replacementRequestedCount > 0) return "replacement_requested";
  if (input.approvedExpiredCount > 0) return "expired";
  return "missing";
}

export type ManagerComplianceRow = {
  employeeId: string;
  employeeName: string;
  overallStatus: DocumentRequirementStatus;
  missingCount: number;
  pendingReviewCount: number;
  expiringSoonCount: number;
  expiredCount: number;
};

export function normalizeManagerComplianceRows(rows: Array<Record<string, unknown>>): ManagerComplianceRow[] {
  return rows.map((row) => ({
    employeeId: String(row.employee_id),
    employeeName: String(row.employee_name),
    overallStatus: String(row.overall_status) as DocumentRequirementStatus,
    missingCount: Number(row.missing_count),
    pendingReviewCount: Number(row.pending_review_count),
    expiringSoonCount: Number(row.expiring_soon_count),
    expiredCount: Number(row.expired_count),
  }));
}

export async function getOwnDocumentCompliance() {
  const { createClient } = await import("../../../lib/supabase/server.ts");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_employee_document_compliance", { p_employee_id: null });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getEmployeeDocumentCompliance(employeeId: string) {
  const { createClient } = await import("../../../lib/supabase/server.ts");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_employee_document_compliance", { p_employee_id: employeeId });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getManagerDocumentCompliance() {
  const { createClient } = await import("../../../lib/supabase/server.ts");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_manager_document_compliance");
  if (error) throw new Error(error.message);
  return normalizeManagerComplianceRows((data ?? []) as Array<Record<string, unknown>>);
}
