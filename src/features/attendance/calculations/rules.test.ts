import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateLateMinutes,
  calculateUndertimeMinutes,
  calculateWorkedMinutes,
  classifyAttendanceCalculation,
  classifyHolidayAttendance,
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
  assert.equal(classifyAttendanceCalculation({ hasSchedule: false, isHoliday: false, isScheduledWorkday: false, attendanceExists: true, hasClockIn: true, hasClockOut: true, dateHasEnded: true }), "unscheduled_attendance");
  assert.equal(classifyAttendanceCalculation({ hasSchedule: true, isHoliday: false, isScheduledWorkday: false, attendanceExists: true, hasClockIn: true, hasClockOut: true, dateHasEnded: true }), "rest_day_worked");
  assert.equal(classifyAttendanceCalculation({ hasSchedule: true, isHoliday: false, isScheduledWorkday: true, attendanceExists: true, hasClockIn: true, hasClockOut: true, dateHasEnded: false }), "present");
  assert.equal(classifyAttendanceCalculation({ hasSchedule: true, isHoliday: false, isScheduledWorkday: true, attendanceExists: true, hasClockIn: true, hasClockOut: false, dateHasEnded: false }), "present");
  assert.equal(classifyAttendanceCalculation({ hasSchedule: true, isHoliday: false, isScheduledWorkday: true, attendanceExists: true, hasClockIn: true, hasClockOut: false, dateHasEnded: true }), "missing_clock_out");
  assert.equal(classifyAttendanceCalculation({ hasSchedule: true, isHoliday: false, isScheduledWorkday: true, attendanceExists: false, hasClockIn: false, hasClockOut: false, dateHasEnded: true }), "absent");
  assert.equal(classifyAttendanceCalculation({ hasSchedule: false, isHoliday: false, isScheduledWorkday: false, attendanceExists: false, hasClockIn: false, hasClockOut: false, dateHasEnded: true }), null);
  assert.equal(classifyAttendanceCalculation({ hasSchedule: true, isHoliday: false, isScheduledWorkday: false, attendanceExists: false, hasClockIn: false, hasClockOut: false, dateHasEnded: true }), null);
});


test("holiday without attendance is holiday instead of absent", () => {
  assert.equal(classifyAttendanceCalculation({
    hasSchedule: true,
    isScheduledWorkday: true,
    isHoliday: true,
    attendanceExists: false,
    hasClockIn: false,
    hasClockOut: false,
    dateHasEnded: true,
  }), "holiday");
});

test("holiday completed attendance remains present", () => {
  assert.equal(classifyAttendanceCalculation({
    hasSchedule: true,
    isScheduledWorkday: false,
    isHoliday: true,
    attendanceExists: true,
    hasClockIn: true,
    hasClockOut: true,
    dateHasEnded: true,
  }), "present");
});

test("holiday missing clock-out remains missing clock-out", () => {
  assert.equal(classifyAttendanceCalculation({
    hasSchedule: true,
    isScheduledWorkday: true,
    isHoliday: true,
    attendanceExists: true,
    hasClockIn: true,
    hasClockOut: false,
    dateHasEnded: true,
  }), "missing_clock_out");
});


test("holiday without attendance is finalized holiday with zero worked minutes", () => {
  assert.deepEqual(
    classifyHolidayAttendance({
      hasAttendance: false,
      hasClockOut: false,
      dateHasEnded: true,
      forceFinal: false,
      workedMinutes: null,
    }),
    {
      baseStatus: "holiday",
      isProvisional: false,
      workedMinutes: 0,
      lateMinutes: null,
      undertimeMinutes: null,
    },
  );
});

test("holiday missing clock-out finalizes as missing_clock_out", () => {
  assert.equal(
    classifyHolidayAttendance({
      hasAttendance: true,
      hasClockOut: false,
      dateHasEnded: true,
      forceFinal: false,
      workedMinutes: null,
    }).baseStatus,
    "missing_clock_out",
  );
});

test("completed holiday attendance is present with holiday metrics suppressed", () => {
  assert.deepEqual(
    classifyHolidayAttendance({
      hasAttendance: true,
      hasClockOut: true,
      dateHasEnded: true,
      forceFinal: false,
      workedMinutes: 450,
    }),
    {
      baseStatus: "present",
      isProvisional: false,
      workedMinutes: 450,
      lateMinutes: null,
      undertimeMinutes: null,
    },
  );
});
