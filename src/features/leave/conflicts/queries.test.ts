import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./queries.ts", import.meta.url), "utf8");

test("conflict query uses HR-only projection RPC", () => {
  assert.match(source, /get_leave_attendance_conflicts/);
  assert.doesNotMatch(source, /from\("leave_attendance_conflicts"\)/);
});
