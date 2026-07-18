import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL("../../../../supabase/migrations/202607190001_payroll_calculation_foundation.sql", import.meta.url),
  "utf8",
).catch(() => "");

const tables = [
  "payroll_basis_rules",
  "payroll_calculation_runs",
  "payroll_employee_entries",
  "payroll_entry_input_snapshots",
  "payroll_entry_daily_breakdowns",
  "payroll_entry_exceptions",
  "payroll_employee_exclusions",
  "payroll_calculation_events",
];

test("calculation data is HR-only and has no direct authenticated writes", () => {
  for (const table of tables) {
    assert.match(sql, new RegExp(`create policy [^;]+ on public\\.${table}[\\s\\S]*?using \\(public\\.is_hr_admin\\(\\)\\)`, "i"));
    assert.match(sql, new RegExp(`revoke all on public\\.${table} from authenticated`, "i"));
    assert.match(sql, new RegExp(`grant select on public\\.${table} to authenticated`, "i"));
    assert.doesNotMatch(sql, new RegExp(`grant (insert|update|delete|all) on public\\.${table} to authenticated`, "i"));
  }
});

test("snapshots and calculation events are immutable", () => {
  assert.match(sql, /reject_payroll_calculation_mutation/i);
  assert.match(sql, /before update or delete on public\.payroll_entry_input_snapshots/i);
  assert.match(sql, /before update or delete on public\.payroll_entry_daily_breakdowns/i);
  assert.match(sql, /before update or delete on public\.payroll_calculation_events/i);
});

test("security definer functions use a restricted search path and revoked defaults", () => {
  const definitions = sql.match(/create or replace function public\.[\s\S]*?\$\$;/gi) ?? [];
  assert.ok(definitions.length >= 20);
  for (const definition of definitions) {
    if (/security definer/i.test(definition)) {
      assert.match(definition, /set search_path = pg_catalog, public/i);
    }
  }
  assert.match(sql, /revoke all on function public\.calculate_payroll_employee_internal/i);
  assert.match(sql, /from public,anon,authenticated/i);
});

test("notification payloads never include compensation or payroll amounts", () => {
  assert.match(sql, /assert_safe_payroll_payload/i);
  const notificationCalls = sql.match(/notify_payroll_(?:admins|super_admins)\([\s\S]*?\);/gi) ?? [];
  assert.ok(notificationCalls.length >= 2);
  for (const call of notificationCalls) {
    assert.doesNotMatch(call, /monthly_salary|hourly_rate|gross_pay|regular_earnings/i);
  }
});
