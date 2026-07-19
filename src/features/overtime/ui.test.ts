import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const queuePage = await readFile(
  new URL("../../app/(dashboard)/admin/overtime/page.tsx", import.meta.url),
  "utf8",
).catch(() => "");
const table = await readFile(
  new URL("../../components/overtime/overtime-approval-table.tsx", import.meta.url),
  "utf8",
).catch(() => "");

test("HR overtime queue requires admin before loading data", () => {
  const authAt = queuePage.indexOf("await requireAttendanceAdmin()");
  const queryAt = queuePage.indexOf("getAdminOvertimeApprovalQueue(");
  assert.ok(authAt >= 0);
  assert.ok(queryAt > authAt);
});

test("HR queue exposes every approved filter and summary metric", () => {
  for (const name of [
    "date_from",
    "date_to",
    "employee",
    "department",
    "segment_type",
    "holiday_type",
    "status",
  ]) {
    assert.match(queuePage, new RegExp(`name=["']${name}["']`));
  }
  for (const label of [
    "Pending items",
    "Approved items",
    "Rejected items",
    "Superseded items",
    "Total detected",
    "Active approved",
  ]) {
    assert.match(queuePage, new RegExp(label));
  }
});

test("queue table shows employee, segment, holiday, minutes, status, and detail action", () => {
  for (const label of ["Employee", "Date", "Segment", "Holiday", "Detected", "Approved", "Status"])
    assert.match(table, new RegExp(label));
  assert.match(table, /href=\{`\/admin\/overtime\/\$\{item\.id\}`\}/);
});

const detailPage = await readFile(
  new URL("../../app/(dashboard)/admin/overtime/[approvalItemId]/page.tsx", import.meta.url),
  "utf8",
).catch(() => "");

test("approval detail includes every required source snapshot and prior history", () => {
  for (const label of [
    "Employee",
    "Attendance date",
    "Segment type",
    "Holiday",
    "Detected start",
    "Detected end",
    "Detected minutes",
    "Attendance calculation revision",
    "Schedule assignment",
    "Schedule version",
    "Overtime policy version",
    "Holiday version",
    "Approval status",
    "Created at",
    "Prior superseded items",
  ]) assert.match(detailPage, new RegExp(label));
});

const employeePage = await readFile(
  new URL("../../app/(dashboard)/overtime/page.tsx", import.meta.url),
  "utf8",
).catch(() => "");
const employeeHistory = await readFile(
  new URL("../../components/overtime/employee-overtime-history.tsx", import.meta.url),
  "utf8",
).catch(() => "");
const attendanceSummary = await readFile(
  new URL("../../components/overtime/attendance-overtime-summary.tsx", import.meta.url),
  "utf8",
).catch(() => "");
const attendanceHistory = await readFile(
  new URL("../../components/attendance/attendance-history.tsx", import.meta.url),
  "utf8",
);
const adminAttendance = await readFile(
  new URL("../../components/attendance/admin-attendance-table.tsx", import.meta.url),
  "utf8",
);

test("employee overtime page authenticates as employee and loads only safe history", () => {
  const authAt = employeePage.indexOf("await requireAttendanceEmployee()");
  const queryAt = employeePage.indexOf("getOwnOvertimeHistory(");
  assert.ok(authAt >= 0);
  assert.ok(queryAt > authAt);
  assert.doesNotMatch(employeePage, /getOvertimeApprovalDetail|getAdminOvertime/);
});

test("employee overtime history shows approved safe fields and superseded state", () => {
  for (const label of [
    "Attendance date",
    "Segment",
    "Detected",
    "Approved",
    "Status",
    "Approval date",
    "Holiday",
  ]) assert.match(employeeHistory, new RegExp(label));
  assert.match(employeeHistory, /Superseded/);
  assert.doesNotMatch(employeeHistory, /approval_note|rejection_reason|reviewed_by|recalculation_reason/);
});

test("attendance overtime summary includes every segment label and status", () => {
  assert.match(attendanceSummary, /overtimeSegmentLabel/);
  assert.match(attendanceSummary, /overtimeApprovalStatusLabel/);
  assert.match(attendanceSummary, /detected_minutes/);
  assert.match(attendanceHistory, /AttendanceOvertimeSummary/);
  assert.match(adminAttendance, /AttendanceOvertimeSummary/);
});

const sidebar = await readFile(
  new URL("../../components/sidebar.tsx", import.meta.url),
  "utf8",
);
const settingsPage = await readFile(
  new URL("../../app/(dashboard)/settings/page.tsx", import.meta.url),
  "utf8",
);
const readme = await readFile(new URL("../../../README.md", import.meta.url), "utf8");

test("navigation exposes employee overtime and HR administration routes by role", () => {
  assert.match(sidebar, /\["\/overtime", "My Overtime"/);
  assert.match(sidebar, /\["\/admin\/overtime", "Overtime Approvals"/);
  assert.match(sidebar, /\["\/admin\/overtime\/recalculate", "Recalculate Overtime"/);
  assert.match(sidebar, /\["\/settings\/overtime-policy", "Overtime Policy"/);
  assert.match(sidebar, /\["\/settings\/holidays", "Holidays"/);
});

test("settings cards expose overtime policy and holiday calendar to HR", () => {
  assert.match(settingsPage, /href: "\/settings\/overtime-policy"/);
  assert.match(settingsPage, /href: "\/settings\/holidays"/);
  assert.match(settingsPage, /restricted: true/);
});

test("README documents migration, routes, exclusions, and verification", () => {
  assert.match(readme, /202607150002_overtime_holidays\.sql/);
  assert.match(readme, /\/admin\/overtime\/recalculate/);
  assert.match(readme, /\/settings\/holidays\/\[holidayGroupId\]\/replace/);
  assert.match(readme, /npm test/);
  assert.match(readme, /npx tsc --noEmit/);
  assert.match(readme, /npm run build/);
});

const holidaysPage = await readFile(
  new URL("../../app/(dashboard)/settings/holidays/page.tsx", import.meta.url),
  "utf8",
).catch(() => "");
const holidayDetailPage = await readFile(
  new URL("../../app/(dashboard)/settings/holidays/[holidayGroupId]/page.tsx", import.meta.url),
  "utf8",
).catch(() => "");

test("holiday calendar displays single and double regular classifications", () => {
  assert.match(holidaysPage, /holiday_count/);
  assert.match(holidaysPage, /Double regular holiday/);
  assert.match(holidayDetailPage, /Holiday count/);
  assert.match(holidayDetailPage, /Double regular holiday/);
});
