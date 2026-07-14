import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../../../../supabase/migrations/202607150001_attendance_policy_calculations.sql", import.meta.url),
  "utf8",
);
const actionSources = await Promise.all([
  "../../../app/(dashboard)/settings/attendance-policy/actions.ts",
  "../../../app/(dashboard)/admin/attendance/recalculate/actions.ts",
  "../../../app/(dashboard)/admin/attendance/finalization/actions.ts",
].map((path) => readFile(new URL(path, import.meta.url), "utf8")));

test("calculation tables expose no direct mutation or permanent delete policies", () => {
  for (const table of ["attendance_policy_versions", "attendance_calculation_groups", "attendance_calculation_revisions", "attendance_finalization_runs"]) {
    assert.doesNotMatch(migration, new RegExp(`create policy[^;]+${table}[^;]+for (insert|update|delete)`, "i"));
  }
  assert.doesNotMatch(actionSources.join("\n"), /\.delete\(\)/);
});

test("safe projection excludes protected reasons and actor identifiers", () => {
  const fn = migration.match(/create or replace function public\.get_my_attendance_calculations[\s\S]*?\$\$;/i)?.[0] ?? "";
  assert.doesNotMatch(fn, /recalculation_reason|change_reason|manual_reason|calculated_by/i);
});

test("all calculation security-definer functions use fixed search paths", () => {
  for (const name of ["create_attendance_policy_version", "write_attendance_calculation_revision", "calculate_attendance_day_internal", "calculate_attendance_day", "recalculate_attendance_range", "finalize_attendance_date", "get_my_attendance_calculations"]) {
    const fn = migration.match(new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\$\\$;`, "i"))?.[0] ?? "";
    assert.match(fn, /security definer/i);
    assert.match(fn, /set search_path = pg_catalog, public/i);
  }
});

test("private reasons are stored only in protected source columns and never audit payloads", () => {
  for (const name of ["p_change_reason", "p_recalculation_reason", "p_manual_reason"]) {
    assert.doesNotMatch(migration, new RegExp(`write_employee_audit\\([^;]+${name}`, "i"));
  }
  assert.doesNotMatch(actionSources.join("\n"), /console\.(log|error)\([^)]*(reason|note)/i);
});

test("internal functions are revoked and scheduled finalization cannot be invoked as an authenticated scheduled job", () => {
  assert.match(migration, /revoke all on function public\.calculate_attendance_day_internal/i);
  assert.match(migration, /revoke all on function public\.write_attendance_calculation_revision/i);
  const finalizer = migration.match(/create or replace function public\.finalize_attendance_date[\s\S]*?\$\$;/i)?.[0] ?? "";
  assert.match(finalizer, /if v_actor is not null or p_target_date <> v_company_date - 1/i);
});
