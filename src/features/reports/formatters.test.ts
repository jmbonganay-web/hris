import test from "node:test";
import assert from "node:assert/strict";
import { formatReportDuration, formatReportTimestamp } from "./formatters.ts";

test("duration formatter preserves null, zero, and totals over 24 hours", () => {
  assert.equal(formatReportDuration(null), "");
  assert.equal(formatReportDuration(0), "00:00");
  assert.equal(formatReportDuration(65), "01:05");
  assert.equal(formatReportDuration(1505), "25:05");
});

test("timestamps are emitted with the Manila offset", () => {
  assert.equal(formatReportTimestamp("2026-07-15T08:00:00Z"), "2026-07-15T16:00:00+08:00");
});
