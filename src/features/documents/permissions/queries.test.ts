import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDocumentPermissionRows } from "./queries.ts";

test("permission rows include active HR grants and implicit Super Admin rights", () => {
  assert.deepEqual(normalizeDocumentPermissionRows([
    { user_id: "u1", role: "super_admin", permission_code: null, revoked_at: null },
    { user_id: "u2", role: "hr_admin", permission_code: "documents.review", revoked_at: null },
    { user_id: "u2", role: "hr_admin", permission_code: "documents.manage", revoked_at: "2026-07-17T00:00:00Z" },
  ]), [
    { userId: "u1", role: "super_admin", permissions: ["documents.review", "documents.manage"] },
    { userId: "u2", role: "hr_admin", permissions: ["documents.review"] },
  ]);
});
