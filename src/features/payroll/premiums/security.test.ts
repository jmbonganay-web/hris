import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL("../../../../supabase/migrations/202607190003_payroll_premium_rules.sql", import.meta.url),
  "utf8",
);

const tables = [
  "premium_rule_presets",
  "premium_rule_sets",
  "premium_rule_versions",
  "attendance_deduction_rules",
  "payroll_day_type_resolutions",
  "payroll_premium_lines",
  "premium_rule_events",
  "premium_calculation_events",
];

test("all premium tables enable RLS and expose authenticated read-only access", () => {
  for (const table of tables) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(sql, new RegExp(`revoke all on public\\.${table} from authenticated`, "i"));
    assert.match(sql, new RegExp(`grant select on public\\.${table} to authenticated`, "i"));
    assert.doesNotMatch(sql, new RegExp(`grant (?:insert|update|delete|all) on public\\.${table} to authenticated`, "i"));
  }
});

test("approved premium matrix rows cannot be changed through owner-level writes", () => {
  assert.match(sql, /create or replace function public\.reject_approved_premium_rule_version_mutation/i);
  assert.match(sql, /create trigger premium_rule_versions_approved_immutable/i);
  assert.match(sql, /before update or delete on public\.premium_rule_versions/i);
  assert.match(sql, /parent_status in \('approved','superseded','rejected','cancelled'\)/i);
});

test("calculation records and audit events are append-only", () => {
  for (const trigger of [
    "premium_rule_presets_immutable",
    "payroll_day_type_resolutions_immutable",
    "payroll_premium_lines_immutable",
    "premium_rule_events_immutable",
    "premium_calculation_events_immutable",
  ]) assert.match(sql, new RegExp(`create trigger ${trigger}`, "i"));
});

test("browser callable RPCs validate roles and have restricted search paths", () => {
  for (const rpc of [
    "create_premium_rule_set",
    "submit_premium_rule_set",
    "approve_premium_rule_set",
    "create_attendance_deduction_rule",
    "approve_attendance_deduction_rule",
    "calculate_payroll_premiums",
    "list_premium_rule_sets",
  ]) {
    const body = sql.match(new RegExp(`create or replace function public\\.${rpc}[\\s\\S]*?\\n\\$\\$;`, "i"))?.[0] ?? "";
    assert.match(body, /security definer/i);
    assert.match(body, /set search_path\s*=\s*pg_catalog,\s*public/i);
    assert.match(body, /auth\.uid\(\)/i);
  }
});
