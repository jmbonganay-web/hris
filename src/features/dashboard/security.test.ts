import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../../../supabase/migrations/202607170004_dashboard_analytics.sql", import.meta.url), "utf8");

function definition(name: string) {
  return sql.match(new RegExp(`create or replace function public\\.${name}\\s*\\([\\s\\S]*?\\$\\$;`, "i"))?.[0] ?? "";
}

test("every dashboard function is a fixed-search-path security definer", () => {
  for (const name of ["get_hr_dashboard_analytics", "get_manager_dashboard_analytics", "get_employee_dashboard_analytics"]) {
    const source = definition(name);
    assert.match(source, /security definer/i);
    assert.match(source, /set search_path = pg_catalog, public/i);
  }
});

test("HR analytics requires HR authorization", () => {
  assert.match(definition("get_hr_dashboard_analytics"), /not public\.is_hr_admin\(\)/i);
  assert.match(definition("get_hr_dashboard_analytics"), /DASHBOARD_PERMISSION_DENIED/i);
});

test("manager analytics scopes every team source to current direct reports", () => {
  const source = definition("get_manager_dashboard_analytics");
  assert.match(source, /v_manager_id\s+uuid\s*:=\s*public\.current_employee_id\(\)/i);
  assert.match(source, /manager_id = v_manager_id/i);
  assert.match(source, /directReportCount/i);
});

test("employee analytics is scoped to the current employee", () => {
  const source = definition("get_employee_dashboard_analytics");
  assert.match(source, /v_employee_id\s+uuid\s*:=\s*public\.current_employee_id\(\)/i);
  assert.match(source, /employee_id = v_employee_id/i);
});

test("dashboard JSON builders exclude sensitive file and private fields", () => {
  for (const forbidden of ["storage_path", "signed_url", "internal_reason", "review_note", "private_reason", "bank_account", "government_id", "custom_metadata"]) {
    assert.doesNotMatch(sql, new RegExp(forbidden, "i"));
  }
});
