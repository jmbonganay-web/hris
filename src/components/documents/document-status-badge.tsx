import type { DocumentExpirationStatus, DocumentRequirementStatus, DocumentReviewStatus } from "@/features/documents/types";

const badgeLabels: Record<string, string> = {
  draft: "Draft", pending_review: "Pending review", approved: "Approved", rejected: "Rejected",
  replacement_requested: "Replacement requested", missing: "Missing", expiring_soon: "Expiring soon",
  expired: "Expired", not_required: "Not required", valid: "Valid", no_expiration: "No expiration",
};

export function DocumentStatusBadge({ value }: { value: DocumentReviewStatus | DocumentRequirementStatus | DocumentExpirationStatus }) {
  const tone = value === "approved" || value === "valid" ? "success"
    : value === "pending_review" || value === "expiring_soon" || value === "replacement_requested" ? "warning"
      : value === "rejected" || value === "expired" || value === "missing" ? "danger" : "info";
  return <span className={`badge ${tone}`}>{badgeLabels[value] ?? value}</span>;
}
