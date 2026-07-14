import test from "node:test";
import assert from "node:assert/strict";
import { validateAttendancePolicyVersion } from "./validation.ts";

function form(date: string, grace: string, reason = "") {
  const data = new FormData();
  data.set("effective_date", date);
  data.set("late_grace_minutes", grace);
  data.set("change_reason", reason);
  return data;
}

test("policy requires date and an integer grace from zero through 120", () => {
  assert.equal(validateAttendancePolicyVersion(form("", "10"), "2026-07-15").data, undefined);
  assert.equal(validateAttendancePolicyVersion(form("2026-07-15", "2.5"), "2026-07-15").data, undefined);
  assert.equal(validateAttendancePolicyVersion(form("2026-07-15", "-1"), "2026-07-15").data, undefined);
  assert.equal(validateAttendancePolicyVersion(form("2026-07-15", "121"), "2026-07-15").data, undefined);
  assert.equal(validateAttendancePolicyVersion(form("2026-07-15", "120"), "2026-07-15").data?.lateGraceMinutes, 120);
});

test("past-effective policy requires a trimmed reason", () => {
  assert.equal(validateAttendancePolicyVersion(form("2026-07-14", "10"), "2026-07-15").data, undefined);
  assert.equal(validateAttendancePolicyVersion(form("2026-07-14", "10", "  policy correction  "), "2026-07-15").data?.changeReason, "policy correction");
  assert.equal(validateAttendancePolicyVersion(form("2026-07-15", "10"), "2026-07-15").data?.changeReason, null);
});

test("policy reason is limited and never echoed in retry state", () => {
  const sentinel = "PRIVATE_POLICY_REASON";
  const tooLong = validateAttendancePolicyVersion(form("2026-07-14", "10", "x".repeat(1001)), "2026-07-15");
  assert.equal(tooLong.data, undefined);
  const invalid = validateAttendancePolicyVersion(form("", "10", sentinel), "2026-07-15");
  assert.doesNotMatch(JSON.stringify(invalid.state), new RegExp(sentinel));
});
