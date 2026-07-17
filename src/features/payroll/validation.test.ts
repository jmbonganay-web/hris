import test from "node:test";
import assert from "node:assert/strict";
import {
  validateCompensationInput,
  validatePayrollScheduleInput,
  validateRecordVersion,
  validateScheduleAssignmentInput,
} from "./validation.ts";

const uuid = "11111111-1111-4111-8111-111111111111";

test("schedule validation normalizes the approved semi-monthly configuration", () => {
  const result = validatePayrollScheduleInput({
    name: "Semi-monthly payroll",
    code: "sm",
    scheduleType: "semi_monthly",
    anchorDate: null,
    firstPeriodEndDay: 15,
    cutoffOffsetDays: 0,
    paymentOffsetDays: 5,
  });
  assert.equal(result.data?.code, "SM");
  assert.equal(result.data?.firstPeriodEndDay, 15);
});

test("compensation validation accepts matching amount type and hours", () => {
  const result = validateCompensationInput({
    compensationType: "monthly",
    monthlySalary: "45000",
    hourlyRate: "",
    standardHoursPerDay: "8",
    standardHoursPerWeek: "40",
    effectiveFrom: "2026-08-01",
    changeReason: "Annual review",
  }, "2026-07-18");
  assert.equal(result.data?.monthlySalary, 45000);
  assert.equal(result.data?.hourlyRate, null);
});

test("compensation validation rejects mismatched and non-positive amounts", () => {
  const monthly = validateCompensationInput({
    compensationType: "monthly",
    monthlySalary: "45000",
    hourlyRate: "100",
    standardHoursPerDay: "8",
    standardHoursPerWeek: "40",
    effectiveFrom: "2026-08-01",
    changeReason: "Annual review",
  }, "2026-07-18");
  assert.equal(monthly.state?.fieldErrors?.hourly_rate, "Hourly rate must be empty for monthly compensation.");

  const hourly = validateCompensationInput({
    compensationType: "hourly",
    monthlySalary: "",
    hourlyRate: "0",
    standardHoursPerDay: "8",
    standardHoursPerWeek: "40",
    effectiveFrom: "2026-08-01",
    changeReason: "New rate",
  }, "2026-07-18");
  assert.match(hourly.state?.fieldErrors?.hourly_rate ?? "", /greater than zero/i);
});

test("compensation validation protects hours, effective dates, and backdating", () => {
  const result = validateCompensationInput({
    compensationType: "hourly",
    monthlySalary: "",
    hourlyRate: "120",
    standardHoursPerDay: "8",
    standardHoursPerWeek: "6",
    effectiveFrom: "2026-07-01",
    changeReason: "",
  }, "2026-07-18");
  assert.match(result.state?.fieldErrors?.standard_hours_per_week ?? "", /at least the daily/i);
  assert.match(result.state?.fieldErrors?.change_reason ?? "", /backdated/i);
});

test("assignment validation requires safe identifiers and override reasons", () => {
  const invalidId = validateScheduleAssignmentInput({
    payrollScheduleId: "bad",
    effectiveFrom: "2026-08-01",
    changeReason: "Transfer",
    overrideMidPeriod: false,
    overrideReason: "",
  }, "2026-07-18");
  assert.ok(invalidId.state?.fieldErrors?.payroll_schedule_id);

  const override = validateScheduleAssignmentInput({
    payrollScheduleId: uuid,
    effectiveFrom: "2026-08-01",
    changeReason: "Transfer",
    overrideMidPeriod: true,
    overrideReason: "",
  }, "2026-07-18");
  assert.ok(override.state?.fieldErrors?.override_reason);
});

test("record identity validation rejects invalid UUIDs and stale versions", () => {
  assert.ok(validateRecordVersion("bad", 0).state);
  assert.deepEqual(validateRecordVersion(uuid, 1).data, { id: uuid, expectedVersion: 1 });
});
