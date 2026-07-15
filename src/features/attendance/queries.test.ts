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


test("employee attendance details merge calculation days and scope record lookups", () => {
  assert.match(source, /getAdminActiveCalculationRows\(\{ employeeIds: \[params\.employeeId\] \}\)/);
  assert.match(source, /\.eq\("employee_id", employeeId\)[\s\S]+\.eq\("id", recordId\)/);
});

test("admin dashboard attendance summary counts today, open records, and pending corrections", () => {
  assert.match(source, /export async function getAdminAttendanceSummary/);
  assert.match(source, /presentToday/);
  assert.match(source, /missingClockOut/);
  assert.match(source, /pendingCorrections/);
  assert.match(source, /\.eq\("status", "pending"\)/);
});

test("today attendance context resolves schedule and active calculation information", () => {
  assert.match(source, /getResolvedEmployeeSchedule/);
  assert.match(source, /getOwnActiveCalculations/);
  assert.match(source, /calculation:/);
  assert.match(source, /schedule:/);
});

test("attendance histories merge calculation-only days before pagination", () => {
  assert.match(source, /mergeAttendanceDays/);
  assert.match(source, /filterAttendanceDays/);
  assert.match(source, /getAdminActiveCalculationRows/);
  assert.match(source, /merged\.slice\(from, to \+ 1\)/);
});

test("employee attendance history loads safe overtime summaries in parallel", () => {
  assert.match(source, /getOwnActiveOvertimeSummaryMap/);
  assert.match(source, /overtime:\s*overtimeMap\.get\(record\.attendance_date\)/);
});

test("admin attendance loads active overtime summaries by employee and date", () => {
  assert.match(source, /getAdminActiveOvertimeSummaryMap/);
  assert.match(source, /`\$\{record\.employee_id\}:\$\{record\.attendance_date\}`/);
});
