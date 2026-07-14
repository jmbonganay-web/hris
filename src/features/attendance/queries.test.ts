import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./queries.ts", import.meta.url), "utf8");

test("attendance queries are server-only and use stable pagination", () => {
  assert.match(source, /import "server-only"/);
  assert.match(source, /const pageSize = 20/);
  assert.match(source, /\.order\("attendance_date", \{ ascending: false \}\)/);
  assert.match(source, /\.order\("id", \{ ascending: false \}\)/);
  assert.match(source, /\.range\(from, to\)/);
});

test("effective missing clock-out is derived with the company date", () => {
  assert.match(source, /effectiveAttendanceStatus/);
  assert.match(source, /companyDateAt/);
});

test("employee and reviewer relationships use explicit foreign-key hints", () => {
  assert.match(source, /employee:employees!attendance_records_employee_id_fkey/);
  assert.match(source, /reviewer:profiles!attendance_correction_requests_reviewed_by_fkey/);
});

test("admin missing-clock-out filtering uses date and null clock-out", () => {
  assert.match(source, /\.lt\("attendance_date", companyDate\)/);
  assert.match(source, /\.is\("clock_out_at", null\)/);
});


test("employee attendance details prioritize open records and scope record lookups", () => {
  assert.match(source, /\.order\("clock_out_at", \{ ascending: false, nullsFirst: true \}\)/);
  assert.match(source, /\.eq\("employee_id", employeeId\)[\s\S]+\.eq\("id", recordId\)/);
});

test("admin dashboard attendance summary counts today, open records, and pending corrections", () => {
  assert.match(source, /export async function getAdminAttendanceSummary/);
  assert.match(source, /presentToday/);
  assert.match(source, /missingClockOut/);
  assert.match(source, /pendingCorrections/);
  assert.match(source, /\.eq\("status", "pending"\)/);
});

test("today attendance context resolves schedule information without changing clock rules", () => {
  assert.match(source, /getResolvedEmployeeSchedule/);
  assert.match(source, /schedule:/);
  assert.doesNotMatch(source, /late|undertime|overtime/i);
});
