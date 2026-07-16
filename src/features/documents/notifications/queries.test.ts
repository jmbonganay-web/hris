import test from "node:test";
import assert from "node:assert/strict";
import { normalizeNotificationRows } from "./queries.ts";

test("document notifications expose safe content and read state", () => {
  const result = normalizeNotificationRows([{ id: "n1", type: "document_replacement_requested", title: "Replacement requested", body: "Upload a clearer copy.", resource_type: "employee_document", resource_id: "d1", created_at: "2026-07-17T01:00:00Z", read_at: null }]);
  assert.deepEqual(result[0], {
    id: "n1", type: "document_replacement_requested", title: "Replacement requested",
    body: "Upload a clearer copy.", resourceType: "employee_document", resourceId: "d1",
    createdAt: "2026-07-17T01:00:00Z", isRead: false,
  });
});
