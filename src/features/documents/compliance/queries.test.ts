import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyExpiration,
  deriveRequirementStatus,
  normalizeManagerComplianceRows,
} from "./queries.ts";

test("expiration classification uses the category threshold", () => {
  assert.equal(classifyExpiration(null, 30, "2026-07-17"), "no_expiration");
  assert.equal(classifyExpiration("2026-07-16", 30, "2026-07-17"), "expired");
  assert.equal(classifyExpiration("2026-08-10", 30, "2026-07-17"), "expiring_soon");
  assert.equal(classifyExpiration("2026-09-01", 30, "2026-07-17"), "valid");
});

test("requirement status prioritizes approved expiration then active submissions", () => {
  assert.equal(deriveRequirementStatus({ requiredCount: 1, approvedValidCount: 1, approvedExpiringCount: 0, approvedExpiredCount: 0, pendingCount: 1, replacementRequestedCount: 0, expiredSatisfies: false }), "approved");
  assert.equal(deriveRequirementStatus({ requiredCount: 1, approvedValidCount: 0, approvedExpiringCount: 1, approvedExpiredCount: 0, pendingCount: 0, replacementRequestedCount: 0, expiredSatisfies: false }), "expiring_soon");
  assert.equal(deriveRequirementStatus({ requiredCount: 1, approvedValidCount: 0, approvedExpiringCount: 0, approvedExpiredCount: 0, pendingCount: 1, replacementRequestedCount: 0, expiredSatisfies: false }), "pending_review");
  assert.equal(deriveRequirementStatus({ requiredCount: 1, approvedValidCount: 0, approvedExpiringCount: 0, approvedExpiredCount: 0, pendingCount: 0, replacementRequestedCount: 1, expiredSatisfies: false }), "replacement_requested");
  assert.equal(deriveRequirementStatus({ requiredCount: 1, approvedValidCount: 0, approvedExpiringCount: 0, approvedExpiredCount: 1, pendingCount: 0, replacementRequestedCount: 0, expiredSatisfies: false }), "expired");
  assert.equal(deriveRequirementStatus({ requiredCount: 1, approvedValidCount: 0, approvedExpiringCount: 0, approvedExpiredCount: 1, pendingCount: 0, replacementRequestedCount: 0, expiredSatisfies: true }), "approved");
});

test("manager rows expose aggregate fields only", () => {
  const result = normalizeManagerComplianceRows([{ employee_id: "e1", employee_name: "Alex Cruz", overall_status: "missing", missing_count: 2, pending_review_count: 1, expiring_soon_count: 0, expired_count: 1 }]);
  assert.deepEqual(result[0], { employeeId: "e1", employeeName: "Alex Cruz", overallStatus: "missing", missingCount: 2, pendingReviewCount: 1, expiringSoonCount: 0, expiredCount: 1 });
  assert.equal("storagePath" in result[0], false);
  assert.equal("referenceNumber" in result[0], false);
});
