import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../../app/(dashboard)/reports/page.tsx", import.meta.url), "utf8");
const filters = await readFile(new URL("./components/report-filters.tsx", import.meta.url), "utf8");
const tabs = await readFile(new URL("./components/report-tabs.tsx", import.meta.url), "utf8");

test("reports page authorizes before loading data", () => {
  assert.match(page, /requireReportAdmin\(\)/);
  assert.ok(page.indexOf("requireReportAdmin()") < page.indexOf("getReportSummary(filters)"));
});

test("unified page exposes all approved tabs and modes", () => {
  for (const label of ["Summary", "Daily Attendance", "Exceptions", "Overtime & Holiday Work", "Leave Balances", "Leave Usage", "Leave Conflicts", "Exports"]) assert.match(tabs, new RegExp(label));
  assert.match(filters, /Operational/);
  assert.match(filters, /Payroll/);
});

test("page contains no mock headcount or attendance-rate values", () => {
  assert.doesNotMatch(page, /Headcount|Attendance rate|94%|128/);
});

test("tab-specific filters and tables stay in their own report sections", async () => {
  const filtersSource = await readFile(new URL("./components/report-filters.tsx", import.meta.url), "utf8");
  const exceptions = await readFile(new URL("./components/exceptions-table.tsx", import.meta.url), "utf8");
  const overtime = await readFile(new URL("./components/overtime-holiday-table.tsx", import.meta.url), "utf8");
  const exportsPanel = await readFile(new URL("./components/exports-panel.tsx", import.meta.url), "utf8");
  assert.match(filtersSource, /Exception type/);
  assert.match(filtersSource, /Segment type/);
  assert.match(filtersSource, /Approval status/);
  assert.match(exceptions, /exception_type/);
  assert.match(overtime, /segment_type/);
  assert.match(exportsPanel, /CSV/);
  assert.match(exportsPanel, /XLSX/);
  assert.match(exportsPanel, /Payroll mode/);
});

test("export controls use direct anchors so downloads are never prefetched", async () => {
  const exportsPanel = await readFile(new URL("./components/exports-panel.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(exportsPanel, /next\/link/);
  assert.match(exportsPanel, /<a className="btn"/);
});

test("reports navigation is HR-only", async () => {
  const sidebar = await readFile(new URL("../../components/sidebar.tsx", import.meta.url), "utf8");
  assert.match(sidebar, /role === "hr_admin" \|\| role === "super_admin"/);
  assert.match(sidebar, /\["\/reports", "Reports", BarChart3\]/);
  assert.match(sidebar, /const hrOnlyItems[\s\S]+isHr[\s\S]+\["\/reports", "Reports", BarChart3\][\s\S]+: \[\]/);
  assert.match(sidebar, /\.\.\.hrOnlyItems/);
});

test("README documents Phase 5C migration, routes, limits, and exports", async () => {
  const readme = await readFile(new URL("../../../README.md", import.meta.url), "utf8");
  for (const value of ["202607150004_attendance_reports_payroll_export.sql", "/reports", "/api/reports/export/csv", "/api/reports/export/xlsx", "25,000", "Asia/Manila"]) {
    assert.match(readme, new RegExp(value.replaceAll("/", "\\/")));
  }
});

test("reports provide loading and retryable error states", async () => {
  const loading = await readFile(new URL("../../app/(dashboard)/reports/loading.tsx", import.meta.url), "utf8");
  const error = await readFile(new URL("../../app/(dashboard)/reports/error.tsx", import.meta.url), "utf8");
  assert.match(loading, /aria-busy="true"/);
  assert.match(error, /^"use client";/);
  assert.match(error, /onClick=\{reset\}/);
  assert.match(error, /selected filters were preserved/i);
});


test("reports page routes leave tabs to dedicated tables", () => {
  assert.match(page, /getLeaveBalanceReport/);
  assert.match(page, /getLeaveUsageReport/);
  assert.match(page, /getLeaveConflictReport/);
  assert.match(page, /LeaveBalanceTable/);
  assert.match(page, /LeaveUsageTable/);
  assert.match(page, /LeaveConflictReportTable/);
});
