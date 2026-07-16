import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source = await readFile(new URL("../../../app/(dashboard)/admin/documents/actions.ts", import.meta.url), "utf8");
test("review actions require reviewer permission and call the protected RPC", () => {
  assert.match(source, /requireDocumentReviewer\(\)/);
  assert.match(source, /validateReviewDecision/);
  assert.match(source, /rpc\("review_employee_document"/);
  assert.match(source, /expected_version_updated_at/);
  assert.match(source, /p_request_id/);
});
