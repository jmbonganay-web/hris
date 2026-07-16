import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL("../../../../supabase/migrations/202607160001_leave_management.sql", import.meta.url),
  "utf8",
);

const settingsActions = await readFile(
  new URL("../../../app/(dashboard)/settings/leave-types/actions.ts", import.meta.url),
  "utf8",
);

test("policy migration exposes exactly the approved public policy workflows", () => {
  for (const name of [
    "create_leave_type",
    "create_leave_type_version",
    "archive_leave_type",
    "resolve_leave_type_version",
  ]) assert.match(sql, new RegExp(`create or replace function public\\.${name}`, "i"));
});

test("leave codes normalize to uppercase hyphenated values", () => {
  assert.match(sql, /create or replace function public\.normalize_leave_code/i);
  assert.match(sql, /regexp_replace\(upper/i);
  assert.match(sql, /'\[\^A-Z0-9\]\+'/i);
});

test("versions resolve by newest effective date and remain immutable", () => {
  const resolver = sql.match(
    /create or replace function public\.resolve_leave_type_version[\s\S]*?\$\$;/i,
  )?.[0] ?? "";
  assert.match(resolver, /effective_from <= p_effective_date/i);
  assert.match(resolver, /order by version\.effective_from desc, version\.revision_number desc/i);
  assert.match(sql, /prevent_leave_type_version_mutation/i);
});

test("paid and balance-exempt invariants are enforced in the protected writer", () => {
  const writer = sql.match(
    /create or replace function public\.create_leave_type_version[\s\S]*?\$\$;/i,
  )?.[0] ?? "";
  assert.match(writer, /p_is_paid and not p_is_balance_tracked/i);
  assert.match(writer, /not p_is_balance_tracked[\s\S]+p_default_annual_units <> 0/i);
  assert.match(writer, /LEAVE_POLICY_INVALID/i);
});

test("current or backdated replacement requires a private reason", () => {
  const writer = sql.match(
    /create or replace function public\.create_leave_type_version[\s\S]*?\$\$;/i,
  )?.[0] ?? "";
  assert.match(writer, /p_effective_from <= public\.company_attendance_date\(now\(\)\)/i);
  assert.match(writer, /LEAVE_CHANGE_REASON_REQUIRED/i);
  assert.doesNotMatch(writer, /'change_reason',\s*v_reason/i);
});

test("archiving appends an inactive version instead of mutating stable identity", () => {
  const archive = sql.match(
    /create or replace function public\.archive_leave_type[\s\S]*?\$\$;/i,
  )?.[0] ?? "";
  assert.match(archive, /public\.create_leave_type_version/i);
  assert.match(archive, /false,/i);
  assert.doesNotMatch(archive, /delete from public\.leave_types/i);
});

test("policy functions use fixed search paths and explicit HR checks", () => {
  for (const name of ["create_leave_type", "create_leave_type_version", "archive_leave_type"]) {
    const body = sql.match(new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\$\\$;`, "i"))?.[0] ?? "";
    assert.match(body, /security definer/i);
    assert.match(body, /set search_path = pg_catalog, public/i);
    assert.match(body, /public\.is_hr_admin\(\)/i);
  }
});


test("settings actions own immutable policy and employee eligibility RPCs", () => {
  for (const rpc of [
    "create_leave_type",
    "create_leave_type_version",
    "archive_leave_type",
    "upsert_employee_leave_year_setting",
  ]) assert.match(settingsActions, new RegExp(rpc));
});
