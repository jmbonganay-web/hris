import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../../../supabase/migrations/202607170004_dashboard_analytics.sql", import.meta.url), "utf8");
const functions = [
  "get_hr_dashboard_analytics",
  "get_manager_dashboard_analytics",
  "get_employee_dashboard_analytics",
];

test("dashboard migration creates all role-scoped analytics functions", () => {
  for (const name of functions) {
    assert.match(sql, new RegExp(`create or replace function public\\.${name}\\s*\\(`, "i"));
    assert.match(sql, new RegExp(`revoke all on function public\\.${name}\\(date,date\\) from public, anon`, "i"));
    assert.match(sql, new RegExp(`grant execute on function public\\.${name}\\(date,date\\) to authenticated`, "i"));
  }
});

test("dashboard date range validation is inclusive and capped at 366 days", () => {
  assert.match(sql, /p_start_date is null or p_end_date is null or p_start_date > p_end_date/i);
  assert.match(sql, /\(p_end_date - p_start_date\) \+ 1 > 366/i);
  assert.match(sql, /DASHBOARD_INVALID_DATE_RANGE/i);
});

test("dashboard migration is one forward-only transaction", () => {
  assert.equal((sql.toLowerCase().match(/^begin;/gm) ?? []).length, 1);
  assert.equal((sql.toLowerCase().match(/^commit;/gm) ?? []).length, 1);
  assert.match(sql, /notify pgrst, 'reload schema';/i);
});
