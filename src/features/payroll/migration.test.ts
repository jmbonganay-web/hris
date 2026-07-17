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

const rpcNames = [
  "get_payroll_overview",
  "list_payroll_schedules",
  "get_payroll_schedule_detail",
  "preview_payroll_schedule_periods",
  "create_payroll_schedule",
  "update_payroll_schedule",
  "set_payroll_schedule_active",
  "ensure_payroll_period_horizon",
  "list_payroll_periods",
  "get_payroll_period_detail",
  "transition_payroll_period",
  "reopen_payroll_period",
  "get_employee_compensation_admin",
  "get_own_compensation",
  "create_compensation_draft",
  "update_compensation_draft",
  "submit_compensation_record",
  "approve_compensation_record",
  "reject_compensation_record",
  "create_schedule_assignment_draft",
  "update_schedule_assignment_draft",
  "submit_schedule_assignment",
  "approve_schedule_assignment",
  "reject_schedule_assignment",
  "list_payroll_approvals",
];

test("payroll migration creates the approved tables and enums", () => {
  for (const table of tables) {
    assert.match(sql, new RegExp(`create table(?: if not exists)? public\\.${table}`, "i"));
  }
  for (const value of ["weekly", "biweekly", "semi_monthly", "monthly"]) {
    assert.match(sql, new RegExp(`'${value}'`, "i"));
  }
  assert.match(sql, /default_currency_code[^;]*default 'PHP'/i);
  assert.match(sql, /payroll_timezone[^;]*default 'Asia\/Manila'/i);
  assert.match(sql, /generation_horizon_months[^;]*default 12/i);
  assert.equal((sql.toLowerCase().match(/^begin;/gm) ?? []).length, 1);
  assert.equal((sql.toLowerCase().match(/^commit;/gm) ?? []).length, 1);
});

test("payroll migration declares all protected public RPCs", () => {
  for (const name of rpcNames) {
    assert.match(sql, new RegExp(`create or replace function public\\.${name}\\s*\\(`, "i"));
  }
});

test("payroll migration configures rolling generation and daily cron", () => {
  assert.match(sql, /generation_horizon_months[^;]*between 1 and 24/i);
  assert.match(sql, /hris-daily-payroll-period-generation/i);
  assert.match(sql, /'15 0 \* \* \*'/i);
  assert.match(sql, /ensure_payroll_period_horizon\('scheduled',\s*null\)/i);
});
