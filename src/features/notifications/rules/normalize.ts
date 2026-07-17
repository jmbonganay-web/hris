import type { NotificationRule, NotificationModule, NotificationRuleType } from "../types.ts";
export function normalizeNotificationRuleRows(rows: Array<Record<string, unknown>>): NotificationRule[] {
  return rows.map((row) => ({
    id: String(row.id), typeCode: String(row.type_code) as NotificationRuleType,
    module: String(row.module) as NotificationModule, enabled: Boolean(row.enabled),
    initialDelayDays: row.initial_delay_days == null ? null : Number(row.initial_delay_days),
    repeatIntervalDays: Number(row.repeat_interval_days),
    escalationAfterDays: row.escalation_after_days == null ? null : Number(row.escalation_after_days),
    leadTimeDays: row.lead_time_days == null ? null : Number(row.lead_time_days),
    retentionDays: Number(row.retention_days), version: Number(row.version), updatedAt: String(row.updated_at),
    updatedByName: row.updated_by_name ? String(row.updated_by_name) : null,
  }));
}
