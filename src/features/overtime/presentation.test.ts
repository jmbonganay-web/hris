import test from "node:test";
import assert from "node:assert/strict";
import {
  overtimeApprovalStatusLabel,
  overtimeSegmentLabel,
  holidayTypeLabel,
} from "./presentation.ts";

test("overtime segment labels are user-facing", () => {
  assert.equal(overtimeSegmentLabel("pre_shift"), "Pre-shift");
  assert.equal(overtimeSegmentLabel("post_shift"), "Post-shift");
  assert.equal(overtimeSegmentLabel("rest_day"), "Rest-day overtime");
  assert.equal(overtimeSegmentLabel("holiday_work"), "Holiday work");
});

test("approval and holiday labels are complete", () => {
  assert.equal(overtimeApprovalStatusLabel("pending"), "Pending");
  assert.equal(overtimeApprovalStatusLabel("approved"), "Approved");
  assert.equal(overtimeApprovalStatusLabel("rejected"), "Rejected");
  assert.equal(overtimeApprovalStatusLabel("superseded"), "Superseded");
  assert.equal(holidayTypeLabel("regular_holiday"), "Regular Holiday");
  assert.equal(
    holidayTypeLabel("special_non_working_holiday"),
    "Special Non-Working Holiday",
  );
  assert.equal(holidayTypeLabel("company_holiday"), "Company Holiday");
});
