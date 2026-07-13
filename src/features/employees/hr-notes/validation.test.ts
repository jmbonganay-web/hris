import test from "node:test";
import assert from "node:assert/strict";
import { validateHrNote } from "./validation.ts";
import {
  decryptSensitiveValue,
  encryptSensitiveValue,
} from "../../../lib/security/sensitive-data.ts";

function form(category: string, content: string) {
  const data = new FormData();
  data.set("category", category);
  data.set("content", content);
  return data;
}

test("all approved HR note categories are accepted", () => {
  for (const category of [
    "general",
    "performance",
    "disciplinary",
    "medical",
    "payroll",
  ]) {
    const result = validateHrNote(form(category, "Approved content"));
    assert.equal(result.data?.category, category);
  }
});

test("unsupported categories are rejected", () => {
  const result = validateHrNote(form("compensation", "Content"));
  assert.equal(result.data, undefined);
  assert.equal(result.state?.fieldErrors?.category, "Choose a valid category.");
});

test("empty and whitespace-only notes are rejected", () => {
  for (const content of ["", "   \n\t "]) {
    const result = validateHrNote(form("general", content));
    assert.equal(result.data, undefined);
    assert.equal(result.state?.fieldErrors?.content, "Note content is required.");
  }
});

test("note content is trimmed and limited to 5000 characters", () => {
  const valid = validateHrNote(form("general", "  useful note  "));
  assert.equal(valid.data?.content, "useful note");

  const invalid = validateHrNote(form("general", "x".repeat(5001)));
  assert.equal(invalid.data, undefined);
  assert.equal(
    invalid.state?.fieldErrors?.content,
    "Note content must be 5,000 characters or fewer.",
  );
});

test("validation state never echoes note content", () => {
  const sentinel = "DO_NOT_LOG_NOTE_TEXT";
  const result = validateHrNote(form("", sentinel));
  assert.doesNotMatch(JSON.stringify(result.state), new RegExp(sentinel));
});

test("HR note content uses authenticated encryption with a fresh IV", () => {
  const key = Buffer.alloc(32, 9);
  const first = encryptSensitiveValue("Confidential note", key);
  const second = encryptSensitiveValue("Confidential note", key);

  assert.notEqual(first, second);
  assert.equal(decryptSensitiveValue(first, key), "Confidential note");
  assert.doesNotMatch(first, /Confidential note/);
});
