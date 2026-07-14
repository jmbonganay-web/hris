import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(
  new URL("../../app/(dashboard)/attendance/page.tsx", import.meta.url),
  "utf8",
);

test("attendance page uses protected production queries instead of mock data", () => {
  assert.match(page, /requireAttendanceEmployee/);
  assert.match(page, /getTodayAttendanceContext/);
  assert.match(page, /getOwnAttendanceHistory/);
  assert.match(page, /AttendanceClockCard/);
  assert.match(page, /AttendanceHistory/);
  assert.doesNotMatch(page, /@\/data\/mock|mockAttendance/);
});

test("employee attendance supports finalized calculation-only statuses and date-based corrections", async () => {
  const history = await readFile(
    new URL("../../components/attendance/attendance-history.tsx", import.meta.url),
    "utf8",
  );
  for (const status of ["absent", "rest_day_worked", "unscheduled_attendance"]) {
    assert.match(page, new RegExp(`value="${status}"`));
  }
  assert.match(history, /record\.is_calculation_only/);
  assert.match(history, /corrections\/new\?date=/);
});
