import test from "node:test";
import assert from "node:assert/strict";
import {
  companyDateAt,
  effectiveAttendanceStatus,
  formatCompanyTime,
} from "./time.ts";

const baseRecord = {
  attendance_date: "2026-07-14",
  clock_out_at: null,
  status: "clocked_in" as const,
};

test("company date uses Asia Manila around UTC midnight", () => {
  assert.equal(companyDateAt(new Date("2026-07-13T15:59:59.000Z")), "2026-07-13");
  assert.equal(companyDateAt(new Date("2026-07-13T16:00:00.000Z")), "2026-07-14");
});

test("an older open record is effectively missing a clock-out", () => {
  assert.equal(
    effectiveAttendanceStatus(baseRecord, "2026-07-15"),
    "missing_clock_out",
  );
  assert.equal(
    effectiveAttendanceStatus(baseRecord, "2026-07-14"),
    "clocked_in",
  );
});

test("a record with a clock-out is completed", () => {
  assert.equal(
    effectiveAttendanceStatus(
      { ...baseRecord, clock_out_at: "2026-07-14T09:00:00.000Z", status: "completed" },
      "2026-07-15",
    ),
    "completed",
  );
});

test("company time formatting renders Manila time", () => {
  assert.match(formatCompanyTime("2026-07-14T00:03:00.000Z"), /8:03\s*AM/i);
});

test("UTC timestamps convert to Manila datetime-local values", async () => {
  const { toCompanyDateTimeLocal } = await import("./time.ts");
  assert.equal(
    toCompanyDateTimeLocal("2026-07-14T00:03:00.000Z"),
    "2026-07-14T08:03",
  );
  assert.equal(toCompanyDateTimeLocal(null), "");
});
