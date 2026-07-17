import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../../app/(dashboard)/dashboard/page.tsx", import.meta.url), "utf8");
const filter = await readFile(new URL("../../components/dashboard/dashboard-period-filter.tsx", import.meta.url), "utf8");
const trend = await readFile(new URL("../../components/dashboard/dashboard-trend-chart.tsx", import.meta.url), "utf8");
const breakdown = await readFile(new URL("../../components/dashboard/dashboard-breakdown-chart.tsx", import.meta.url), "utf8");
const loading = await readFile(new URL("../../app/(dashboard)/dashboard/loading.tsx", import.meta.url), "utf8");
const error = await readFile(new URL("../../app/(dashboard)/dashboard/error.tsx", import.meta.url), "utf8");

test("dashboard is live, date-filtered, and role-specific", () => {
  assert.match(page, /getDashboardAnalytics/);
  assert.match(page, /resolveDashboardRange/);
  assert.match(page, /analytics\.kind === "hr"/);
  assert.match(page, /analytics\.kind === "manager"/);
  assert.match(page, /AttendanceClockCard/);
  assert.doesNotMatch(page, /@\/data\/mock|leaveRequests|employees\.slice/);
});

test("dashboard exposes current-month and custom period filtering", () => {
  for (const preset of ["current_month", "last_7_days", "last_30_days", "current_quarter", "custom"]) {
    assert.match(filter, new RegExp(preset));
  }
  assert.match(filter, /method="get"/);
  assert.match(filter, /name="start"/);
  assert.match(filter, /name="end"/);
});

test("lightweight charts are accessible without a chart dependency", () => {
  assert.match(trend, /<svg/);
  assert.match(trend, /role="img"/);
  assert.match(trend, /<title/);
  assert.match(trend, /buildTrendPolyline/);
  assert.match(breakdown, /dashboard-breakdown-bar/);
  assert.doesNotMatch(trend + breakdown, /recharts|chart\.js|highcharts/);
});

test("dashboard has safe loading and error routes", () => {
  assert.match(loading, /dashboard-loading/);
  assert.match(error, /"use client"/);
  assert.match(error, /reset\(\)/);
  assert.doesNotMatch(error, /error\.message/);
});

test("dashboard browser-facing source excludes sensitive document and HR fields", () => {
  for (const forbidden of ["storagePath", "signedUrl", "internalReason", "reviewNote", "privateReason", "bankAccount", "governmentId", "customMetadata"]) {
    assert.doesNotMatch(page, new RegExp(forbidden, "i"));
  }
});
