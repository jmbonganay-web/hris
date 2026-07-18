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

const rpcs = [
  "create_payroll_basis_rule",
  "submit_payroll_basis_rule",
  "approve_payroll_basis_rule",
  "reject_payroll_basis_rule",
  "start_payroll_calculation_run",
  "calculate_payroll_employee",
  "recalculate_payroll_employee",
  "exclude_employee_from_payroll",
  "reverse_payroll_exclusion",
  "resolve_payroll_exception",
  "ignore_blocking_payroll_exception",
  "check_payroll_period_readiness",
  "get_payroll_calculation_workspace",
  "get_payroll_employee_calculation_detail",
  "list_payroll_entry_exceptions",
  "list_payroll_basis_rules",
];

test("Phase 10B.1 migration creates the approved calculation tables", () => {
  for (const table of tables) {
    assert.match(sql, new RegExp(`create table public\\.${table}\\s*\\(`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
});

test("Phase 10B.1 migration declares all protected payroll calculation RPCs", () => {
  for (const rpc of rpcs) {
    assert.match(sql, new RegExp(`create or replace function public\\.${rpc}\\s*\\(`, "i"));
  }
});

test("calculation runs are idempotent and prevent concurrent active runs", () => {
  assert.match(sql, /idempotency_key uuid not null unique/i);
  assert.match(sql, /payroll_calculation_one_active_run_idx/i);
  assert.match(sql, /pg_try_advisory_xact_lock\(hashtextextended\('payroll-calculation:'\s*\|\|\s*p_payroll_period_id::text/i);
  assert.match(sql, /on conflict \(idempotency_key\)/i);
});

test("employee calculations are versioned, isolated, and readiness-gated", () => {
  assert.match(sql, /unique \(payroll_period_id, employee_id, version_number\)/i);
  assert.match(sql, /begin\s+v_employee_result\s*:=\s*public\.calculate_payroll_employee_internal[\s\S]*?exception when others/i);
  assert.match(sql, /PAYROLL_PERIOD_NOT_READY/i);
  assert.match(sql, /v_period\.status not in \('open','under_review'\)/i);
});


test("failed calculation runs remain queryable after the exception subtransaction rolls back", () => {
  assert.match(
    sql,
    /exception when others then[\s\S]*?insert into public\.payroll_calculation_runs[\s\S]*?status='failed'/i,
  );
  assert.match(sql, /on conflict \(idempotency_key\) do update set[\s\S]*?error_code='PAYROLL_CALCULATION_FAILED'/i);
});
