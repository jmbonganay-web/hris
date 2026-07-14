import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./queries.ts", import.meta.url), "utf8");
const migration = await readFile(
  new URL("../../../../supabase/migrations/202607150001_attendance_policy_calculations.sql", import.meta.url),
  "utf8",
);

test("safe employee projection returns active revisions only and verifies ownership", () => {
  const safeFunction = migration.match(
    /create or replace function public\.get_my_attendance_calculations[\s\S]*?\$\$;/i,
  )?.[0] ?? "";
  assert.match(safeFunction, /employee\.profile_id = auth\.uid\(\)/i);
  assert.match(safeFunction, /group_row\.active_revision_id/i);
  assert.doesNotMatch(safeFunction, /recalculation_reason/i);
  assert.doesNotMatch(safeFunction, /calculated_by/i);
});

test("calculation queries are server-only and use explicit active revision and actor relationships", () => {
  assert.match(source, /import "server-only"/);
  assert.match(source, /attendance_calculation_groups_active_revision_fkey/);
  assert.match(source, /calculator:profiles!attendance_calculation_revisions_calculated_by_fkey/);
});

test("revision history is newest first and finalization runs are paginated", () => {
  assert.match(source, /\.order\("revision_number", \{ ascending: false \}\)/);
  assert.match(source, /\.range\(from, to\)/);
});

test("admin calculation query includes employee data for calculation-only absence rows", () => {
  assert.match(source, /export async function getAdminActiveCalculationRows/);
  assert.match(source, /employee:employees!attendance_calculation_groups_employee_id_fkey/);
  assert.match(source, /active_revision:attendance_calculation_revisions!attendance_calculation_groups_active_revision_fkey/);
});


test("employee calculation RPC normalizes blank date filters to null", () => {
  assert.match(source, /const fromDate = params\.fromDate\?\.trim\(\) \|\| null/);
  assert.match(source, /const toDate = params\.toDate\?\.trim\(\) \|\| null/);
  assert.match(source, /p_from_date: fromDate/);
  assert.match(source, /p_to_date: toDate/);
  assert.doesNotMatch(source, /params\.fromDate \?\? null/);
  assert.doesNotMatch(source, /params\.toDate \?\? null/);
});
