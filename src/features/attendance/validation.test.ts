import test from "node:test";
import assert from "node:assert/strict";
import {
  validateClockNote,
  validateCorrectionRequest,
  validateHrAttendance,
  validateReviewDecision,
} from "./validation.ts";

function data(values: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

test("optional clock notes trim to null and reject more than 1000 characters", () => {
  assert.equal(validateClockNote(data({ note: "   " })).data?.note, null);
  assert.equal(validateClockNote(data({ note: "  handoff complete  " })).data?.note, "handoff complete");
  assert.equal(
    validateClockNote(data({ note: "x".repeat(1001) })).state?.fieldErrors?.note,
    "Note must be 1,000 characters or fewer.",
  );
});

test("HR attendance requires date, clock-in, and a correction reason", () => {
  const result = validateHrAttendance(data({
    attendance_date: "",
    clock_in_local: "",
    clock_out_local: "",
    reason: "",
  }));
  assert.equal(result.data, undefined);
  assert.equal(result.state?.fieldErrors?.attendance_date, "Attendance date is required.");
  assert.equal(result.state?.fieldErrors?.clock_in_local, "Clock-in time is required.");
  assert.equal(result.state?.fieldErrors?.reason, "A correction reason is required.");
});

test("correction request fields follow the selected request type", () => {
  const result = validateCorrectionRequest(data({
    attendance_date: "2026-07-14",
    request_type: "add_missing_clock_out",
    requested_clock_in_local: "",
    requested_clock_out_local: "",
    reason: "Forgot to clock out",
    employee_note: "",
  }));
  assert.equal(
    result.state?.fieldErrors?.requested_clock_out_local,
    "Requested clock-out time is required.",
  );
});

test("review decision accepts approve or reject and never echoes review text in errors", () => {
  assert.equal(validateReviewDecision(data({ decision: "approve", review_note: "" })).data?.decision, "approve");
  const sentinel = "DO_NOT_LOG_REVIEW_TEXT";
  const invalid = validateReviewDecision(data({ decision: "hold", review_note: sentinel }));
  assert.doesNotMatch(JSON.stringify(invalid.state), new RegExp(sentinel));
});
