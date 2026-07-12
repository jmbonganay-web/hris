export function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

export function badgeClass(status: string) {
  if (["Active", "Approved", "Present"].includes(status)) return "success";
  if (["Pending", "Late", "On Leave"].includes(status)) return "warning";
  if (["Rejected", "Inactive", "Absent"].includes(status)) return "danger";
  return "info";
}
