import test from "node:test";
import assert from "node:assert/strict";
import { canPreviewMime, normalizeEmployeeDocumentRow, resolveEffectiveVisibility } from "./queries.ts";

test("visibility override can only preserve or increase restriction", () => {
  assert.equal(resolveEffectiveVisibility("employee_hr", "hr_only"), "hr_only");
  assert.equal(resolveEffectiveVisibility("hr_only", null), "hr_only");
  assert.throws(() => resolveEffectiveVisibility("hr_only", "employee_hr"), /DOCUMENT_INVALID_VISIBILITY/);
});

test("DOCX is download-only while PDF and images are previewable", () => {
  assert.equal(canPreviewMime("application/pdf"), true);
  assert.equal(canPreviewMime("image/jpeg"), true);
  assert.equal(canPreviewMime("image/png"), true);
  assert.equal(canPreviewMime("application/vnd.openxmlformats-officedocument.wordprocessingml.document"), false);
});

test("employee list normalization excludes storage paths and private review reasons", () => {
  const result = normalizeEmployeeDocumentRow({
    document_id: "d1", title: "Government ID", category_name: "Government ID",
    effective_visibility: "employee_hr", review_status: "approved", expiration_status: "valid",
    issue_date: "2026-01-01", expiration_date: "2031-01-01", version_number: 1,
    updated_at: "2026-07-17T00:00:00Z", can_access_file: true,
    storage_path: "forbidden", internal_reason: "forbidden",
  });
  assert.deepEqual(result, {
    id: "d1", title: "Government ID", categoryName: "Government ID",
    visibility: "employee_hr", reviewStatus: "approved", expirationStatus: "valid",
    issueDate: "2026-01-01", expirationDate: "2031-01-01", versionNumber: 1,
    updatedAt: "2026-07-17T00:00:00Z", canAccessFile: true,
  });
});
