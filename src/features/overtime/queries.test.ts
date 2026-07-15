import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../../../supabase/migrations/202607150002_overtime_holidays.sql", import.meta.url),
  "utf8",
);
const source = await readFile(new URL("./queries.ts", import.meta.url), "utf8").catch(() => "");

const employeeRpc = migration.match(
  /create or replace function public\.get_my_overtime_items[\s\S]*?\$\$;/i,
)?.[0] ?? "";

test("employee overtime projection is ownership-scoped and contains only safe fields", () => {
  assert.match(employeeRpc, /employee\.profile_id = auth\.uid\(\)/i);
  assert.match(employeeRpc, /attendance_date date/i);
  assert.match(employeeRpc, /segment_type text/i);
  assert.match(employeeRpc, /detected_minutes integer/i);
  assert.match(employeeRpc, /approved_minutes integer/i);
  assert.match(employeeRpc, /status text/i);
  assert.match(employeeRpc, /approval_date timestamptz/i);
  assert.match(employeeRpc, /holiday_name text/i);
  assert.match(employeeRpc, /holiday_type text/i);
  assert.match(employeeRpc, /is_active boolean/i);
  assert.doesNotMatch(employeeRpc, /approval_note/i);
  assert.doesNotMatch(employeeRpc, /rejection_reason/i);
  assert.doesNotMatch(employeeRpc, /reviewed_by/i);
  assert.doesNotMatch(employeeRpc, /recalculation_reason/i);
  assert.doesNotMatch(employeeRpc, /change_reason/i);
  assert.doesNotMatch(employeeRpc, /policy_version_id/i);
  assert.doesNotMatch(employeeRpc, /detection_revision_id/i);
});

test("employee query uses only the safe RPC", () => {
  const ownHistory = source.match(
    /export async function getOwnOvertimeHistory[\s\S]*?\n}/,
  )?.[0] ?? "";
  assert.match(ownHistory, /\.rpc\("get_my_overtime_items"/);
  assert.doesNotMatch(ownHistory, /\.from\("overtime_/);
});

test("HR queue supports every approved filter and active-approved metrics", () => {
  assert.match(source, /dateFrom\?: string/);
  assert.match(source, /dateTo\?: string/);
  assert.match(source, /employeeId\?: string/);
  assert.match(source, /departmentId\?: string/);
  assert.match(source, /segmentType\?: OvertimeSegmentType/);
  assert.match(source, /holidayType\?: HolidayType/);
  assert.match(source, /status\?: OvertimeApprovalStatus/);
  assert.match(source, /totalActiveApprovedMinutes/);
  assert.match(source, /row\.status === "approved" && row\.detection_is_active/);
});

test("query module is server-only and maps superseded history", () => {
  assert.match(source, /^import "server-only";/);
  assert.match(source, /superseded_at/);
  assert.match(source, /priorItems/);
});


test("approval detail scopes superseded history to the selected detection group", () => {
  const detail = source.match(
    /export async function getOvertimeApprovalDetail[\s\S]*$/,
  )?.[0] ?? "";
  assert.match(detail, /\.in\("detection_revision_id", revisionIds\)/);
  assert.doesNotMatch(detail, /loadAllAdminApprovalRows\(\{\}\)/);
});


test("admin approval query disambiguates the detection-group relationship", () => {
  assert.match(
    source,
    /detection_group:overtime_detection_groups!overtime_detection_revisions_detection_group_id_fkey!inner\(/,
  );
});
