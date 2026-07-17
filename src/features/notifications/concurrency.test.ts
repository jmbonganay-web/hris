import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL("../../../supabase/migrations/202607170005_notifications_reminders_escalations.sql", import.meta.url),
  "utf8",
);

function functionSql(name: string) {
  return sql.match(
    new RegExp(`create or replace function public\\.${name}\\s*\\([\\s\\S]*?\\$\\$;`, "i"),
  )?.[0] ?? "";
}

test("notification upsert uses a recipient-stage key and locks existing rows", () => {
  const definition = functionSql("upsert_safe_notification");
  assert.match(definition, /build_notification_source_event_key/i);
  assert.match(definition, /p_recipient_user_id/i);
  assert.match(definition, /p_escalation_level/i);
  assert.match(definition, /for update/i);
  assert.match(definition, /source_event_key\s*=\s*v_key/i);
  assert.match(definition, /on conflict \(recipient_user_id,\s*source_event_key\) do nothing/i);
});

test("daily cycle prevents overlap and isolates processor failures", () => {
  const definition = functionSql("run_daily_notification_cycle");
  assert.match(definition, /pg_try_advisory_xact_lock/i);
  assert.match(definition, /NOTIFICATION_CYCLE_ALREADY_RUNNING/i);
  assert.match(definition, /exception when others/i);
  assert.match(definition, /partial_failed/i);
  assert.match(definition, /rule_results/i);
});

test("recipient bulk workflows are owner-bound and row locking", () => {
  for (const name of ["bulk_mark_notifications_read", "bulk_dismiss_notifications"]) {
    const definition = functionSql(name);
    assert.match(definition, /recipient_user_id\s*=\s*auth\.uid\(\)/i);
    assert.match(definition, /for update/i);
    assert.match(definition, /NOTIFICATION_BULK_SELECTION_INVALID/i);
  }
});

test("resolved retention archives notification history without deletion", () => {
  const definition = functionSql("archive_resolved_notifications");
  assert.match(definition, /status\s*=\s*'resolved'/i);
  assert.match(definition, /coalesce\(rule\.retention_days,\s*90\)/i);
  assert.match(definition, /status\s*=\s*'archived'/i);
  assert.match(definition, /write_notification_event[^;]*'archived'/i);
  assert.doesNotMatch(definition, /delete\s+from\s+public\.notifications/i);
});

test("due reminders reopen read or dismissed notifications as unread", () => {
  const definition = functionSql("upsert_safe_notification");
  assert.match(definition, /status\s*=\s*case[\s\S]*then\s+'unread'/i);
  assert.match(definition, /read_at\s*=\s*case[\s\S]*then\s+null/i);
  assert.match(definition, /dismissed_at\s*=\s*case[\s\S]*then\s+null/i);
  assert.doesNotMatch(definition, /v_row\.status\s*=\s*'dismissed'[\s\S]*return/i);
});

test("cycle failures remain recorded instead of being rolled back by a rethrow", () => {
  const definition = functionSql("run_daily_notification_cycle");
  assert.match(definition, /insert into public\.notification_cycle_runs/i);
  assert.match(definition, /safe_error_message\s*=\s*'The notification cycle could not be completed\.'/i);
  assert.match(definition, /return\s+v_run/i);
  assert.doesNotMatch(definition, /safe_error_message\s*=\s*'The notification cycle could not be completed\.'[\s\S]*raise exception 'NOTIFICATION_CYCLE_FAILED'/i);
});

test("immediate resolution writes immutable notification events", () => {
  assert.match(sql, /create or replace function public\.resolve_notifications_for_resource/i);
  for (const name of [
    "notify_attendance_correction_change",
    "notify_leave_request_action",
    "notify_overtime_approval_change",
    "notify_document_review_insert",
  ]) {
    assert.match(functionSql(name), /resolve_notifications_for_resource/i);
  }
});
