import type { NotificationCycleSummary, NotificationRunStatus } from "../types.ts";
export function normalizeNotificationCycleRows(rows: Array<Record<string, unknown>>): NotificationCycleSummary[] {
  return rows.map((row) => ({
    id: String(row.id), runDate: String(row.run_date), runSource: String(row.run_source) as "scheduled"|"manual",
    status: String(row.status) as NotificationRunStatus, startedAt: String(row.started_at), completedAt: row.completed_at ? String(row.completed_at) : null,
    createdCount: Number(row.created_count), remindedCount: Number(row.reminded_count), escalatedCount: Number(row.escalated_count),
    resolvedCount: Number(row.resolved_count), archivedCount: Number(row.archived_count), errorCode: row.error_code ? String(row.error_code) : null,
    safeErrorMessage: row.safe_error_message ? String(row.safe_error_message) : null,
    ruleResults: (row.rule_results && typeof row.rule_results === "object" ? row.rule_results : {}) as NotificationCycleSummary["ruleResults"],
  }));
}
