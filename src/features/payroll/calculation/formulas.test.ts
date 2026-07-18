import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL("../../../../supabase/migrations/202607190001_payroll_calculation_foundation.sql", import.meta.url),
  "utf8",
).catch(() => "");

test("monthly calculations use approved divisor and minute-rate formulas", () => {
  assert.match(sql, /monthly_salary \* 12\s*\/\s*v_basis\.annual_divisor/i);
  assert.match(sql, /v_daily_rate\s*\/\s*v_comp\.standard_hours_per_day/i);
  assert.match(sql, /v_hourly_rate\s*\/\s*60/i);
});

test("hourly calculations reduce payable minutes without duplicate deductions", () => {
  assert.match(sql, /if v_comp\.compensation_type\s*=\s*'hourly'/i);
  assert.match(sql, /v_regular_earnings := v_payable_minutes \* v_hourly_rate \/ 60/i);
  assert.match(sql, /v_absence_deduction := 0/i);
  assert.match(sql, /v_late_deduction := 0/i);
  assert.match(sql, /v_undertime_deduction := 0/i);
});

test("daily calculations split effective-dated compensation and basis rules", () => {
  assert.match(sql, /generate_series\(v_period\.period_start,\s*v_period\.period_end,\s*interval '1 day'\)/i);
  assert.match(sql, /effective_from <= v_work_date/i);
  assert.match(sql, /effective_to is null or effective_to >= v_work_date/i);
});

test("money columns use numeric and preserve raw and rounded totals", () => {
  assert.doesNotMatch(sql, /\b(real|double precision|float)\b/i);
  assert.match(sql, /gross_pay_raw numeric\(18,6\)/i);
  assert.match(sql, /gross_pay_rounded numeric\(14,2\)/i);
  assert.match(sql, /gross_pay_rounded=public\.round_payroll_amount\(v_gross_pay/i);
});


test("rounding modes implement truncate, half-up, and true half-even behavior", () => {
  assert.match(sql, /if p_mode='truncate'[\s\S]*?trunc\(v_value,2\)/i);
  assert.match(sql, /if p_mode='half_even'/i);
  assert.match(sql, /v_fraction=0\.5 and mod\(v_whole,2\)=1/i);
  assert.match(sql, /return sign\(v_value\)\*v_whole\/100/i);
  assert.match(sql, /return round\(v_value,2\)/i);
});


test("all rounded employee totals use the approved basis rounding mode", () => {
  for (const column of [
    "regular_earnings_rounded",
    "absence_deduction_rounded",
    "late_deduction_rounded",
    "undertime_deduction_rounded",
    "paid_leave_amount",
    "unpaid_leave_deduction",
    "gross_pay_rounded",
  ]) {
    assert.match(
      sql,
      new RegExp(`${column}=public\\.round_payroll_amount\\(`, "i"),
    );
  }
});
