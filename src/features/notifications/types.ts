export const notificationModuleValues = [
  "attendance",
  "leave",
  "overtime",
  "documents",
  "payroll",
  "system",
] as const;
export type NotificationModule = (typeof notificationModuleValues)[number];

export const notificationPriorityValues = ["info", "normal", "high", "urgent"] as const;
export type NotificationPriority = (typeof notificationPriorityValues)[number];

export const notificationStatusValues = [
  "unread",
  "read",
  "dismissed",
  "resolved",
  "archived",
] as const;
export type NotificationStatus = (typeof notificationStatusValues)[number];

export const notificationRuleTypeValues = [
  "attendance_exception",
  "leave_approval_pending",
  "overtime_approval_pending",
  "document_review_pending",
  "document_expiring",
  "document_expired",
  "compensation_approval_pending",
  "schedule_assignment_approval_pending",
  "payroll_period_ready",
  "payroll_period_review_pending",
  "payroll_period_approval_pending",
  "payroll_period_reopened",
] as const;
export type NotificationRuleType = (typeof notificationRuleTypeValues)[number];

export const notificationEventTypeValues = [
  "created",
  "reminded",
  "read",
  "marked_unread",
  "dismissed",
  "escalated",
  "resolved",
  "archived",
  "rule_changed",
  "rule_reset",
] as const;
export type NotificationEventType = (typeof notificationEventTypeValues)[number];

export const notificationRunStatusValues = [
  "running",
  "succeeded",
  "partial_failed",
  "failed",
] as const;
export type NotificationRunStatus = (typeof notificationRunStatusValues)[number];

export type NotificationActionState = {
  error?: string;
  success?: string;
  correlationId?: string;
};

export type NotificationCenterFilters = {
  module?: NotificationModule;
  status?: NotificationStatus | "active";
  priority?: NotificationPriority;
  page: number;
  query?: string;
  from?: string;
  to?: string;
};

export type NotificationListItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  module: NotificationModule;
  priority: NotificationPriority;
  status: NotificationStatus;
  actionUrl: string | null;
  reminderCount: number;
  escalationLevel: number;
  createdAt: string;
  lastRemindedAt: string | null;
  readAt: string | null;
  resolvedAt: string | null;
  archivedAt: string | null;
};

export type NotificationRule = {
  id: string;
  typeCode: NotificationRuleType;
  module: NotificationModule;
  enabled: boolean;
  initialDelayDays: number | null;
  repeatIntervalDays: number;
  escalationAfterDays: number | null;
  leadTimeDays: number | null;
  retentionDays: number;
  version: number;
  updatedAt: string;
  updatedByName: string | null;
};

export type NotificationRuleInput = {
  typeCode: NotificationRuleType;
  enabled: boolean;
  initialDelayDays: number | null;
  repeatIntervalDays: number;
  escalationAfterDays: number | null;
  leadTimeDays: number | null;
  retentionDays: number;
  expectedVersion: number;
  requestId: string;
};

export type NotificationCycleSummary = {
  id: string;
  runDate: string;
  runSource: "scheduled" | "manual";
  status: NotificationRunStatus;
  startedAt: string;
  completedAt: string | null;
  createdCount: number;
  remindedCount: number;
  escalatedCount: number;
  resolvedCount: number;
  archivedCount: number;
  errorCode: string | null;
  safeErrorMessage: string | null;
  ruleResults: Record<string, { status: string; created: number; reminded: number; escalated: number; resolved: number; errorCode?: string }>;
};

export type NotificationDashboardSummaryItem = {
  id: string;
  title: string;
  module: NotificationModule;
  priority: NotificationPriority;
  actionUrl: string | null;
};

export type NotificationDashboardSummary = {
  unreadCount: number;
  urgentCount: number;
  activeCount: number;
  resolvedCount: number;
  items: NotificationDashboardSummaryItem[];
  latestCycleStatus: NotificationRunStatus | null;
};
