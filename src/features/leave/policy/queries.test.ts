import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./queries.ts", import.meta.url), "utf8");

test("policy queries remain server-only and use explicit relationships", () => {
  assert.match(source, /import "server-only"/);
  assert.match(source, /leave_type_versions/);
  assert.match(source, /leave_type_id/);
  assert.doesNotMatch(source, /select\("\*"\)/);
});

test("active options exclude inactive resolved versions", () => {
  assert.match(source, /getActiveLeaveTypeOptions/);
  assert.match(source, /is_active/);
  assert.match(source, /effective_from/);
});


test("active options map request policy requirements", () => {
  assert.match(source, /employeeNoteRequired: Boolean\(row\.employee_note_required\)/);
  assert.match(source, /documentRequired: Boolean\(row\.document_required\)/);
  assert.match(source, /documentRequiredMinUnits/);
});
