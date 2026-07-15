import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./queries.ts", import.meta.url), "utf8");

test("overtime policy queries are server-only and explicitly join creators", () => {
  assert.match(source, /import "server-only"/);
  assert.match(source, /overtime_policy_versions/);
  assert.match(source, /profiles!overtime_policy_versions_created_by_fkey/);
});

test("policy query separates current, upcoming, and history", () => {
  assert.match(source, /effective_date <= companyDate/);
  assert.match(source, /effective_date > companyDate/);
});
