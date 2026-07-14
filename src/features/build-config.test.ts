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
