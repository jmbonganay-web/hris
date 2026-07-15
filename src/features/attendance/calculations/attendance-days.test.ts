import test from "node:test";
import assert from "node:assert/strict";
import {
  filterAttendanceDays,
  mergeAttendanceDays,
} from "./attendance-days.ts";
import type { ActiveAttendanceCalculation } from "./types.ts";
import type { AttendanceRecord } from "../types.ts";

function calculation(overrides: Partial<ActiveAttendanceCalculation> = {}): ActiveAttendanceCalculation {
  return {
    id: "revision-1",
    calculation_group_id: "group-1",
    revision_number: 1,
    employee_id: "employee-1",
    attendance_date: "2026-07-14",
    attendance_record_id: null,
    schedule_assignment_id: "assignment-1",
    schedule_version_id: "version-1",
    policy_version_id: "policy-1",
    holiday_version_id: null,
    holiday_name: null,
    holiday_type: null,
    is_holiday: false,
    base_status: "absent",
    is_provisional: false,
    scheduled_start_at: "2026-07-14T00:00:00.000Z",
    scheduled_end_at: "2026-07-14T09:00:00.000Z",
    scheduled_minutes: 480,
    actual_clock_in_at: null,
    actual_clock_out_at: null,
    worked_minutes: 0,
    late_minutes: 0,
    undertime_minutes: 0,
    is_late: false,
    is_undertime: false,
    is_corrected: false,
    is_recalculated: false,
    calculation_source: "daily_finalization",
    calculated_at: "2026-07-15T00:05:00.000Z",
    schedule_name: "Regular Day",
    schedule_code: "REGULAR-DAY",
    ...overrides,
  };
}

function record(overrides: Partial<AttendanceRecord> = {}): AttendanceRecord {
  return {
    id: "record-1",
    employee_id: "employee-1",
    attendance_date: "2026-07-14",
    clock_in_at: "2026-07-14T00:00:00.000Z",
    clock_out_at: "2026-07-14T09:00:00.000Z",
    clock_in_note: null,
    clock_out_note: null,
    status: "completed",
    effective_status: "completed",
    is_corrected: false,
    last_corrected_at: null,
    last_corrected_by: null,
    last_correction_reason: null,
    created_by: "employee-1",
    created_at: "2026-07-14T00:00:00.000Z",
    updated_at: "2026-07-14T09:00:00.000Z",
    ...overrides,
  };
}

test("calculation-only absences become attendance-day rows", () => {
  const rows = mergeAttendanceDays([], [calculation()]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].is_calculation_only, true);
  assert.equal(rows[0].clock_in_at, null);
  assert.equal(rows[0].calculation?.base_status, "absent");
});

test("active calculations attach to matching raw attendance without duplicates", () => {
  const rows = mergeAttendanceDays(
    [record()],
    [calculation({ attendance_record_id: "record-1", base_status: "present" })],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "record-1");
  assert.equal(rows[0].is_calculation_only, false);
  assert.equal(rows[0].calculation?.base_status, "present");
});

test("attendance-day status filters include calculation-only statuses", () => {
  const rows = mergeAttendanceDays([], [calculation()]);
  assert.equal(filterAttendanceDays(rows, "absent").length, 1);
  assert.equal(filterAttendanceDays(rows, "completed").length, 0);
});


test("holiday filter returns holiday calculation-only rows", () => {
  const holiday = calculation({
    base_status: "holiday",
    is_holiday: true,
    holiday_name: "Company Foundation Day",
    holiday_type: "company_holiday",
  });
  const rows = mergeAttendanceDays([], [holiday]);
  assert.equal(filterAttendanceDays(rows, "holiday").length, 1);
});
