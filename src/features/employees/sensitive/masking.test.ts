import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyMaskedSensitiveDetails,
  maskSensitiveField,
} from "./masking.ts";

test("government masks expose only the final four characters", () => {
  assert.equal(maskSensitiveField("sss_number", "7890"), "••••••7890");
  assert.equal(
    maskSensitiveField("philhealth_number", "9012"),
    "••••••••9012",
  );
  assert.equal(
    maskSensitiveField("pagibig_number", "9012"),
    "••••••••9012",
  );
  assert.equal(maskSensitiveField("tin", "9000"), "•••••9000");
});

test("bank protected values use a fixed safe mask", () => {
  assert.equal(maskSensitiveField("account_name", "Cruz"), "••••••••Cruz");
  assert.equal(
    maskSensitiveField("account_number", "1234"),
    "••••••••1234",
  );
});

test("missing values display Not provided", () => {
  assert.equal(maskSensitiveField("sss_number", null), "Not provided");
  assert.equal(
    emptyMaskedSensitiveDetails("employee-1").sss_number.hasValue,
    false,
  );
});
