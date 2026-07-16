import test from "node:test";
import assert from "node:assert/strict";
import {
  validateCategoryInput,
  validateDocumentMetadata,
  validatePermissionGrant,
  validateRequirementInput,
  validateReviewDecision,
  validateUploadBatch,
  validateVisibilityOverride,
} from "./validation.ts";

const uuid = (digit: string) => `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;

const pdf = { clientFileKey: "passport", name: "passport.pdf", type: "application/pdf", size: 2048 };

test("visibility overrides cannot loosen category visibility", () => {
  assert.equal(validateVisibilityOverride("employee_hr", "hr_only", "hr_admin").data, "hr_only");
  assert.equal(validateVisibilityOverride("hr_only", "employee_hr", "hr_admin").error, "A visibility override cannot make a document less restrictive.");
  assert.equal(validateVisibilityOverride("employee_hr", "super_admin_only", "hr_admin").error, "Only a Super Admin can use Super Admin-only visibility.");
});

test("single categories reject multi-file batches", () => {
  const result = validateUploadBatch([pdf, { ...pdf, clientFileKey: "back", name: "back.pdf" }], {
    cardinality: "single",
    allowedMimeTypes: ["application/pdf"],
  });
  assert.equal(result.error, "This category accepts one file per upload.");
});

test("uploads enforce MIME, extension, size, and count", () => {
  assert.equal(validateUploadBatch([{ ...pdf, name: "passport.png" }], {
    cardinality: "multiple",
    allowedMimeTypes: ["application/pdf"],
  }).error, "The file extension does not match its file type.");
  assert.equal(validateUploadBatch([{ ...pdf, size: 15 * 1024 * 1024 + 1 }], {
    cardinality: "multiple",
    allowedMimeTypes: ["application/pdf"],
  }).error, "Each file must be 15 MB or smaller.");
  assert.equal(validateUploadBatch(Array.from({ length: 11 }, (_, index) => ({ ...pdf, clientFileKey: String(index) })), {
    cardinality: "multiple",
    allowedMimeTypes: ["application/pdf"],
  }).error, "Upload no more than 10 files at a time.");
});

test("required expiration can use the configured validity period", () => {
  const result = validateDocumentMetadata({
    title: "Professional License",
    referenceNumber: "PRC-123",
    issueDate: "2026-01-15",
    expirationDate: "",
    issuingOrganization: "PRC",
    notes: "",
    tags: ["license"],
    customMetadata: {},
  }, {
    expirationMode: "required",
    defaultValidityMonths: 12,
    customFields: [],
  });
  assert.equal(result.data?.expirationDate, "2027-01-15");
});

test("review reasons and replacement instructions are enforced", () => {
  assert.equal(validateReviewDecision({
    decision: "rejected",
    internalReason: "",
    employeeMessage: "",
    expectedVersionUpdatedAt: "2026-07-17T00:00:00.000Z",
    requestId: uuid("1"),
  }).error, "An internal review reason is required.");
  assert.equal(validateReviewDecision({
    decision: "replacement_requested",
    internalReason: "Image is unreadable.",
    employeeMessage: "",
    expectedVersionUpdatedAt: "2026-07-17T00:00:00.000Z",
    requestId: uuid("1"),
  }).error, "Employee replacement instructions are required.");
});

test("requirements enforce single-cardinality counts and valid targets", () => {
  assert.equal(validateRequirementInput({
    categoryId: uuid("2"),
    cardinality: "single",
    requiredCount: 2,
    expiredSatisfies: false,
    effectiveFrom: "2026-08-01",
    effectiveTo: null,
    targetType: "employee",
    targetId: uuid("3"),
  }).error, "Single-document categories require exactly one approved document.");
  assert.equal(validateRequirementInput({
    categoryId: uuid("2"),
    cardinality: "multiple",
    requiredCount: 1,
    expiredSatisfies: false,
    effectiveFrom: "2026-08-01",
    effectiveTo: null,
    targetType: "all_active_employees",
    targetId: uuid("3"),
  }).error, "All-active-employee requirements cannot specify a target ID.");
});

test("document permission grants are HR Admin-only", () => {
  assert.equal(validatePermissionGrant({ userId: uuid("4"), userRole: "employee", permissionCode: "documents.review" }).error, "Only HR Admin users can receive document permissions.");
  assert.equal(validatePermissionGrant({ userId: uuid("4"), userRole: "hr_admin", permissionCode: "documents.manage" }).data?.permissionCode, "documents.manage");
});

test("category validation rejects unsupported field definitions", () => {
  const result = validateCategoryInput({
    categoryId: null,
    code: "professional_license",
    name: "Professional License",
    description: "Current professional licenses",
    defaultVisibility: "employee_hr",
    employeeUploadEnabled: true,
    cardinality: "multiple",
    allowedMimeTypes: ["application/pdf", "image/jpeg"],
    expirationMode: "required",
    defaultValidityMonths: 12,
    expiringSoonDays: 30,
    retentionMonthsAfterSeparation: 60,
    changeReason: "Initial configuration",
    fields: [{ fieldKey: "license_type", label: "License type", fieldType: "select", isRequired: true, selectOptions: [], employeeVisible: true, displayOrder: 1 }],
  }, "super_admin");
  assert.equal(result.error, "Select fields require at least one option.");
});
