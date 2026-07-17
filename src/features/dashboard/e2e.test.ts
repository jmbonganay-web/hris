import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const migration = await readFile(new URL("../../../supabase/migrations/202607170004_dashboard_analytics.sql", import.meta.url), "utf8");
const page = await readFile(new URL("../../app/(dashboard)/dashboard/page.tsx", import.meta.url), "utf8");
const queries = await readFile(new URL("./queries.ts", import.meta.url), "utf8");
const packageJson = await readFile(new URL("../../../package.json", import.meta.url), "utf8");
const migrationFiles = await readdir(new URL("../../../supabase/migrations/", import.meta.url));

test("Phase 8 owns analytics in protected database and server layers", () => {
  for (const token of [
    "get_hr_dashboard_analytics",
    "get_manager_dashboard_analytics",
    "get_employee_dashboard_analytics",
    "getDashboardAnalytics",
    "DashboardTrendChart",
    "DashboardPeriodFilter",
  ]) assert.match(`${migration}\n${queries}\n${page}`, new RegExp(token));
});

test("dashboard removes mock data and keeps the existing route", () => {
  assert.doesNotMatch(page, /@\/data\/mock|Total employees\", \"128|Pending leave\", \"7/);
  assert.match(page, /title="Dashboard"/);
  assert.doesNotMatch(page, /\/analytics/);
});

test("Phase 8 adds no chart dependency or browser secret", () => {
  assert.doesNotMatch(packageJson, /recharts|chart\.js|highcharts|echarts/);
  assert.doesNotMatch(`${page}\n${queries}`, /SUPABASE_SERVICE_ROLE_KEY|createAdminClient/);
});

test("migration ordering follows the final Phase 7 patch", () => {
  assert.match(migration, /^begin;/);
  const phase7Patch = migrationFiles.indexOf("202607170003_fix_document_active_version_trigger_permissions.sql");
  const phase8Migration = migrationFiles.indexOf("202607170004_dashboard_analytics.sql");
  assert.notEqual(phase7Patch, -1);
  assert.notEqual(phase8Migration, -1);
  assert.ok(phase8Migration > phase7Patch);
});
