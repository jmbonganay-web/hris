import test from "node:test";
import assert from "node:assert/strict";
import {
  parseNotificationFilters,
  validateBulkNotificationIds,
  validateNotificationActionUrl,
  validateNotificationRuleInput,
} from "./validation.ts";

const uuid = (digit: string) => `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;
const uuidAt = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

test("notification filters normalize unknown values and page bounds", () => {
  assert.deepEqual(parseNotificationFilters({
    module: "documents",
    status: "active",
    priority: "urgent",
    page: "2",
    query: "  license  ",
    from: "2026-07-01",
    to: "2026-07-31",
  }), {
    module: "documents",
    status: "active",
    priority: "urgent",
    page: 2,
    query: "license",
    from: "2026-07-01",
    to: "2026-07-31",
  });
  assert.equal(parseNotificationFilters({ page: "-9" }).page, 1);
});

test("action URLs allow only approved relative routes", () => {
  assert.equal(validateNotificationActionUrl("/documents").data, "/documents");
  assert.equal(validateNotificationActionUrl("/admin/documents/review?status=pending_review").data, "/admin/documents/review?status=pending_review");
  assert.equal(validateNotificationActionUrl("https://example.com").error, "Notification links must use an approved application route.");
  assert.equal(validateNotificationActionUrl("javascript:alert(1)").error, "Notification links must use an approved application route.");
});

test("rule inputs enforce approved per-type timing", () => {
  assert.equal(validateNotificationRuleInput({
    typeCode: "document_expiring",
    enabled: true,
    initialDelayDays: null,
    repeatIntervalDays: 1,
    escalationAfterDays: 7,
    leadTimeDays: null,
    retentionDays: 90,
    expectedVersion: 1,
    requestId: uuid("1"),
  }).error, "Expiring-document rules require a lead-time value.");

  assert.equal(validateNotificationRuleInput({
    typeCode: "leave_approval_pending",
    enabled: true,
    initialDelayDays: 1,
    repeatIntervalDays: 1,
    escalationAfterDays: 3,
    leadTimeDays: null,
    retentionDays: 90,
    expectedVersion: 1,
    requestId: uuid("1"),
  }).data?.escalationAfterDays, 3);
});

test("bulk actions reject empty, duplicate, excessive, or malformed IDs", () => {
  assert.equal(validateBulkNotificationIds([]).error, "Select at least one notification.");
  assert.equal(validateBulkNotificationIds([uuid("2"), uuid("2")]).error, "Each selected notification must be unique.");
  assert.equal(validateBulkNotificationIds(Array.from({ length: 101 }, (_, index) => uuidAt(index + 1))).error, "Select no more than 100 notifications at a time.");
  assert.equal(validateBulkNotificationIds([uuid("3")]).data?.length, 1);
});
