import test from "node:test";
import assert from "node:assert/strict";
import { dashboardRangeQuery, resolveDashboardRange } from "./range.ts";

test("dashboard defaults to the current Manila month", () => {
  assert.deepEqual(resolveDashboardRange({}, "2026-07-17"), {
    preset: "current_month",
    startDate: "2026-07-01",
    endDate: "2026-07-31",
    label: "July 1–31, 2026",
  });
});

test("dashboard presets resolve deterministic inclusive ranges", () => {
  assert.deepEqual(resolveDashboardRange({ preset: "last_7_days" }, "2026-07-17"), {
    preset: "last_7_days",
    startDate: "2026-07-11",
    endDate: "2026-07-17",
    label: "July 11–17, 2026",
  });
  assert.deepEqual(resolveDashboardRange({ preset: "current_quarter" }, "2026-07-17"), {
    preset: "current_quarter",
    startDate: "2026-07-01",
    endDate: "2026-09-30",
    label: "July 1–September 30, 2026",
  });
});

test("invalid or oversized custom ranges fall back to current month", () => {
  assert.equal(resolveDashboardRange({ preset: "custom", start: "2026-08-01", end: "2026-07-01" }, "2026-07-17").preset, "current_month");
  assert.equal(resolveDashboardRange({ preset: "custom", start: "2025-01-01", end: "2026-07-17" }, "2026-07-17").preset, "current_month");
  assert.equal(resolveDashboardRange({ preset: "custom", start: "not-a-date", end: "2026-07-17" }, "2026-07-17").preset, "current_month");
});

test("range query preserves custom dates only for custom ranges", () => {
  assert.equal(dashboardRangeQuery(resolveDashboardRange({ preset: "last_30_days" }, "2026-07-17")), "preset=last_30_days");
  assert.equal(
    dashboardRangeQuery(resolveDashboardRange({ preset: "custom", start: "2026-07-02", end: "2026-07-10" }, "2026-07-17")),
    "preset=custom&start=2026-07-02&end=2026-07-10",
  );
});
