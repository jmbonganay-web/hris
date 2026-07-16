import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source = await readFile(new URL("../../../app/(dashboard)/admin/documents/actions.ts", import.meta.url), "utf8");
test("requirement actions validate and call protected immutable workflows", () => {
  assert.match(source, /validateRequirementInput/);
  for (const rpc of ["create_document_requirement", "revise_document_requirement", "archive_document_requirement", "restore_document_requirement"]) assert.match(source, new RegExp(`rpc\\("${rpc}"`));
});
