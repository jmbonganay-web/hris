import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  decryptSensitiveValue,
  encryptSensitiveValue,
  hashSensitiveValue,
  lastFourAlphanumeric,
  normalizeAccountName,
  normalizeAccountNumber,
  normalizeGovernmentId,
} from "./sensitive-data.ts";

const encryptionKey = randomBytes(32);
const hashKey = randomBytes(32);

test("AES-GCM encrypts and decrypts a protected value", () => {
  const encrypted = encryptSensitiveValue("12-3456789-0", encryptionKey);
  assert.equal(
    decryptSensitiveValue(encrypted, encryptionKey),
    "12-3456789-0",
  );
  assert.doesNotMatch(encrypted, /12-3456789-0/);
});

test("a fresh IV produces different ciphertext", () => {
  const first = encryptSensitiveValue("1234567890", encryptionKey);
  const second = encryptSensitiveValue("1234567890", encryptionKey);
  assert.notEqual(first, second);
});

test("tampered ciphertext fails authentication", () => {
  const encrypted = encryptSensitiveValue("1234567890", encryptionKey);
  const parts = encrypted.split(".");
  parts[2] = `${parts[2].slice(0, -1)}${parts[2].endsWith("A") ? "B" : "A"}`;
  assert.throws(
    () => decryptSensitiveValue(parts.join("."), encryptionKey),
    /Unable to decrypt sensitive value/,
  );
});

test("unknown payload versions are rejected", () => {
  assert.throws(
    () => decryptSensitiveValue("v2.a.b.c", encryptionKey),
    /Unsupported sensitive data version/,
  );
});

test("wrong key cannot decrypt a protected value", () => {
  const encrypted = encryptSensitiveValue("1234567890", encryptionKey);
  assert.throws(
    () => decryptSensitiveValue(encrypted, randomBytes(32)),
    /Unable to decrypt sensitive value/,
  );
});

test("HMAC is stable for normalized identifiers", () => {
  const formatted = hashSensitiveValue(
    normalizeGovernmentId("12-3456789-0"),
    hashKey,
  );
  const plain = hashSensitiveValue(
    normalizeGovernmentId("1234567890"),
    hashKey,
  );
  assert.equal(formatted, plain);
  assert.match(formatted, /^[a-f0-9]{64}$/);
});

test("normalizers preserve approved bank characters and collapse spaces", () => {
  assert.equal(normalizeGovernmentId("12-345 6789-0"), "1234567890");
  assert.equal(normalizeAccountName("  Juan   Dela Cruz "), "Juan Dela Cruz");
  assert.equal(normalizeAccountNumber("  AB-12   345  "), "AB-12 345");
  assert.equal(lastFourAlphanumeric("Juan Dela Cruz"), "Cruz");
});

test("explicit keys must contain exactly 32 bytes", () => {
  assert.throws(
    () => encryptSensitiveValue("value", Buffer.alloc(16)),
    /exactly 32 bytes/,
  );
  assert.throws(
    () => hashSensitiveValue("value", Buffer.alloc(16)),
    /exactly 32 bytes/,
  );
});
