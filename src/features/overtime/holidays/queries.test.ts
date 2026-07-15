import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./queries.ts", import.meta.url), "utf8");

test("holiday queries are server-only and use the active pointer relationship", () => {
  assert.match(source, /import "server-only"/);
  assert.match(source, /holiday_calendar_groups_active_version_fkey/);
});

test("holiday history orders immutable revisions newest first", () => {
  assert.match(source, /holiday_calendar_versions/);
  assert.match(source, /order\("revision_number", \{ ascending: false \}\)/);
});
