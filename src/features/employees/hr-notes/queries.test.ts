import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("./queries.ts", import.meta.url),
  "utf8",
);

test("HR note queries are server-only and exclude deleted notes by default", () => {
  assert.match(source, /import "server-only"/);
  assert.match(source, /\.is\("deleted_at", null\)/);
});

test("queries decrypt note content without logging it", () => {
  assert.match(source, /decryptSensitiveValue/);
  assert.doesNotMatch(source, /console\.(log|error)\([^)]*content_ciphertext/);
  assert.doesNotMatch(source, /console\.(log|error)\([^)]*content\b/);
});

test("profile relations use explicit foreign-key hints", () => {
  assert.match(source, /author:profiles!employee_hr_notes_created_by_fkey/);
  assert.match(source, /updater:profiles!employee_hr_notes_updated_by_fkey/);
  assert.match(source, /deleter:profiles!employee_hr_notes_deleted_by_fkey/);
});
