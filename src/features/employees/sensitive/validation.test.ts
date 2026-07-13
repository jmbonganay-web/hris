import test from "node:test";
import assert from "node:assert/strict";
import { validateSensitiveDetails } from "./validation.ts";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

test("formatted government identifiers normalize correctly", () => {
  const result = validateSensitiveDetails(form({
    sss_number: "12-3456789-0",
    philhealth_number: "12-345678901-2",
    pagibig_number: "1234-5678-9012",
    tin: "123-456-789-000",
  }));

  assert.equal(result.data?.sss_number.mode, "replace");
  assert.deepEqual(result.data?.sss_number, {
    mode: "replace",
    value: "1234567890",
    normalized: "1234567890",
  });
  assert.equal(result.data?.tin.mode, "replace");
});

test("blank protected fields preserve current values", () => {
  const result = validateSensitiveDetails(form({}));
  assert.equal(result.data?.sss_number.mode, "preserve");
  assert.equal(result.data?.account_number.mode, "preserve");
});

test("explicit clear is separate from replacement", () => {
  const clear = validateSensitiveDetails(form({ clear_sss_number: "on" }));
  assert.equal(clear.data?.sss_number.mode, "clear");

  const conflict = validateSensitiveDetails(form({
    sss_number: "12-3456789-0",
    clear_sss_number: "on",
  }));
  assert.equal(
    conflict.state?.fieldErrors?.sss_number,
    "Choose either a replacement value or Clear, not both.",
  );
});

test("government identifiers reject letters and incorrect lengths", () => {
  const letters = validateSensitiveDetails(form({
    sss_number: "12-ABC6789-0",
  }));
  assert.equal(
    letters.state?.fieldErrors?.sss_number,
    "SSS number may contain only digits, spaces, and hyphens.",
  );

  const length = validateSensitiveDetails(form({ philhealth_number: "123" }));
  assert.equal(
    length.state?.fieldErrors?.philhealth_number,
    "PhilHealth number must contain exactly 12 digits.",
  );
});

test("bank limits and payroll account type are enforced", () => {
  const result = validateSensitiveDetails(form({
    account_number: "1234/5678",
    payroll_account_type: "investment",
  }));
  assert.equal(
    result.state?.fieldErrors?.account_number,
    "Account number may contain only letters, digits, spaces, and hyphens.",
  );
  assert.equal(
    result.state?.fieldErrors?.payroll_account_type,
    "Select a valid payroll account type.",
  );
});

test("validation state never echoes protected plaintext", () => {
  const secret = "12-ABC6789-0";
  const result = validateSensitiveDetails(form({
    sss_number: secret,
    bank_name: "Test Bank",
  }));
  assert.doesNotMatch(JSON.stringify(result.state), new RegExp(secret));
  assert.equal(result.state?.values?.bank_name, "Test Bank");
});
