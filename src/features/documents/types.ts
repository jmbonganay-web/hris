import type { AppRole } from "@/features/employees/types";

export const documentVisibilityValues = ["employee_hr", "hr_only", "super_admin_only"] as const;
export type DocumentVisibility = (typeof documentVisibilityValues)[number];
export const documentCardinalityValues = ["single", "multiple"] as const;
export type DocumentCardinality = (typeof documentCardinalityValues)[number];
export const documentExpirationModes = ["required", "optional", "disabled"] as const;
export type DocumentExpirationMode = (typeof documentExpirationModes)[number];
export const documentReviewStatuses = ["draft", "pending_review", "approved", "rejected", "replacement_requested"] as const;
export type DocumentReviewStatus = (typeof documentReviewStatuses)[number];
export const documentSources = ["employee", "hr"] as const;
export type DocumentSource = (typeof documentSources)[number];
export const documentPermissionCodes = ["documents.review", "documents.manage"] as const;
export type DocumentPermissionCode = (typeof documentPermissionCodes)[number];
export const documentRequirementTargetTypes = ["all_active_employees", "department", "job_title", "employment_type", "employee"] as const;
export type DocumentRequirementTargetType = (typeof documentRequirementTargetTypes)[number];
export const documentRequirementStatuses = ["missing", "pending_review", "replacement_requested", "approved", "expiring_soon", "expired", "not_required"] as const;
export type DocumentRequirementStatus = (typeof documentRequirementStatuses)[number];
export const documentExpirationStatuses = ["valid", "expiring_soon", "expired", "no_expiration"] as const;
export type DocumentExpirationStatus = (typeof documentExpirationStatuses)[number];
export const documentCustomFieldTypes = ["text", "long_text", "number", "date", "boolean", "select"] as const;
export type DocumentCustomFieldType = (typeof documentCustomFieldTypes)[number];

export type DocumentActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
  correlationId?: string;
};
export type DocumentCustomFieldDefinition = {
  fieldKey: string;
  label: string;
  fieldType: DocumentCustomFieldType;
  isRequired: boolean;
  selectOptions: string[];
  employeeVisible: boolean;
  displayOrder: number;
};
export type DocumentCategoryInput = {
  categoryId: string | null;
  code: string;
  name: string;
  description: string;
  defaultVisibility: DocumentVisibility;
  employeeUploadEnabled: boolean;
  cardinality: DocumentCardinality;
  allowedMimeTypes: string[];
  expirationMode: DocumentExpirationMode;
  defaultValidityMonths: number | null;
  expiringSoonDays: number;
  retentionMonthsAfterSeparation: number | null;
  changeReason: string;
  fields: DocumentCustomFieldDefinition[];
};
export type DocumentUploadManifest = { clientFileKey: string; name: string; type: string; size: number };
export type DocumentCoreMetadata = {
  title: string;
  referenceNumber: string;
  issueDate: string;
  expirationDate: string;
  issuingOrganization: string;
  notes: string;
  tags: string[];
  customMetadata: Record<string, unknown>;
};
export type DocumentPermissionContext = {
  userId: string;
  role: AppRole;
  employeeId: string | null;
  permissions: DocumentPermissionCode[];
};
