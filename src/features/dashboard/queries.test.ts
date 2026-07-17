import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./queries.ts", import.meta.url), "utf8");

test("dashboard queries are server-only and use the authenticated server client", () => {
  assert.match(source, /import "server-only"/);
  assert.match(source, /requireUser/);
  assert.doesNotMatch(source, /createAdminClient|SUPABASE_SERVICE_ROLE_KEY/);
});

test("dashboard query dispatcher uses all role-scoped RPCs", () => {
  for (const name of ["get_hr_dashboard_analytics", "get_manager_dashboard_analytics", "get_employee_dashboard_analytics"]) {
    assert.match(source, new RegExp(`rpc\\(\\s*"${name}"`));
  }
  assert.match(source, /manager\.directReportCount > 0/);
  assert.match(source, /normalizeDashboardPayload/);
});

test("dashboard queries return a generic safe error", () => {
  assert.match(source, /Unable to load dashboard analytics\./);
  assert.doesNotMatch(source, /console\.error/);
});
