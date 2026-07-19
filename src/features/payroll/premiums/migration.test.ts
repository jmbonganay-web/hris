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

test("migration creates every Phase 10B.2A table", () => {
  for (const table of tables) {
    assert.match(sql, new RegExp(`create table public\\.${table}\\s*\\(`, "i"));
  }
});

test("migration defines the approved scope, day, rounding, and premium enums", () => {
  for (const type of [
    "premium_rule_scope_type",
    "premium_day_type",
    "premium_time_rounding_mode",
    "premium_type",
  ]) assert.match(sql, new RegExp(`create type public\\.${type} as enum`, "i"));

  for (const dayType of [
    "regular_workday",
    "rest_day",
    "special_non_working_day",
    "regular_holiday",
    "special_day_rest_day",
    "regular_holiday_rest_day",
    "double_regular_holiday",
    "double_regular_holiday_rest_day",
  ]) assert.match(sql, new RegExp(`'${dayType}'`));
});

test("premium money and multipliers use numeric instead of floating point", () => {
  assert.match(sql, /premium_amount_raw numeric\(18,6\)/i);
  assert.match(sql, /base_hourly_rate_raw numeric\(18,9\)/i);
  assert.match(sql, /regular_time_multiplier numeric\(8,5\)/i);
  assert.doesNotMatch(sql, /\b(?:real|double precision)\b/i);
});

test("the Philippine reference remains an inactive immutable preset", () => {
  assert.match(sql, /ph_dole_2024_reference/);
  assert.match(sql, /DOLE\/Bureau of Working Conditions/);
  assert.match(sql, /Workers-Statutory-Monetary-Benefits-Handbook-2024-Edition\.pdf/);
  assert.match(sql, /premium_rule_presets_immutable/);
  const presetInsert = sql.match(/insert into public\.premium_rule_presets[\s\S]*?on conflict \(code\) do nothing;/i)?.[0] ?? "";
  assert.ok(presetInsert);
  assert.doesNotMatch(presetInsert, /status|approved/i);
});

test("migration extends entries without overwriting Phase 10B.1 base fields", () => {
  for (const column of [
    "premium_earnings_raw",
    "premium_earnings_rounded",
    "night_differential_raw",
    "night_differential_rounded",
    "revised_gross_pay_raw",
    "revised_gross_pay_rounded",
    "premium_calculated_at",
  ]) assert.match(sql, new RegExp(`add column if not exists ${column}`, "i"));
  assert.doesNotMatch(sql, /drop column\s+(?:gross_pay_raw|gross_pay_rounded)/i);
});

test("calculation readiness includes premium completion", () => {
  const body = sql.match(
    /create or replace function public\.check_payroll_period_readiness[\s\S]*?\n\$\$;/i,
  )?.[0] ?? "";
  assert.match(body, /premium_calculated_at is null/i);
  assert.match(body, /missingPremiumEntryCount/);
  assert.match(body, /v_missing_premium=0/);
});

test("all planned public workflows are present", () => {
  for (const rpc of [
    "create_premium_rule_set",
    "clone_premium_rule_preset",
    "clone_premium_rule_version",
    "update_premium_rule_set_draft",
    "submit_premium_rule_set",
    "approve_premium_rule_set",
    "reject_premium_rule_set",
    "create_attendance_deduction_rule",
    "clone_attendance_deduction_rule",
    "update_attendance_deduction_rule_draft",
    "submit_attendance_deduction_rule",
    "approve_attendance_deduction_rule",
    "reject_attendance_deduction_rule",
    "list_premium_rule_sets",
    "get_premium_rule_set_detail",
    "list_attendance_deduction_rules",
    "list_premium_rule_approvals",
    "preview_premium_rule_coverage",
    "calculate_payroll_premiums",
    "recalculate_employee_premiums",
  ]) assert.match(sql, new RegExp(`create or replace function public\\.${rpc}\\s*\\(`, "i"));
});

test("notification allow-list contains every Phase 10B.2A route", () => {
  for (const route of [
    "/payroll/settings/premium-rules",
    "/payroll/settings/attendance-deduction-rules",
    "/payroll/approvals/premium-rules",
  ]) assert.match(sql, new RegExp(route.replaceAll("/", "\\/")));
});


test("premium workflows send identifier-only approval and result notifications", () => {
  const submit = sql.match(/create or replace function public\.submit_premium_rule_set[\s\S]*?\n\$\$;/i)?.[0] ?? "";
  const approve = sql.match(/create or replace function public\.approve_premium_rule_set[\s\S]*?\n\$\$;/i)?.[0] ?? "";
  const attendanceSubmit = sql.match(/create or replace function public\.submit_attendance_deduction_rule[\s\S]*?\n\$\$;/i)?.[0] ?? "";
  const calculation = sql.match(/create or replace function public\.calculate_payroll_premiums[\s\S]*?\n\$\$;/i)?.[0] ?? "";
  assert.match(submit, /notify_payroll_super_admins/i);
  assert.match(attendanceSubmit, /notify_payroll_super_admins/i);
  assert.match(approve, /notify_payroll_admins/i);
  assert.match(calculation, /notify_payroll_admins/i);
  for (const body of [submit, approve, attendanceSubmit, calculation]) {
    assert.doesNotMatch(body, /monthly_salary|hourly_rate|premium_amount|gross_pay/i);
  }
});
