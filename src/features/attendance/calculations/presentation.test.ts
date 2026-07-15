import test from "node:test";
import assert from "node:assert/strict";
import {
  attendanceBaseStatusLabel,
  holidayAttendanceLabel,
  attendanceCalculationFlags,
  formatAttendanceMinutes,
} from "./presentation.ts";
import type { AttendanceCalculationRevision } from "./types.ts";

const revision = {
  id: "r", calculation_group_id: "g", revision_number: 1,
  employee_id: "e", attendance_date: "2026-07-15",
  attendance_record_id: null, schedule_assignment_id: null,
  schedule_version_id: null, policy_version_id: null,
  holiday_version_id: null, holiday_name: null, holiday_type: null, is_holiday: false,
  base_status: "present", is_provisional: false,
  scheduled_start_at: null, scheduled_end_at: null, scheduled_minutes: 480,
  actual_clock_in_at: null, actual_clock_out_at: null, worked_minutes: 510,
  late_minutes: 15, undertime_minutes: 10, is_late: true, is_undertime: true,
  is_corrected: true, is_recalculated: true,
  calculation_source: "manual_recalculation", calculated_at: "2026-07-15T10:00:00Z",
} satisfies AttendanceCalculationRevision;

test("attendance minute formatting is readable and handles unavailable values", () => {
  assert.equal(formatAttendanceMinutes(510), "8h 30m");
  assert.equal(formatAttendanceMinutes(15), "15m");
  assert.equal(formatAttendanceMinutes(0), "0m");
  assert.equal(formatAttendanceMinutes(null), "Unavailable");
});

test("base status labels cover approved statuses", () => {
  assert.equal(attendanceBaseStatusLabel("present"), "Present");
  assert.equal(attendanceBaseStatusLabel("missing_clock_out"), "Missing clock-out");
  assert.equal(attendanceBaseStatusLabel("rest_day_worked"), "Rest day worked");
  assert.equal(attendanceBaseStatusLabel("unscheduled_attendance"), "Unscheduled attendance");
});

test("calculation flags remain independent", () => {
  assert.deepEqual(attendanceCalculationFlags(revision), ["Late", "Undertime", "Corrected", "Recalculated"]);
});


test("holiday attendance labels are explicit", () => {
  assert.equal(attendanceBaseStatusLabel("holiday"), "Holiday");
  assert.equal(
    holidayAttendanceLabel({
      is_holiday: true,
      holiday_name: "Independence Day",
      holiday_type: "regular_holiday",
      actual_clock_in_at: null,
      actual_clock_out_at: null,
    }),
    "Regular Holiday",
  );
  assert.equal(
    holidayAttendanceLabel({
      is_holiday: true,
      holiday_name: "Company Foundation Day",
      holiday_type: "company_holiday",
      actual_clock_in_at: "2026-07-15T00:00:00.000Z",
      actual_clock_out_at: "2026-07-15T08:00:00.000Z",
    }),
    "Holiday work",
  );
});
