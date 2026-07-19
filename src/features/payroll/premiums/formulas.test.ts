import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL("../../../../supabase/migrations/202607190003_payroll_premium_rules.sql", import.meta.url),
  "utf8",
);

test("full-day rest or holiday approvals replace scheduled attendance segments", () => {
  const body = sql.match(
    /create or replace function public\.resolve_payroll_premium_segments[\s\S]*?\n\$\$;/i,
  )?.[0] ?? "";
  assert.match(body, /v_has_full_day_approval boolean/i);
  assert.match(body, /segment_type in \('rest_day','holiday_work'\)/i);
  assert.match(body, /if v_day\.combined_day_type='regular_workday' and not v_has_full_day_approval/i);
});

test("ordinary, overtime, and night formulas preserve distinct bases", () => {
  const body = sql.match(
    /create or replace function public\.calculate_employee_premiums_internal[\s\S]*?\n\$\$;/i,
  )?.[0] ?? "";
  assert.match(body, /regular_time_multiplier-v_included_base_multiplier/i);
  assert.match(body, /regular_time_multiplier\*v_rule\.overtime_multiplier/i);
  assert.match(body, /night_differential_percentage/i);
  assert.match(body, /'night_differential'/i);
});

test("rounding modes are deterministic and raw minutes remain available", () => {
  const body = sql.match(
    /create or replace function public\.round_premium_minutes[\s\S]*?\n\$\$;/i,
  )?.[0] ?? "";
  for (const mode of ["exact_minutes", "round_down", "round_up", "nearest_increment"]) {
    assert.match(body, new RegExp(`'${mode}'`));
  }
  assert.match(sql, /raw_minutes integer not null/);
  assert.match(sql, /rounded_minutes integer not null/);
});

test("database validation rejects zero-length night windows", () => {
  const body = sql.match(
    /create or replace function public\.validate_premium_day_rules[\s\S]*?\n\$\$;/i,
  )?.[0] ?? "";
  assert.match(body, /night_window_start[^;]*=[^;]*night_window_end/i);
  assert.match(body, /INVALID_NIGHT_WINDOW/);
});

test("rest-day and holiday payable time requires an approved full-day segment", () => {
  const body = sql.match(
    /create or replace function public\.resolve_payroll_premium_segments[\s\S]*?\n\$\$;/i,
  )?.[0] ?? "";
  assert.match(body, /resolve_employee_day_type/i);
  assert.match(body, /v_day\.combined_day_type\s*=\s*'regular_workday'/i);
  assert.match(body, /segment_type in \('rest_day','holiday_work'\)/i);
});
