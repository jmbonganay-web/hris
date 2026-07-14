import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./queries.ts", import.meta.url), "utf8");

test("policy queries are server-only and newest first", () => {
  assert.match(source, /import "server-only"/);
  assert.match(source, /\.order\("effective_date", \{ ascending: false \}\)/);
});

test("effective policy is resolved on or before the attendance date", () => {
  assert.match(source, /\.lte\("effective_date", attendanceDate\)/);
  assert.match(source, /\.limit\(1\)/);
});

test("policy creator uses an explicit foreign-key relationship", () => {
  assert.match(source, /creator:profiles!attendance_policy_versions_created_by_fkey/);
});
