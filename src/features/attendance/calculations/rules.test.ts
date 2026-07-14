import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateLateMinutes,
  calculateUndertimeMinutes,
  calculateWorkedMinutes,
  classifyAttendanceCalculation,
  completedMinutesBetween,
} from "./rules.ts";

test("whole minutes truncate seconds", () => {
  assert.equal(completedMinutesBetween("2026-07-15T00:00:00.000Z", "2026-07-15T00:10:45.000Z"), 10);
});

test("grace suppresses lateness until threshold then counts all late minutes", () => {
  assert.equal(calculateLateMinutes(480, 488, 10), 0);
  assert.equal(calculateLateMinutes(480, 490, 10), 0);
  assert.equal(calculateLateMinutes(480, 495, 10), 15);
  assert.equal(calculateLateMinutes(480, 470, 10), 0);
});

test("undertime has no grace", () => {
  assert.equal(calculateUndertimeMinutes(1020, 1015), 5);
  assert.equal(calculateUndertimeMinutes(1020, 1025), 0);
});

test("worked minutes deduct break and floor at zero", () => {
  assert.equal(calculateWorkedMinutes(470, 1040, 60), 510);
  assert.equal(calculateWorkedMinutes(480, 500, 60), 0);
  assert.equal(calculateWorkedMinutes(480, 965, 0), 485);
});

test("classification covers present, provisional, missing, absent, rest, and unscheduled", () => {
  assert.equal(classifyAttendanceCalculation({ hasSchedule: false, isScheduledWorkday: false, attendanceExists: true, hasClockIn: true, hasClockOut: true, dateHasEnded: true }), "unscheduled_attendance");
  assert.equal(classifyAttendanceCalculation({ hasSchedule: true, isScheduledWorkday: false, attendanceExists: true, hasClockIn: true, hasClockOut: true, dateHasEnded: true }), "rest_day_worked");
  assert.equal(classifyAttendanceCalculation({ hasSchedule: true, isScheduledWorkday: true, attendanceExists: true, hasClockIn: true, hasClockOut: true, dateHasEnded: false }), "present");
  assert.equal(classifyAttendanceCalculation({ hasSchedule: true, isScheduledWorkday: true, attendanceExists: true, hasClockIn: true, hasClockOut: false, dateHasEnded: false }), "present");
  assert.equal(classifyAttendanceCalculation({ hasSchedule: true, isScheduledWorkday: true, attendanceExists: true, hasClockIn: true, hasClockOut: false, dateHasEnded: true }), "missing_clock_out");
  assert.equal(classifyAttendanceCalculation({ hasSchedule: true, isScheduledWorkday: true, attendanceExists: false, hasClockIn: false, hasClockOut: false, dateHasEnded: true }), "absent");
  assert.equal(classifyAttendanceCalculation({ hasSchedule: false, isScheduledWorkday: false, attendanceExists: false, hasClockIn: false, hasClockOut: false, dateHasEnded: true }), null);
  assert.equal(classifyAttendanceCalculation({ hasSchedule: true, isScheduledWorkday: false, attendanceExists: false, hasClockIn: false, hasClockOut: false, dateHasEnded: true }), null);
});
