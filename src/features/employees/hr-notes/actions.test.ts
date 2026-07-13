import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL(
    "../../../app/(dashboard)/employees/[id]/hr-note-actions.ts",
    import.meta.url,
  ),
  "utf8",
);

test("note content is encrypted before insert or update", () => {
  assert.match(source, /encryptSensitiveValue/);
  assert.match(source, /content_ciphertext/);
  assert.doesNotMatch(source, /\.insert\(\{[\s\S]*?\bcontent:/);
  assert.doesNotMatch(source, /\.update\(\{[\s\S]*?\bcontent:/);
});

test("HR Admin ownership is enforced for update and delete", () => {
  assert.match(source, /created_by/);
  assert.match(source, /role !== "super_admin"/);
  assert.match(source, /note\.created_by !== user\.id/);
});

test("deletion is soft and restoration is Super Admin-only", () => {
  assert.match(source, /deleted_at: new Date\(\)\.toISOString\(\)/);
  assert.match(source, /deleted_by: user\.id/);
  assert.match(source, /deleted_at: null/);
  assert.match(source, /requireDeletedHrNoteManager/);
  assert.doesNotMatch(source, /\.delete\(\)/);
});

test("actions never log note plaintext", () => {
  assert.doesNotMatch(source, /console\.(log|error)\([^)]*contentCiphertext/);
  assert.doesNotMatch(source, /console\.(log|error)\([^)]*validation\.data\.content/);
});
