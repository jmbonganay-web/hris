import test from "node:test";
import assert from "node:assert/strict";
import {
  formatLeaveUnits,
  leaveClassificationLabel,
  leaveConflictLabel,
  leaveStatusLabel,
} from "./presentation.ts";

 test("leave unit formatting preserves half days", () => {
  assert.equal(formatLeaveUnits(0), "0 days");
  assert.equal(formatLeaveUnits(0.5), "0.5 day");
  assert.equal(formatLeaveUnits(1), "1 day");
  assert.equal(formatLeaveUnits(2.5), "2.5 days");
});

test("status and conflict labels are explicit", () => {
  assert.equal(leaveStatusLabel("superseded"), "Superseded");
  assert.equal(
    leaveConflictLabel("full_day_incomplete_attendance"),
    "Incomplete attendance during full-day leave",
  );
});


test("classification labels explain non-chargeable days", () => {
  assert.equal(leaveClassificationLabel("paid_leave"), "Paid leave");
  assert.equal(leaveClassificationLabel("non_chargeable_holiday"), "Holiday — not charged");
});
