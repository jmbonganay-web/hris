import test from "node:test";
import assert from "node:assert/strict";
import { resolveScheduleState, weekdayForCompanyDate } from "./resolution.ts";
import type { ScheduleVersionRecord } from "./types.ts";

const version: Pick<ScheduleVersionRecord, "working_days"> = {
  working_days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
};

test("weekday resolution uses the company calendar date", () => {
  assert.equal(weekdayForCompanyDate("2026-07-13"), "monday");
  assert.equal(weekdayForCompanyDate("2026-07-19"), "sunday");
});

test("resolution distinguishes workdays, rest days, unassigned, and unavailable", () => {
  assert.equal(resolveScheduleState("2026-07-13", { id: "assignment" }, version), "scheduled_workday");
  assert.equal(resolveScheduleState("2026-07-19", { id: "assignment" }, version), "rest_day");
  assert.equal(resolveScheduleState("2026-07-13", null, null), "unassigned");
  assert.equal(resolveScheduleState("2026-07-13", { id: "assignment" }, null), "unavailable");
});
