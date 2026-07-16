import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../../next.config.js", import.meta.url),
  "utf8",
);

test("production builds cap worker concurrency for stable page generation", () => {
  assert.match(source, /experimental:\s*\{[\s\S]*cpus:\s*2/);
});

test("Turbopack is scoped to the project instead of an ancestor lockfile", () => {
  assert.match(source, /turbopack:\s*\{[\s\S]*root:\s*__dirname/);
});

test("README documents Phase 6 migration and private leave bucket", async () => {
  const readme = await readFile(new URL("../../README.md", import.meta.url), "utf8");
  assert.match(readme, /202607160001_leave_management\.sql/);
  assert.match(readme, /leave-documents/);
  assert.match(readme, /private/i);
  assert.match(readme, /Asia\/Manila/);
});
