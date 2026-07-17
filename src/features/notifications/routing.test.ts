import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const notificationSql = await readFile(
  new URL("../../../supabase/migrations/202607170005_notifications_reminders_escalations.sql", import.meta.url),
  "utf8",
);
const payrollSql = await readFile(
  new URL("../../../supabase/migrations/202607180002_payroll_foundation.sql", import.meta.url),
  "utf8",
);
const sql = `${notificationSql}\n${payrollSql}`;

function functionSql(name: string) {
  return sql.match(
    new RegExp(`create or replace function public\\.${name}\\s*\\([\\s\\S]*?\\$\\$;`, "gi"),
  )?.at(-1) ?? "";
}

test("attendance routing follows employee manager HR and Super Admin stages", () => {
  const definition = functionSql("process_attendance_notifications");
  assert.match(definition, /profile_id/i);
  assert.match(definition, /manager_id/i);
  assert.match(definition, /role\s*=\s*'hr_admin'/i);
  assert.match(definition, /role\s*=\s*'super_admin'/i);
  for (const stage of ["0", "1", "2", "3"]) {
    assert.match(definition, new RegExp(`[,\\s]${stage}[,\\s]`));
  }
});

test("leave and overtime escalation routes remain role-scoped", () => {
  for (const name of ["process_leave_notifications", "process_overtime_notifications"]) {
    const definition = functionSql(name);
    assert.match(definition, /manager_id/i);
    assert.match(definition, /role\s*=\s*'hr_admin'/i);
    assert.match(definition, /role\s*=\s*'super_admin'/i);
  }
});

test("manager document escalation uses status-only context", () => {
  const definition = functionSql("process_document_notifications");
  assert.match(definition, /manager_id/i);
  assert.match(definition, /compliance_status/i);
  for (const forbidden of [
    "original_filename",
    "safe_filename",
    "storage_path",
    "internal_reason",
    "reference_number",
    "custom_metadata",
  ]) {
    assert.doesNotMatch(definition, new RegExp(forbidden, "i"));
  }
});

test("notification action URLs are server allowlisted", () => {
  const definition = functionSql("validate_notification_action_url");
  for (const route of [
    "/attendance",
    "/admin/attendance",
    "/leave",
    "/admin/leave",
    "/overtime",
    "/admin/overtime",
    "/documents",
    "/admin/documents/review",
    "/notifications",
    "/admin/notifications/settings",
    "/payroll",
    "/payroll/approvals",
    "/payroll/periods",
    "/me/compensation",
  ]) {
    assert.match(definition, new RegExp(route.replaceAll("/", "\\/")));
  }
  assert.match(definition, /starts_with\(p_url,\s*'\/\/'\)/i);
  assert.match(definition, /NOTIFICATION_INVALID_ACTION_URL/i);
});

test("document review reminders exclude the submitting employee from reviewers", () => {
  const definition = functionSql("process_document_notifications");
  assert.match(definition, /employee_profile_id/i);
  assert.match(definition, /p\.id\s*<>\s*r\.employee_profile_id/i);
});

test("processor monitoring counts use actual upsert outcomes", () => {
  for (const name of [
    "process_attendance_notifications",
    "process_leave_notifications",
    "process_overtime_notifications",
    "process_document_notifications",
  ]) {
    const definition = functionSql(name);
    assert.match(definition, /v_result\s*:=\s*public\.upsert_safe_notification/i);
    assert.match(definition, /v_result\s*->>\s*'created'/i);
    assert.match(definition, /v_result\s*->>\s*'reminded'/i);
    assert.match(definition, /v_result\s*->>\s*'escalated'/i);
  }
});

test("immediate approval alerts fall back from manager to HR before Super Admin", () => {
  for (const name of [
    "notify_attendance_correction_change",
    "notify_leave_request_action",
    "notify_overtime_approval_change",
  ]) {
    const definition = functionSql(name);
    assert.match(definition, /role\s*=\s*'hr_admin'/i);
    assert.match(definition, /role\s*=\s*'super_admin'/i);
    assert.match(definition, /v_hr_count/i);
  }
});

test("stale document compliance notifications resolve after renewal or archival", () => {
  const definition = functionSql("resolve_stale_notifications");
  assert.match(definition, /document_expiring/i);
  assert.match(definition, /document_expired/i);
  assert.match(definition, /active_version_id/i);
  assert.match(definition, /lead_time_days/i);
});

test("document submission helper suppresses self-review notifications", () => {
  const definition = functionSql("create_document_notification");
  assert.match(definition, /document_submission_received/i);
  assert.match(definition, /employee_profile_id/i);
  assert.match(definition, /p_recipient_user_id\s*=\s*v_employee_profile_id/i);
});

test("approval processors do not route escalations back to the source employee", () => {
  for (const name of [
    "process_attendance_notifications",
    "process_leave_notifications",
    "process_overtime_notifications",
  ]) {
    const definition = functionSql(name);
    assert.match(definition, /employee_profile_id/i);
    assert.match(definition, /id\s*<>\s*r\.employee_profile_id/i);
  }
});


test("payroll notifications use server-selected allowlisted routes", () => {
  const definition = functionSql("validate_notification_action_url");
  assert.match(definition, /\/payroll/i);
  assert.match(definition, /\/me\/compensation/i);
  assert.doesNotMatch(definition, /https?:\/\//i);
});
