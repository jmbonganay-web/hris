import test from "node:test";
import assert from "node:assert/strict";
import { normalizeReviewQueueRows } from "./queries.ts";

test("review queue normalization preserves review-safe fields", () => {
  const result = normalizeReviewQueueRows([{
    document_id: "d1", version_id: "v1", employee_id: "e1", employee_name: "Ana Reyes",
    category_id: "c1", category_name: "Government ID", title: "Passport",
    submitted_at: "2026-07-17T01:00:00Z", expiration_date: "2031-07-17",
    review_status: "pending_review", expected_updated_at: "2026-07-17T01:00:00Z",
  }]);
  assert.deepEqual(result[0], {
    documentId: "d1", versionId: "v1", employeeId: "e1", employeeName: "Ana Reyes",
    categoryId: "c1", categoryName: "Government ID", title: "Passport",
    submittedAt: "2026-07-17T01:00:00Z", expirationDate: "2031-07-17",
    reviewStatus: "pending_review", expectedUpdatedAt: "2026-07-17T01:00:00Z",
  });
});
