import type {
  NotificationModule,
  NotificationPriority,
  NotificationRuleType,
  NotificationRunStatus,
  NotificationStatus,
} from "./types.ts";

const moduleLabels: Record<NotificationModule, string> = {
  attendance: "Attendance",
  leave: "Leave",
  overtime: "Overtime",
  documents: "Documents",
  system: "System",
};
const priorityLabels: Record<NotificationPriority, string> = {
  info: "Info",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};
const statusLabels: Record<NotificationStatus, string> = {
  unread: "Unread",
  read: "Read",
  dismissed: "Dismissed",
  resolved: "Resolved",
  archived: "Archived",
};
const ruleLabels: Record<NotificationRuleType, string> = {
  attendance_exception: "Attendance exception",
  leave_approval_pending: "Pending leave approval",
  overtime_approval_pending: "Pending overtime approval",
  document_review_pending: "Pending document review",
  document_expiring: "Expiring document",
  document_expired: "Expired document",
};
const runStatusLabels: Record<NotificationRunStatus, string> = {
  running: "Running",
  succeeded: "Succeeded",
  partial_failed: "Partially failed",
  failed: "Failed",
};

export function notificationModuleLabel(value: NotificationModule) { return moduleLabels[value]; }
export function notificationPriorityLabel(value: NotificationPriority) { return priorityLabels[value]; }
export function notificationStatusLabel(value: NotificationStatus) { return statusLabels[value]; }
export function notificationRuleTypeLabel(value: NotificationRuleType) { return ruleLabels[value]; }
export function notificationRunStatusLabel(value: NotificationRunStatus) { return runStatusLabels[value]; }
export function unreadCountLabel(count: number) {
  const safe = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  return {
    visual: safe === 0 ? "" : safe > 99 ? "99+" : String(safe),
    accessible: safe === 0 ? "No unread notifications" : `${safe} unread notification${safe === 1 ? "" : "s"}`,
  };
}
