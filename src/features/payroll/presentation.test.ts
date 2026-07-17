import test from "node:test";
import assert from "node:assert/strict";
import {
  payrollScheduleTypeValues,
  payrollPeriodStatusValues,
} from "./constants.ts";
import {
  formatPayrollMoney,
  payrollPeriodStatusLabel,
  payrollScheduleTypeLabel,
} from "./presentation.ts";

test("payroll constants expose the approved schedule and period values", () => {
  assert.deepEqual(payrollScheduleTypeValues, ["weekly", "biweekly", "semi_monthly", "monthly"]);
  assert.deepEqual(payrollPeriodStatusValues, ["draft", "open", "under_review", "approved", "locked"]);
});

test("payroll presentation formats Philippine currency and labels", () => {
  assert.equal(formatPayrollMoney(125000, "PHP"), "₱125,000.00");
  assert.equal(payrollPeriodStatusLabel("under_review"), "Under review");
  assert.equal(payrollScheduleTypeLabel("semi_monthly"), "Semi-monthly");
});
