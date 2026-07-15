import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL(
    "../../../supabase/migrations/202607150002_overtime_holidays.sql",
    import.meta.url,
  ),
  "utf8",
);

function functionBody(name: string) {
  return migration.match(
    new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\$\\$;`, "i"),
  )?.[0] ?? "";
}

test("policy and holiday mutations are protected security-definer functions", () => {
  for (const name of [
    "create_overtime_policy_version",
    "create_holiday",
    "replace_holiday_version",
  ]) {
    const body = functionBody(name);
    assert.match(body, /security definer/i);
    assert.match(body, /set search_path = pg_catalog, public/i);
    assert.match(body, /public\.is_hr_admin\(\)/i);
  }
});

test("policy resolver defaults to 30 minutes and is internal", () => {
  assert.match(migration, /create or replace function public\.resolve_overtime_policy/i);
  assert.match(migration, /null::uuid, 30::integer/i);
  assert.match(migration, /revoke all on function public\.resolve_overtime_policy/i);
});

test("holiday replacement locks and verifies the expected active version", () => {
  const body = functionBody("replace_holiday_version");
  assert.match(body, /lock table public\.holiday_calendar_groups/i);
  assert.match(body, /for update/i);
  assert.match(body, /HOLIDAY_VERSION_STALE/i);
  assert.match(body, /revision_number \+ 1/i);
});

test("holiday functions prevent duplicate active dates", () => {
  assert.match(functionBody("create_holiday"), /HOLIDAY_DATE_EXISTS/i);
  assert.match(functionBody("replace_holiday_version"), /HOLIDAY_DATE_EXISTS/i);
  assert.match(migration, /active_version_id = version\.id/i);
});

test("protected reasons never enter audit JSON", () => {
  for (const privateName of ["p_change_reason", "v_reason"]) {
    assert.doesNotMatch(
      migration,
      new RegExp(`write_employee_audit\\([^;]+${privateName}`, "i"),
    );
  }
});

test("detection helpers are security definer with fixed search paths and revoked", () => {
  for (const name of [
    "write_overtime_detection_revision",
    "calculate_overtime_for_attendance_day",
  ]) {
    const body = functionBody(name);
    assert.match(body, /security definer/i);
    assert.match(body, /set search_path = pg_catalog, public/i);
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}`, "i"));
  }
});

test("detection audit payload excludes recalculation reasons and protected review text", () => {
  const body = functionBody("write_overtime_detection_revision");
  assert.doesNotMatch(body, /write_employee_audit\([^;]+p_recalculation_reason/i);
  assert.doesNotMatch(body, /approval_note|rejection_reason/i);
});

test("safe employee overtime RPC is executable by authenticated users only", () => {
  assert.match(migration, /revoke all on function public\.get_my_overtime_items\(date, date\)\s+from public, anon/i);
  assert.match(migration, /grant execute on function public\.get_my_overtime_items\(date, date\)\s+to authenticated/i);
});


test("overtime and holiday tables have no authenticated direct mutation policies", () => {
  for (const table of [
    "overtime_policy_versions",
    "holiday_calendar_groups",
    "holiday_calendar_versions",
    "overtime_detection_groups",
    "overtime_detection_revisions",
    "overtime_approval_items",
  ]) {
    const tablePolicies = (migration.match(/create policy[\s\S]*?;/gi) ?? [])
      .filter((policy) => new RegExp(`on public\\.${table}\\b`, "i").test(policy));
    for (const policy of tablePolicies) {
      assert.doesNotMatch(policy, /for insert|for update|for delete/i);
    }
  }
});

test("every Phase 5B-2B security-definer function fixes search_path", () => {
  const functions = migration.match(
    /create or replace function public\.[\s\S]*?\$\$;/gi,
  ) ?? [];
  for (const fn of functions) {
    if (/security definer/i.test(fn)) {
      assert.match(fn, /set search_path = pg_catalog, public/i);
    }
  }
});

test("internal calculation helpers are revoked from all client roles", () => {
  for (const name of [
    "resolve_overtime_policy",
    "resolve_active_holiday",
    "write_overtime_detection_revision",
    "calculate_overtime_for_attendance_day",
    "validate_active_overtime_detection_revision",
  ]) {
    assert.match(
      migration,
      new RegExp(`revoke all on function public\\.${name}[\\s\\S]*?from public, anon, authenticated`, "i"),
    );
  }
});

test("audit JSON omits every protected overtime and holiday text field", () => {
  const auditCalls = migration.match(/perform public\.write_employee_audit\([\s\S]*?\);/gi) ?? [];
  const auditText = auditCalls.join("\n");
  for (const protectedName of [
    "p_change_reason",
    "p_recalculation_reason",
    "p_review_text",
    "approval_note",
    "rejection_reason",
  ]) {
    assert.doesNotMatch(auditText, new RegExp(protectedName, "i"));
  }
});


test("client roles have table mutation privileges explicitly revoked", () => {
  for (const table of [
    "overtime_policy_versions",
    "holiday_calendar_groups",
    "holiday_calendar_versions",
    "overtime_detection_groups",
    "overtime_detection_revisions",
    "overtime_approval_items",
  ]) {
    assert.match(
      migration,
      new RegExp(`revoke[\\s\\S]*?(insert|update|delete)[\\s\\S]*?public\\.${table}[\\s\\S]*?from anon, authenticated`, "i"),
    );
  }
});
