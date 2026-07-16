import type { AppRole } from "@/features/employees/types";
import { DOCUMENT_ALLOWED_MIME_TYPES, DOCUMENT_MAX_FILE_BYTES, DOCUMENT_MAX_FILE_COUNT } from "./constants.ts";
import type { DocumentCardinality, DocumentCategoryInput, DocumentCoreMetadata, DocumentCustomFieldDefinition, DocumentPermissionCode, DocumentRequirementTargetType, DocumentUploadManifest, DocumentVisibility } from "./types.ts";

type ValidationResult<T> = { data?: T; error?: string; fieldErrors?: Record<string, string> };
const visibilityRank: Record<DocumentVisibility, number> = { employee_hr: 0, hr_only: 1, super_admin_only: 2 };
export function validateVisibilityOverride(categoryDefault: DocumentVisibility, override: DocumentVisibility | null, role: AppRole): ValidationResult<DocumentVisibility> {
  const effective = override ?? categoryDefault;
  if (visibilityRank[effective] < visibilityRank[categoryDefault]) return { error: "A visibility override cannot make a document less restrictive." };
  if (effective === "super_admin_only" && role !== "super_admin") return { error: "Only a Super Admin can use Super Admin-only visibility." };
  return { data: effective };
}
export function validateUploadBatch(files: DocumentUploadManifest[], config: { cardinality: DocumentCardinality; allowedMimeTypes: string[] }): ValidationResult<DocumentUploadManifest[]> {
  if (files.length < 1) return { error: "Select at least one file." };
  if (files.length > DOCUMENT_MAX_FILE_COUNT) return { error: "Upload no more than 10 files at a time." };
  if (config.cardinality === "single" && files.length !== 1) return { error: "This category accepts one file per upload." };
  const extensionForMime: Record<string, string[]> = { "application/pdf": ["pdf"], "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"], "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"] };
  for (const file of files) {
    if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > DOCUMENT_MAX_FILE_BYTES) return { error: "Each file must be 15 MB or smaller." };
    if (!DOCUMENT_ALLOWED_MIME_TYPES.includes(file.type as (typeof DOCUMENT_ALLOWED_MIME_TYPES)[number]) || !config.allowedMimeTypes.includes(file.type)) return { error: "This file type is not allowed for the selected category." };
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!extensionForMime[file.type]?.includes(extension)) return { error: "The file extension does not match its file type." };
    if (!file.clientFileKey.trim() || !file.name.trim()) return { error: "Every file requires a stable client key and filename." };
  }
  if (new Set(files.map((file) => file.clientFileKey)).size !== files.length) return { error: "Every file in the upload must have a unique client key." };
  return { data: files };
}
export function validateCategoryInput(input: DocumentCategoryInput, role: AppRole): ValidationResult<DocumentCategoryInput> {
  if (!/^[a-z][a-z0-9_]{2,63}$/.test(input.code)) return { error: "Category codes use lowercase letters, numbers, and underscores." };
  if (!input.name.trim()) return { error: "A category name is required." };
  if (input.defaultVisibility === "super_admin_only" && role !== "super_admin") return { error: "Only a Super Admin can create Super Admin-only categories." };
  if (input.allowedMimeTypes.length < 1 || input.allowedMimeTypes.some((mime) => !DOCUMENT_ALLOWED_MIME_TYPES.includes(mime as (typeof DOCUMENT_ALLOWED_MIME_TYPES)[number]))) return { error: "Choose at least one supported file type." };
  if (input.expirationMode === "disabled" && input.defaultValidityMonths !== null) return { error: "Disabled expiration cannot define a validity period." };
  if (input.defaultValidityMonths !== null && (!Number.isInteger(input.defaultValidityMonths) || input.defaultValidityMonths < 1)) return { error: "Validity months must be a positive whole number." };
  for (const field of input.fields) {
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(field.fieldKey)) return { error: "Custom field keys use lowercase letters, numbers, and underscores." };
    if (field.fieldType === "select" && field.selectOptions.length < 1) return { error: "Select fields require at least one option." };
    if (field.fieldType !== "select" && field.selectOptions.length > 0) return { error: "Only select fields may define options." };
  }
  if (new Set(input.fields.map((field) => field.fieldKey)).size !== input.fields.length) return { error: "Custom field keys must be unique." };
  return { data: { ...input, name: input.name.trim(), description: input.description.trim(), changeReason: input.changeReason.trim() } };
}
export function validateDocumentMetadata(input: DocumentCoreMetadata, config: { expirationMode: "required" | "optional" | "disabled"; defaultValidityMonths: number | null; customFields: DocumentCustomFieldDefinition[] }): ValidationResult<DocumentCoreMetadata & { expirationDate: string }> {
  if (!input.title.trim()) return { error: "A document title is required." };
  let expirationDate = input.expirationDate;
  if (config.expirationMode === "disabled" && expirationDate) return { error: "This category does not use expiration dates." };
  if (!expirationDate && config.expirationMode === "required" && config.defaultValidityMonths && input.issueDate) {
    const calculated = new Date(`${input.issueDate}T00:00:00.000Z`);
    calculated.setUTCMonth(calculated.getUTCMonth() + config.defaultValidityMonths);
    expirationDate = calculated.toISOString().slice(0, 10);
  }
  if (config.expirationMode === "required" && !expirationDate) return { error: "This document requires an expiration date." };
  if (input.issueDate && expirationDate && input.issueDate > expirationDate) return { error: "The issue date cannot be after the expiration date." };
  for (const field of config.customFields) {
    const value = input.customMetadata[field.fieldKey];
    if (field.isRequired && (value === undefined || value === null || value === "")) return { error: `${field.label} is required.` };
    if (field.fieldType === "select" && value !== undefined && !field.selectOptions.includes(String(value))) return { error: `${field.label} has an invalid option.` };
  }
  return { data: { ...input, title: input.title.trim(), expirationDate } };
}
export function validateReviewDecision(input: { decision: "approved" | "rejected" | "replacement_requested"; internalReason: string; employeeMessage: string; expectedVersionUpdatedAt: string; requestId: string }): ValidationResult<typeof input> {
  if (!input.requestId || !input.expectedVersionUpdatedAt) return { error: "The review request is stale." };
  if ((input.decision === "rejected" || input.decision === "replacement_requested") && !input.internalReason.trim()) return { error: "An internal review reason is required." };
  if (input.decision === "replacement_requested" && !input.employeeMessage.trim()) return { error: "Employee replacement instructions are required." };
  return { data: { ...input, internalReason: input.internalReason.trim(), employeeMessage: input.employeeMessage.trim() } };
}
export function validateRequirementInput(input: { categoryId: string; cardinality: DocumentCardinality; requiredCount: number; expiredSatisfies: boolean; effectiveFrom: string; effectiveTo: string | null; targetType: DocumentRequirementTargetType; targetId: string | null }): ValidationResult<typeof input> {
  if (!Number.isInteger(input.requiredCount) || input.requiredCount < 1) return { error: "Required document count must be a positive whole number." };
  if (input.cardinality === "single" && input.requiredCount !== 1) return { error: "Single-document categories require exactly one approved document." };
  if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) return { error: "The requirement end date cannot be before its start date." };
  if (input.targetType === "all_active_employees" && input.targetId !== null) return { error: "All-active-employee requirements cannot specify a target ID." };
  if (input.targetType !== "all_active_employees" && !input.targetId) return { error: "The selected target requires a target ID." };
  return { data: input };
}
export function validatePermissionGrant(input: { userId: string; userRole: AppRole; permissionCode: DocumentPermissionCode }): ValidationResult<{ userId: string; permissionCode: DocumentPermissionCode }> {
  if (input.userRole !== "hr_admin") return { error: "Only HR Admin users can receive document permissions." };
  return { data: { userId: input.userId, permissionCode: input.permissionCode } };
}
