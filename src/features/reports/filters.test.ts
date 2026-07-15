import test from "node:test";
import assert from "node:assert/strict";
import { parseReportFilters, serializeReportFilters } from "./filters.ts";

test("defaults to current-month payroll filters", () => {
  const filters = parseReportFilters({}, "2026-07-15");
  assert.equal(filters.mode, "payroll");
  assert.equal(filters.tab, "summary");
  assert.equal(filters.startDate, "2026-07-01");
  assert.equal(filters.endDate, "2026-07-15");
  assert.equal(filters.page, 1);
  assert.equal(filters.pageSize, 25);
});

test("operational ranges are limited to 31 inclusive days", () => {
  assert.throws(
    () => parseReportFilters({ mode: "operational", start_date: "2026-06-01", end_date: "2026-07-15" }, "2026-07-15"),
    /Operational reports are limited to 31 days/,
  );
});

test("payroll ranges are limited to 366 inclusive days", () => {
  assert.throws(
    () => parseReportFilters({ mode: "payroll", start_date: "2025-01-01", end_date: "2026-07-15" }, "2026-07-15"),
    /Payroll reports are limited to 366 days/,
  );
});

test("future dates are rejected", () => {
  assert.throws(
    () => parseReportFilters({ end_date: "2026-07-16" }, "2026-07-15"),
    /Future report dates are not allowed/,
  );
});

test("serialization preserves stable filter names", () => {
  const filters = parseReportFilters({ mode: "payroll", tab: "daily", page_size: "50", active_only: "1" }, "2026-07-15");
  assert.equal(serializeReportFilters(filters).toString(), "mode=payroll&tab=daily&start_date=2026-07-01&end_date=2026-07-15&active_only=1&page=1&page_size=50");
});
