import test from "node:test";
import assert from "node:assert/strict";
import { validateOvertimePolicyVersion } from "./validation.ts";

function form(date: string, minutes: string, reason = "") {
  const data = new FormData();
  data.set("effective_date", date);
  data.set("minimum_qualifying_minutes", minutes);
  data.set("change_reason", reason);
  return data;
}

test("overtime policy requires an integer from one through 480", () => {
  assert.equal(validateOvertimePolicyVersion(form("", "30"), "2026-07-15").data, undefined);
  assert.equal(validateOvertimePolicyVersion(form("2026-07-15", "0"), "2026-07-15").data, undefined);
  assert.equal(validateOvertimePolicyVersion(form("2026-07-15", "30.5"), "2026-07-15").data, undefined);
  assert.equal(validateOvertimePolicyVersion(form("2026-07-15", "481"), "2026-07-15").data, undefined);
  assert.equal(
    validateOvertimePolicyVersion(form("2026-07-15", "480"), "2026-07-15").data?.minimumQualifyingMinutes,
    480,
  );
});

test("backdated overtime policy requires a private reason", () => {
  assert.equal(validateOvertimePolicyVersion(form("2026-07-14", "30"), "2026-07-15").data, undefined);
  assert.equal(
    validateOvertimePolicyVersion(form("2026-07-14", "30", "  correction  "), "2026-07-15").data?.changeReason,
    "correction",
  );
});

test("private policy reasons are not echoed in retry state", () => {
  const sentinel = "PRIVATE_OVERTIME_POLICY_REASON";
  const result = validateOvertimePolicyVersion(form("", "30", sentinel), "2026-07-15");
  assert.doesNotMatch(JSON.stringify(result.state), new RegExp(sentinel));
});
