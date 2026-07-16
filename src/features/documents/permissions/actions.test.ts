import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source = await readFile(new URL("../../../app/(dashboard)/admin/documents/actions.ts", import.meta.url), "utf8");
test("permission administration is Super Admin-only", () => {
  assert.match(source, /requireSuperAdmin\(\)/);
  assert.match(source, /validatePermissionGrant/);
  assert.match(source, /rpc\("grant_document_permission"/);
  assert.match(source, /rpc\("revoke_document_permission"/);
});
