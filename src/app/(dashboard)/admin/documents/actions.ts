"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/features/employees/auth";
import { requireDocumentManager, requireDocumentReviewer } from "@/features/documents/auth";
import { mapDocumentError } from "@/features/documents/errors";
import { removeDocumentObjects } from "@/features/documents/uploads/storage";
import type {
  DocumentActionState,
  DocumentCardinality,
  DocumentCategoryInput,
  DocumentCustomFieldDefinition,
  DocumentExpirationMode,
  DocumentPermissionCode,
  DocumentRequirementTargetType,
  DocumentVisibility,
} from "@/features/documents/types";
import {
  validateCategoryInput,
  validatePermissionGrant,
  validateRequirementInput,
  validateReviewDecision,
} from "@/features/documents/validation";
import { createClient } from "@/lib/supabase/server";

function documentActionError(error: unknown, fallback: string): DocumentActionState {
  const message = error instanceof Error ? error.message : String(error);
  return { error: mapDocumentError(message, fallback) };
}

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function nullableText(formData: FormData, name: string) {
  return text(formData, name) || null;
}

function nullableInteger(formData: FormData, name: string) {
  const value = text(formData, name);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

function parseFields(value: string): DocumentCustomFieldDefinition[] {
  try {
    const parsed = JSON.parse(value || "[]") as unknown;
    return Array.isArray(parsed) ? parsed as DocumentCustomFieldDefinition[] : [];
  } catch {
    return [];
  }
}

function categoryInput(formData: FormData): DocumentCategoryInput {
  return {
    categoryId: nullableText(formData, "category_id"),
    code: text(formData, "code"),
    name: text(formData, "name"),
    description: text(formData, "description"),
    defaultVisibility: text(formData, "default_visibility") as DocumentVisibility,
    employeeUploadEnabled: formData.get("employee_upload_enabled") === "on",
    cardinality: text(formData, "cardinality") as DocumentCardinality,
    allowedMimeTypes: formData.getAll("allowed_mime_types").map(String),
    expirationMode: text(formData, "expiration_mode") as DocumentExpirationMode,
    defaultValidityMonths: nullableInteger(formData, "default_validity_months"),
    expiringSoonDays: Number(text(formData, "expiring_soon_days") || "30"),
    retentionMonthsAfterSeparation: nullableInteger(formData, "retention_months_after_separation"),
    changeReason: text(formData, "change_reason"),
    fields: parseFields(text(formData, "fields_json")),
  };
}

function refreshConfiguration(categoryId?: string) {
  revalidatePath("/admin/documents");
  revalidatePath("/admin/documents/categories");
  revalidatePath("/admin/documents/requirements");
  revalidatePath("/documents");
  if (categoryId) revalidatePath(`/admin/documents/categories/${categoryId}`);
}

function refreshDocument(documentId?: string, employeeId?: string) {
  revalidatePath("/admin/documents");
  revalidatePath("/admin/documents/review");
  revalidatePath("/documents");
  if (documentId) {
    revalidatePath(`/admin/documents/review/${documentId}`);
    revalidatePath(`/documents/${documentId}`);
  }
  if (employeeId) revalidatePath(`/admin/documents/employees/${employeeId}`);
}

async function categoryRpc(name: "create_document_category" | "create_document_category_version", formData: FormData, categoryId?: string, expectedVersionNumber?: number) {
  const context = await requireDocumentManager();
  const validation = validateCategoryInput(categoryInput(formData), context.role);
  if (!validation.data) return { error: validation.error ?? "Invalid category configuration." } satisfies DocumentActionState;
  if (name === "create_document_category_version" && !validation.data.changeReason) return { error: "A change reason is required." } satisfies DocumentActionState;
  const supabase = await createClient();
  const input = validation.data;
  const parameters = name === "create_document_category"
    ? {
      p_code: input.code, p_name: input.name, p_description: input.description,
      p_default_visibility: input.defaultVisibility, p_employee_upload_enabled: input.employeeUploadEnabled,
      p_cardinality: input.cardinality, p_allowed_mime_types: input.allowedMimeTypes,
      p_expiration_mode: input.expirationMode, p_default_validity_months: input.defaultValidityMonths,
      p_expiring_soon_days: input.expiringSoonDays, p_retention_months_after_separation: input.retentionMonthsAfterSeparation,
      p_change_reason: input.changeReason || "Initial configuration", p_fields: input.fields, p_request_id: randomUUID(),
    }
    : {
      p_category_id: categoryId, p_expected_version_number: expectedVersionNumber,
      p_name: input.name, p_description: input.description, p_default_visibility: input.defaultVisibility,
      p_employee_upload_enabled: input.employeeUploadEnabled, p_cardinality: input.cardinality,
      p_allowed_mime_types: input.allowedMimeTypes, p_expiration_mode: input.expirationMode,
      p_default_validity_months: input.defaultValidityMonths, p_expiring_soon_days: input.expiringSoonDays,
      p_retention_months_after_separation: input.retentionMonthsAfterSeparation,
      p_change_reason: input.changeReason, p_fields: input.fields, p_request_id: randomUUID(),
    };
  const { data, error } = name === "create_document_category"
    ? await supabase.rpc("create_document_category", parameters)
    : await supabase.rpc("create_document_category_version", parameters);
  if (error) return documentActionError(error, "The document category could not be saved.");
  const result = data as { category_id?: string } | null;
  refreshConfiguration(result?.category_id ?? categoryId);
  return { success: name === "create_document_category" ? "Category created." : "Category version created." } satisfies DocumentActionState;
}

export async function createDocumentCategory(_state: DocumentActionState, formData: FormData) {
  return categoryRpc("create_document_category", formData);
}

export async function createDocumentCategoryVersion(categoryId: string, expectedVersionNumber: number, _state: DocumentActionState, formData: FormData) {
  return categoryRpc("create_document_category_version", formData, categoryId, expectedVersionNumber);
}

export async function archiveDocumentCategory(categoryId: string, requestId = randomUUID()): Promise<DocumentActionState> {
  await requireDocumentManager();
  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_document_category", { p_category_id: categoryId, p_request_id: requestId });
  if (error) return documentActionError(error, "The category could not be archived.");
  refreshConfiguration(categoryId);
  return { success: "Category archived." };
}

export async function restoreDocumentCategory(categoryId: string, requestId = randomUUID()): Promise<DocumentActionState> {
  await requireDocumentManager();
  const supabase = await createClient();
  const { error } = await supabase.rpc("restore_document_category", { p_category_id: categoryId, p_request_id: requestId });
  if (error) return documentActionError(error, "The category could not be restored.");
  refreshConfiguration(categoryId);
  return { success: "Category restored." };
}

function requirementInput(formData: FormData) {
  return {
    categoryId: text(formData, "category_id"),
    cardinality: text(formData, "cardinality") as DocumentCardinality,
    requiredCount: Number(text(formData, "required_count") || "0"),
    expiredSatisfies: formData.get("expired_satisfies") === "on",
    effectiveFrom: text(formData, "effective_from"),
    effectiveTo: nullableText(formData, "effective_to"),
    targetType: text(formData, "target_type") as DocumentRequirementTargetType,
    targetId: nullableText(formData, "target_id"),
  };
}

async function requirementRpc(name: "create_document_requirement" | "revise_document_requirement", formData: FormData, requirementId?: string) {
  await requireDocumentManager();
  const validation = validateRequirementInput(requirementInput(formData));
  if (!validation.data) return { error: validation.error ?? "Invalid requirement." } satisfies DocumentActionState;
  const supabase = await createClient();
  const input = validation.data;
  const params = {
    ...(name === "revise_document_requirement" ? { p_requirement_id: requirementId } : { p_category_id: input.categoryId }),
    p_required_count: input.requiredCount, p_expired_satisfies: input.expiredSatisfies,
    p_effective_from: input.effectiveFrom, p_effective_to: input.effectiveTo,
    p_target_type: input.targetType, p_target_id: input.targetId, p_request_id: randomUUID(),
  };
  const { error } = name === "create_document_requirement"
    ? await supabase.rpc("create_document_requirement", params)
    : await supabase.rpc("revise_document_requirement", params);
  if (error) return documentActionError(error, "The document requirement could not be saved.");
  refreshConfiguration(input.categoryId);
  return { success: name === "create_document_requirement" ? "Requirement created." : "Requirement revised." } satisfies DocumentActionState;
}

export async function createDocumentRequirement(_state: DocumentActionState, formData: FormData) {
  return requirementRpc("create_document_requirement", formData);
}
export async function reviseDocumentRequirement(requirementId: string, _state: DocumentActionState, formData: FormData) {
  return requirementRpc("revise_document_requirement", formData, requirementId);
}
export async function archiveDocumentRequirement(requirementId: string, requestId = randomUUID()): Promise<DocumentActionState> {
  await requireDocumentManager(); const supabase = await createClient();
  const { error } = await supabase.rpc("archive_document_requirement", { p_requirement_id: requirementId, p_request_id: requestId });
  if (error) return documentActionError(error, "The requirement could not be archived."); refreshConfiguration(); return { success: "Requirement archived." };
}
export async function restoreDocumentRequirement(requirementId: string, requestId = randomUUID()): Promise<DocumentActionState> {
  await requireDocumentManager(); const supabase = await createClient();
  const { error } = await supabase.rpc("restore_document_requirement", { p_requirement_id: requirementId, p_request_id: requestId });
  if (error) return documentActionError(error, "The requirement could not be restored."); refreshConfiguration(); return { success: "Requirement restored." };
}

export async function grantDocumentPermission(_state: DocumentActionState, formData: FormData): Promise<DocumentActionState> {
  const { supabase } = await requireSuperAdmin();
  const userId = text(formData, "user_id");
  const permissionCode = text(formData, "permission_code") as DocumentPermissionCode;
  const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (profileError || !profile) return { error: "The selected user could not be found." };
  const validation = validatePermissionGrant({ userId, userRole: profile.role, permissionCode });
  if (!validation.data) return { error: validation.error };
  const { error } = await supabase.rpc("grant_document_permission", { p_user_id: userId, p_permission_code: permissionCode, p_request_id: text(formData, "request_id") || randomUUID() });
  if (error) return documentActionError(error, "The permission could not be granted.");
  revalidatePath("/admin/documents/permissions"); revalidatePath("/admin/documents");
  return { success: "Permission granted." };
}

export async function revokeDocumentPermission(_state: DocumentActionState, formData: FormData): Promise<DocumentActionState> {
  const { supabase } = await requireSuperAdmin();
  if (formData.get("confirm") !== "on") return { error: "Confirm the permission revocation." };
  const userId = text(formData, "user_id");
  const permissionCode = text(formData, "permission_code") as DocumentPermissionCode;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  const validation = validatePermissionGrant({ userId, userRole: profile?.role ?? "employee", permissionCode });
  if (!validation.data) return { error: validation.error };
  const { error } = await supabase.rpc("revoke_document_permission", { p_user_id: userId, p_permission_code: permissionCode, p_request_id: text(formData, "request_id") || randomUUID() });
  if (error) return documentActionError(error, "The permission could not be revoked.");
  revalidatePath("/admin/documents/permissions"); revalidatePath("/admin/documents");
  return { success: "Permission revoked." };
}

export async function reviewDocumentSubmission(_state: DocumentActionState, formData: FormData): Promise<DocumentActionState> {
  await requireDocumentReviewer();
  const expected_version_updated_at = text(formData, "expected_version_updated_at");
  const input = {
    decision: text(formData, "decision") as "approved" | "rejected" | "replacement_requested",
    internalReason: text(formData, "internal_reason"), employeeMessage: text(formData, "employee_message"),
    expectedVersionUpdatedAt: expected_version_updated_at, requestId: text(formData, "request_id"),
  };
  const validation = validateReviewDecision(input);
  if (!validation.data) return { error: validation.error };
  const documentId = text(formData, "document_id"); const employeeId = text(formData, "employee_id");
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_employee_document", {
    p_document_id: documentId, p_version_id: text(formData, "version_id"), p_decision: input.decision,
    p_internal_reason: input.internalReason, p_employee_message: input.employeeMessage,
    p_expected_version_updated_at: expected_version_updated_at, p_request_id: input.requestId,
  });
  if (error) return documentActionError(error, "The document review could not be completed.");
  refreshDocument(documentId, employeeId);
  return { success: "Review completed." };
}

export async function restoreApprovedDocumentVersion(_state: DocumentActionState, formData: FormData): Promise<DocumentActionState> {
  await requireDocumentManager();
  const reason = text(formData, "reason"); if (!reason) return { error: "A restoration reason is required." };
  const documentId = text(formData, "document_id"); const supabase = await createClient();
  const { error } = await supabase.rpc("restore_document_version", {
    p_document_id: documentId, p_version_id: text(formData, "version_id"),
    p_expected_active_version_id: nullableText(formData, "expected_active_version_id"), p_reason: reason,
    p_request_id: text(formData, "request_id") || randomUUID(),
  });
  if (error) return documentActionError(error, "The approved version could not be restored.");
  refreshDocument(documentId, text(formData, "employee_id")); return { success: "Approved version restored." };
}

export async function archiveEmployeeDocument(_state: DocumentActionState, formData: FormData): Promise<DocumentActionState> {
  await requireDocumentManager(); const documentId = text(formData, "document_id"); const supabase = await createClient();
  const { error } = await supabase.rpc("archive_employee_document", { p_document_id: documentId, p_reason: text(formData, "reason"), p_request_id: text(formData, "request_id") || randomUUID() });
  if (error) return documentActionError(error, "The document could not be archived."); refreshDocument(documentId, text(formData, "employee_id")); return { success: "Document archived." };
}

export async function restoreEmployeeDocument(documentId: string, requestId = randomUUID()): Promise<DocumentActionState> {
  await requireDocumentManager(); const supabase = await createClient();
  const { error } = await supabase.rpc("restore_employee_document", { p_document_id: documentId, p_request_id: requestId });
  if (error) return documentActionError(error, "The document could not be restored."); refreshDocument(documentId); return { success: "Document restored." };
}

export async function permanentlyDeleteEmployeeDocument(_state: DocumentActionState, formData: FormData): Promise<DocumentActionState> {
  const { supabase } = await requireSuperAdmin();
  const documentId = text(formData, "document_id"); const classification = text(formData, "classification");
  const deletion_reason = text(formData, "deletion_reason");
  if (!deletion_reason) return { error: "A permanent deletion reason is required." };
  if (!["invalid", "duplicate", "mistaken_upload"].includes(classification)) return { error: "Choose a valid deletion classification." };
  const requestId = text(formData, "request_id") || randomUUID();
  const { data, error } = await supabase.rpc("permanently_delete_employee_document", {
    p_document_id: documentId, p_classification: classification, p_deletion_reason: deletion_reason, p_request_id: requestId,
  });
  if (error || !data) return documentActionError(error?.message ?? "DOCUMENT_NOT_FOUND", "The document could not be permanently deleted.");
  const result = data as { tombstone_id: string; storage_paths?: string[] };
  try {
    await removeDocumentObjects(result.storage_paths ?? []);
    const { error: completionError } = await supabase.rpc("complete_permanent_document_deletion", { p_tombstone_id: result.tombstone_id, p_request_id: randomUUID() });
    if (completionError) throw new Error(completionError.message);
  } catch {
    const correlationId = randomUUID();
    await supabase.rpc("fail_permanent_document_deletion", { p_tombstone_id: result.tombstone_id, p_error_code: "STORAGE_CLEANUP_FAILED", p_request_id: randomUUID() });
    return { error: "The record was restricted, but storage cleanup needs to be retried.", correlationId };
  }
  refreshDocument(documentId, text(formData, "employee_id")); return { success: "Document permanently deleted." };
}
