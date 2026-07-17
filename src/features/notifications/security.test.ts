import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const notificationSql = await readFile(new URL("../../../supabase/migrations/202607170005_notifications_reminders_escalations.sql", import.meta.url), "utf8");
const payrollSql = await readFile(new URL("../../../supabase/migrations/202607180002_payroll_foundation.sql", import.meta.url), "utf8");
const sql = `${notificationSql}\n${payrollSql}`;

test("notification tables use RLS and recipient-only reads", () => {
  for (const table of ["notifications", "notification_rules", "notification_events", "notification_cycle_runs"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(sql, /recipient_user_id\s*=\s*auth\.uid\(\)/i);
  assert.match(sql, /revoke all on public\.notifications from authenticated/i);
  assert.doesNotMatch(sql, /manager[^;]*create policy[^;]*notifications/i);
});

test("payload, URL, and immutable-event guards are present", () => {
  assert.match(sql, /assert_safe_notification_payload/i);
  for (const token of ["signed_url", "storage_path", "service_role", "access_token", "raw_file", "filename", "internal_reason", "private_note", "bank", "government_id", "custom_metadata"]) {
    assert.match(sql, new RegExp(token, "i"));
  }
  assert.match(sql, /validate_notification_action_url/i);
  assert.match(sql, /:\/\//);
  assert.match(sql, /protocol-relative|starts_with\([^;]*'\/\/'/i);
  assert.match(sql, /prevent_notification_event_mutation/i);
  assert.match(sql, /before update or delete on public\.notification_events/i);
});

test("payload guard inspects JSON keys without rejecting safe text values", () => {
  const definition = sql.match(
    /create or replace function public\.assert_safe_notification_payload[\s\S]*?\$\$;/i,
  )?.[0] ?? "";
  assert.match(definition, /jsonb_each/i);
  assert.match(definition, /jsonb_array_elements/i);
  assert.doesNotMatch(definition, /lower\(coalesce\(p_payload[^;]+::text\)/i);
});


test("payroll payload guards reject compensation values and private reasons", () => {
  const definition = sql.match(
    /create or replace function public\.assert_safe_notification_payload[\s\S]*?\$\$;/gi,
  )?.at(-1) ?? "";
  for (const token of [
    "monthly_salary",
    "hourly_rate",
    "amount",
    "change_reason",
    "override_reason",
    "rejection_reason",
  ]) {
    assert.match(definition, new RegExp(token, "i"));
  }
});
