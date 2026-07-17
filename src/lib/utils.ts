export function initials(name: string) {
  return name.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

export function badgeClass(status: string) {
  const normalized = status.toLowerCase().replaceAll("_", " ");
  if (["active", "approved", "present", "valid", "resolved", "succeeded"].includes(normalized)) return "success";
  if (["pending", "pending review", "late", "on leave", "probation", "expiring soon", "replacement requested", "high", "partial failed"].includes(normalized)) return "warning";
  if (["rejected", "inactive", "absent", "terminated", "expired", "missing", "urgent", "failed"].includes(normalized)) return "danger";
  return "info";
}
