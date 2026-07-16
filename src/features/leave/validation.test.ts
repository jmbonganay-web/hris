import test from "node:test";
import assert from "node:assert/strict";
import {
  validateLeaveAdjustment,
  validateLeaveCancellation,
  validateLeaveDraft,
  validateLeaveReview,
  validateLeaveTypeVersion,
  validateLeaveYearOpening,
} from "./validation.ts";

const employeeId = "11111111-1111-4111-8111-111111111111";
const leaveTypeId = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const revisionId = "44444444-4444-4444-8444-444444444444";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

test("paid leave must be balance tracked", () => {
  const result = validateLeaveTypeVersion(
    form({
      leave_type_id: leaveTypeId,
      effective_from: "2026-08-01",
      name: "Vacation Leave",
      description: "Paid vacation",
      is_active: "true",
      is_paid: "true",
      is_balance_tracked: "false",
      default_annual_units: "0",
      carryover_enabled: "false",
      carryover_cap_units: "",
      employee_note_required: "false",
      document_required: "false",
      document_required_min_units: "",
      change_reason: "",
    }),
    "2026-07-16",
  );
  assert.equal(result.data, undefined);
  assert.equal(
    result.state?.fieldErrors?.is_balance_tracked,
    "Paid leave must track a balance.",
  );
});

test("balance-exempt leave rejects allocation and carryover", () => {
  const result = validateLeaveTypeVersion(
    form({
      leave_type_id: leaveTypeId,
      effective_from: "2026-08-01",
      name: "Unpaid Leave",
      description: "",
      is_active: "true",
      is_paid: "false",
      is_balance_tracked: "false",
      default_annual_units: "5",
      carryover_enabled: "true",
      carryover_cap_units: "2",
      employee_note_required: "false",
      document_required: "false",
      document_required_min_units: "",
      change_reason: "",
    }),
    "2026-07-16",
  );
  assert.equal(result.data, undefined);
  assert.equal(
    result.state?.fieldErrors?.default_annual_units,
    "Balance-exempt leave must use 0 annual units.",
  );
  assert.equal(
    result.state?.fieldErrors?.carryover_enabled,
    "Balance-exempt leave cannot carry over units.",
  );
});

test("leave units require exact half-day increments", () => {
  const result = validateLeaveAdjustment(
    form({
      employee_id: employeeId,
      leave_type_id: leaveTypeId,
      leave_year: "2026",
      units: "1.25",
      reason: "Correction",
    }),
    2026,
  );
  assert.equal(result.data, undefined);
  assert.equal(result.state?.fieldErrors?.units, "Units must use 0.5-day increments.");
});

test("multi-day half-day request is rejected", () => {
  const result = validateLeaveDraft(
    form({
      employee_id: employeeId,
      leave_type_id: leaveTypeId,
      start_date: "2026-08-01",
      end_date: "2026-08-02",
      duration_mode: "first_half",
      employee_note: "",
      replaces_request_group_id: "",
    }),
  );
  assert.equal(result.data, undefined);
  assert.equal(
    result.state?.fieldErrors?.duration_mode,
    "Half-day leave must use one calendar date.",
  );
});

test("draft date range cannot cross a calendar year", () => {
  const result = validateLeaveDraft(
    form({
      employee_id: employeeId,
      leave_type_id: leaveTypeId,
      start_date: "2026-12-31",
      end_date: "2027-01-01",
      duration_mode: "full_day",
      employee_note: "",
      replaces_request_group_id: "",
    }),
  );
  assert.equal(result.data, undefined);
  assert.equal(result.state?.fieldErrors?.end_date, "A request cannot cross calendar years.");
});

test("rejection requires review text while approval permits an empty note", () => {
  const approve = validateLeaveReview(
    form({
      request_group_id: requestId,
      expected_request_revision_id: revisionId,
      expected_status: "pending",
      expected_day_fingerprint: "abc123",
      expected_chargeable_units: "2.0",
      decision: "approve",
      review_text: "",
    }),
  );
  assert.equal(approve.data?.reviewText, null);

  const reject = validateLeaveReview(
    form({
      request_group_id: requestId,
      expected_request_revision_id: revisionId,
      expected_status: "pending",
      expected_day_fingerprint: "abc123",
      expected_chargeable_units: "2.0",
      decision: "reject",
      review_text: "",
    }),
  );
  assert.equal(reject.data, undefined);
  assert.equal(
    reject.state?.fieldErrors?.review_text,
    "A rejection reason is required.",
  );
});

test("approved cancellation and balance adjustment require private reasons", () => {
  const cancellation = validateLeaveCancellation(
    form({ request_group_id: requestId, expected_status: "approved", reason: "" }),
  );
  assert.equal(cancellation.data, undefined);
  assert.equal(
    cancellation.state?.fieldErrors?.reason,
    "A cancellation reason is required.",
  );

  const adjustment = validateLeaveAdjustment(
    form({
      employee_id: employeeId,
      leave_type_id: leaveTypeId,
      leave_year: "2026",
      units: "0.5",
      reason: "",
    }),
    2026,
  );
  assert.equal(adjustment.data, undefined);
  assert.equal(adjustment.state?.fieldErrors?.reason, "An adjustment reason is required.");
});

test("year opening accepts the current and next leave year", () => {
  assert.equal(
    validateLeaveYearOpening(form({ leave_year: "2027" }), 2026).data?.leaveYear,
    2027,
  );
  assert.equal(
    validateLeaveYearOpening(form({ leave_year: "2025" }), 2026).state?.fieldErrors?.leave_year,
    "Choose the current or next leave year.",
  );
});
