import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source = await readFile(new URL("../../../app/(dashboard)/admin/documents/actions.ts", import.meta.url), "utf8");
test("category actions require manage permission and use immutable-version RPCs", () => {
  assert.match(source, /requireDocumentManager\(\)/);
  for (const rpc of ["create_document_category", "create_document_category_version", "archive_document_category", "restore_document_category"]) assert.match(source, new RegExp(`rpc\\("${rpc}"`));
});
