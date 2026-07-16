import test from "node:test";
import assert from "node:assert/strict";
import {
  canAccessDocumentAdmin,
  canManageDocuments,
  canReviewDocuments,
  canUseVisibility,
} from "./auth.ts";

test("Super Admin implicitly has both document permissions", () => {
  const context = { userId: "u1", role: "super_admin" as const, employeeId: null, permissions: [] };
  assert.equal(canReviewDocuments(context), true);
  assert.equal(canManageDocuments(context), true);
  assert.equal(canAccessDocumentAdmin(context), true);
});

test("HR document grants remain independent", () => {
  const review = { userId: "u2", role: "hr_admin" as const, employeeId: null, permissions: ["documents.review" as const] };
  assert.equal(canReviewDocuments(review), true);
  assert.equal(canManageDocuments(review), false);
});

test("ordinary employees cannot enter document administration", () => {
  const employee = { userId: "u3", role: "employee" as const, employeeId: "e3", permissions: [] };
  assert.equal(canAccessDocumentAdmin(employee), false);
  assert.equal(canUseVisibility(employee, "employee_hr"), true);
  assert.equal(canUseVisibility(employee, "hr_only"), false);
});

test("HR Admin cannot use Super Admin-only visibility", () => {
  const hr = { userId: "u4", role: "hr_admin" as const, employeeId: null, permissions: ["documents.manage" as const] };
  assert.equal(canUseVisibility(hr, "super_admin_only"), false);
});
