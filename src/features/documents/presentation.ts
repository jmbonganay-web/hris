import type { DocumentExpirationStatus, DocumentRequirementStatus, DocumentReviewStatus } from "./types.ts";
const statusLabels: Record<DocumentReviewStatus, string> = {
  draft: "Draft", pending_review: "Pending review", approved: "Approved", rejected: "Rejected", replacement_requested: "Replacement requested",
};
const expirationLabels: Record<DocumentExpirationStatus, string> = {
  valid: "Valid", expiring_soon: "Expiring soon", expired: "Expired", no_expiration: "No expiration",
};
const requirementLabels: Record<DocumentRequirementStatus, string> = {
  missing: "Missing", pending_review: "Pending review", replacement_requested: "Replacement requested", approved: "Approved", expiring_soon: "Expiring soon", expired: "Expired", not_required: "Not required",
};
export function documentStatusLabel(value: DocumentReviewStatus) { return statusLabels[value]; }
export function documentExpirationLabel(value: DocumentExpirationStatus) { return expirationLabels[value]; }
export function requirementStatusLabel(value: DocumentRequirementStatus) { return requirementLabels[value]; }
