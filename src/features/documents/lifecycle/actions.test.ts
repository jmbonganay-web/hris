import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source = await readFile(new URL("../../../app/(dashboard)/admin/documents/actions.ts", import.meta.url), "utf8");
test("archive, restore, version restoration, and deletion use protected workflows", () => {
  for (const rpc of ["restore_document_version", "archive_employee_document", "restore_employee_document", "permanently_delete_employee_document"]) assert.match(source, new RegExp(`rpc\\("${rpc}"`));
  assert.match(source, /removeDocumentObjects/);
  assert.match(source, /deletion_reason/);
});
