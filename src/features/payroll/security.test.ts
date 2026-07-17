import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL("../../../supabase/migrations/202607180002_payroll_foundation.sql", import.meta.url),
  "utf8",
);
const tables = [
  "payroll_settings",
  "payroll_schedules",
  "payroll_periods",
  "employee_compensation_records",
  "employee_payroll_schedule_assignments",
  "payroll_period_events",
  "compensation_events",
];

test("every payroll table has RLS and no direct authenticated writes", () => {
  for (const table of tables) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(sql, new RegExp(`revoke all on public\\.${table} from authenticated`, "i"));
  }
  assert.doesNotMatch(sql, /grant\s+(?:insert|update|delete|all)[^;]*to authenticated/i);
});

test("employees can read only their own current approved payroll identity", () => {
  const compensationPolicy = sql.match(
    /create policy "Employees read own current compensation"[\s\S]*?;/i,
  )?.[0] ?? "";
  const assignmentPolicy = sql.match(
    /create policy "Employees read own current payroll assignment"[\s\S]*?;/i,
  )?.[0] ?? "";
  for (const policy of [compensationPolicy, assignmentPolicy]) {
    assert.match(policy, /employee_id\s*=\s*public\.current_employee_id\(\)/i);
    assert.match(policy, /status\s*=\s*'approved'/i);
    assert.match(policy, /company_attendance_date\(now\(\)\)/i);
  }
  assert.doesNotMatch(sql, /manager_id[\s\S]*create policy/i);
});

test("privileged payroll functions use fixed search paths and revoked defaults", () => {
  const privileged = sql.match(/create or replace function public\.[\s\S]*?security definer[\s\S]*?\$\$;/gi) ?? [];
  assert.ok(privileged.length > 8);
  for (const definition of privileged) {
    assert.match(definition, /set search_path = pg_catalog, public/i);
  }
  assert.match(sql, /revoke all on function public\.write_payroll_period_event/i);
  assert.match(sql, /revoke all on function public\.write_compensation_event/i);
});

test("payroll notification and audit payload guards reject sensitive keys", () => {
  for (const token of [
    "monthly_salary",
    "hourly_rate",
    "amount",
    "change_reason",
    "override_reason",
    "rejection_reason",
    "service_role",
    "access_token",
  ]) {
    assert.match(sql, new RegExp(`'${token}'`, "i"));
  }
});

test("scheduled payroll generation cannot be invoked by an authenticated browser user", () => {
  const definition = sql.match(
    /create or replace function public\.ensure_payroll_period_horizon[\s\S]*?\$\$;/i,
  )?.[0] ?? "";
  assert.match(definition, /p_source='scheduled'\s+and\s+v_actor\s+is\s+not\s+null/i);
  assert.match(definition, /PAYROLL_PERMISSION_DENIED/i);
});
