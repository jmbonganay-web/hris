export function normalizeNotificationRows(rows: Array<Record<string, unknown>>): NotificationListItem[] {
  return rows.map((row) => ({
    id: String(row.id), type: String(row.type), title: String(row.title), body: String(row.body),
    module: String(row.module) as NotificationModule, priority: String(row.priority) as NotificationPriority,
    status: String(row.status) as NotificationStatus, actionUrl: row.action_url ? String(row.action_url) : null,
    reminderCount: Number(row.reminder_count), escalationLevel: Number(row.escalation_level), createdAt: String(row.created_at),
    lastRemindedAt: row.last_reminded_at ? String(row.last_reminded_at) : null, readAt: row.read_at ? String(row.read_at) : null,
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null, archivedAt: row.archived_at ? String(row.archived_at) : null,
  }));
}

import {
  notificationModuleValues,
  notificationPriorityValues,
  notificationRunStatusValues,
  type NotificationDashboardSummary,
  type NotificationListItem,
  type NotificationModule,
  type NotificationPriority,
  type NotificationRunStatus,
  type NotificationStatus,
} from "./types.ts";

function safeCount(value: unknown) {
  const count = Number(value ?? 0);
  return Number.isFinite(count) && count > 0 ? Math.trunc(count) : 0;
}

export function normalizeNotificationDashboardSummary(
  row: Record<string, unknown>,
): NotificationDashboardSummary {
  const rawItems = Array.isArray(row.items) ? row.items : [];
  const items = rawItems.slice(0, 10).map((value) => {
    const item = value as Record<string, unknown>;
    const moduleValue = String(item.module ?? "system");
    const priorityValue = String(item.priority ?? "normal");
    return {
      id: String(item.id),
      title: String(item.title),
      module: notificationModuleValues.includes(moduleValue as NotificationModule)
        ? (moduleValue as NotificationModule)
        : "system",
      priority: notificationPriorityValues.includes(
        priorityValue as NotificationPriority,
      )
        ? (priorityValue as NotificationPriority)
        : "normal",
      actionUrl: item.actionUrl ? String(item.actionUrl) : null,
    };
  });
  const runStatus = row.latestCycleStatus
    ? String(row.latestCycleStatus)
    : null;
  return {
    unreadCount: safeCount(row.unreadCount),
    urgentCount: safeCount(row.urgentCount),
    activeCount: safeCount(row.activeCount),
    resolvedCount: safeCount(row.resolvedCount),
    items,
    latestCycleStatus:
      runStatus &&
      notificationRunStatusValues.includes(runStatus as NotificationRunStatus)
        ? (runStatus as NotificationRunStatus)
        : null,
  };
}
