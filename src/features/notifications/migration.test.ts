import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../../../supabase/migrations/202607170005_notifications_reminders_escalations.sql", import.meta.url), "utf8");
const requiredColumns = [
  "module", "priority", "status", "resource_key", "employee_id", "safe_context",
  "action_url", "reminder_count", "escalation_level", "first_notified_at",
  "last_reminded_at", "next_reminder_at", "escalated_at", "resolved_at",
  "dismissed_at", "archived_at", "updated_at",
];
const requiredTables = ["notification_rules", "notification_events", "notification_cycle_runs"];

test("migration extends notifications and creates Phase 9 tables", () => {
  for (const column of requiredColumns) assert.match(sql, new RegExp(`add column if not exists ${column}`, "i"));
  for (const table of requiredTables) assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, "i"));
  for (const typeCode of [
    "attendance_exception", "leave_approval_pending", "overtime_approval_pending",
    "document_review_pending", "document_expiring", "document_expired",
  ]) assert.match(sql, new RegExp(`'${typeCode}'`, "i"));
  assert.match(sql, /retention_days[^;]*default 90/i);
  assert.equal((sql.toLowerCase().match(/^begin;/gm) ?? []).length, 1);
  assert.equal((sql.toLowerCase().match(/^commit;/gm) ?? []).length, 1);
});

test("migration defines protected workflows and daily cron", () => {
  for (const name of [
    "upsert_safe_notification", "list_notification_center", "get_unread_notification_count",
    "mark_notification_read", "mark_notification_unread", "dismiss_notification",
    "bulk_mark_notifications_read", "bulk_dismiss_notifications", "list_notification_rules",
    "update_notification_rule", "reset_notification_rules_to_defaults", "get_notification_cycle_status",
    "run_notification_cycle_now", "run_daily_notification_cycle", "process_attendance_notifications",
    "process_leave_notifications", "process_overtime_notifications", "process_document_notifications",
    "resolve_stale_notifications", "archive_resolved_notifications",
  ]) assert.match(sql, new RegExp(`create or replace function public\\.${name}\\s*\\(`, "i"));
  assert.match(sql, /hris-daily-notification-cycle/i);
  assert.match(sql, /'0 0 \* \* \*'/i);
  assert.match(sql, /run_daily_notification_cycle\('scheduled',\s*null\)/i);
});

test("notification rules constrain approved type codes and all required timings", () => {
  assert.match(sql, /notification_rules_type_code_check/i);
  for (const typeCode of [
    "attendance_exception", "leave_approval_pending", "overtime_approval_pending",
    "document_review_pending", "document_expiring", "document_expired",
  ]) assert.match(sql, new RegExp(`notification_rules_type_code_check[\\s\\S]*'${typeCode}'`, "i"));
  const updateRule = sql.match(/create or replace function public\.update_notification_rule[\s\S]*?\$\$;/i)?.[0] ?? "";
  assert.match(updateRule, /p_type_code\s*=\s*'document_expired'[\s\S]*p_escalation_after_days\s+is\s+null/i);
});

test("manual notification cycles persist request identifiers for idempotency", () => {
  assert.match(sql, /notification_cycle_runs[\s\S]*request_id uuid/i);
  assert.match(sql, /notification_cycle_runs_manual_request_unique/i);
  const manual = sql.match(/create or replace function public\.run_notification_cycle_now[\s\S]*?\$\$;/i)?.[0] ?? "";
  assert.match(manual, /p_request_id/i);
  assert.match(manual, /notification_cycle_runs/i);
  assert.match(manual, /run_daily_notification_cycle\('manual',\s*auth\.uid\(\),\s*p_request_id\)/i);
});
