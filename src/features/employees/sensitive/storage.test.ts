import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  buildSensitiveStoragePayload,
  type SensitiveStorageRow,
} from "./storage.ts";
import type { SensitiveDetailsInput } from "./types.ts";

const encryptionKey = randomBytes(32);
const hashKey = randomBytes(32);

const existing: SensitiveStorageRow = {
  employee_id: "employee-1",
  sss_ciphertext: "old-sss",
  sss_hash: "old-hash",
  sss_last4: "7890",
  philhealth_ciphertext: null,
  philhealth_hash: null,
  philhealth_last4: null,
  pagibig_ciphertext: null,
  pagibig_hash: null,
  pagibig_last4: null,
  tin_ciphertext: null,
  tin_hash: null,
  tin_last4: null,
  bank_name: "Old Bank",
  account_name_ciphertext: "old-name",
  account_name_last4: "Cruz",
  account_number_ciphertext: "old-account",
  account_number_last4: "1234",
  payroll_account_type: "payroll",
};

function baseInput(): SensitiveDetailsInput {
  return {
    sss_number: { mode: "preserve" },
    philhealth_number: { mode: "preserve" },
    pagibig_number: { mode: "preserve" },
    tin: { mode: "preserve" },
    bank_name: "New Bank",
    account_name: { mode: "preserve" },
    account_number: { mode: "preserve" },
    payroll_account_type: "savings",
  };
}

test("preserve keeps the complete existing protected group", () => {
  const payload = buildSensitiveStoragePayload(
    "employee-1",
    existing,
    baseInput(),
    "actor-1",
    encryptionKey,
    hashKey,
  );
  assert.equal(payload.sss_ciphertext, "old-sss");
  assert.equal(payload.sss_hash, "old-hash");
  assert.equal(payload.sss_last4, "7890");
});

test("clear nulls the complete protected group", () => {
  const input = baseInput();
  input.sss_number = { mode: "clear" };
  const payload = buildSensitiveStoragePayload(
    "employee-1",
    existing,
    input,
    "actor-1",
    encryptionKey,
    hashKey,
  );
  assert.equal(payload.sss_ciphertext, null);
  assert.equal(payload.sss_hash, null);
  assert.equal(payload.sss_last4, null);
});

test("replace encrypts with a fresh payload and writes hash and last four", () => {
  const input = baseInput();
  input.sss_number = {
    mode: "replace",
    value: "1234567890",
    normalized: "1234567890",
  };
  const payload = buildSensitiveStoragePayload(
    "employee-1",
    existing,
    input,
    "actor-1",
    encryptionKey,
    hashKey,
  );
  assert.match(String(payload.sss_ciphertext), /^v1\./);
  assert.notEqual(payload.sss_ciphertext, "old-sss");
  assert.match(String(payload.sss_hash), /^[a-f0-9]{64}$/);
  assert.equal(payload.sss_last4, "7890");
});

test("bank account replacement has no uniqueness hash", () => {
  const input = baseInput();
  input.account_number = {
    mode: "replace",
    value: "AB-1234",
    normalized: "AB-1234",
  };
  const payload = buildSensitiveStoragePayload(
    "employee-1",
    existing,
    input,
    "actor-1",
    encryptionKey,
    hashKey,
  );
  assert.match(String(payload.account_number_ciphertext), /^v1\./);
  assert.equal(payload.account_number_last4, "1234");
  assert.equal("account_number_hash" in payload, false);
});
