# Phase 7 Employee Document Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build secure employee document management with category-versioned rules, private uploads, immutable file history, employee submission review, granular HR permissions, compliance requirements, manager-safe status summaries, audit history, and in-app notifications.

**Architecture:** PostgreSQL remains the source of truth for document identities, category versions, review transitions, permission grants, compliance, notifications, and lifecycle actions. A separate private Supabase Storage bucket holds files under server-selected opaque paths; short-lived signed upload and access URLs are issued only after server authorization. Next.js server modules expose typed domain operations and render separate employee, HR-review, HR-configuration, and manager-safe experiences using the existing App Router and Balanced spacing system.

**Tech Stack:** Next.js 16.2.10 App Router, React 19.1.1, TypeScript 5.7.2, Supabase PostgreSQL/Auth/RLS/Storage, PostgreSQL PL/pgSQL, Node built-in test runner, Lucide React, existing shared CSS system.

## Global Constraints

- Phase 7 covers employee personnel documents only; company-wide policy libraries are excluded.
- Files use a separate private Supabase Storage bucket named exactly `employee-documents`.
- Supported MIME types are exactly PDF, JPG/JPEG, PNG, and DOCX.
- Each file is at most 15 MB, and one upload session contains at most 10 files.
- Every file in a multi-file upload becomes a separate document record.
- Single-cardinality categories accept one non-archived document record per employee and category and one file per upload.
- Category identities are stable; used category configurations are superseded with immutable version rows rather than edited in place.
- Submitted document versions, completed reviews, and audit events are immutable.
- One document record may have only one active approved version.
- Visibility is ordered `employee_hr < hr_only < super_admin_only`; a document override may only increase restriction.
- Only Super Admins may set `super_admin_only`, grant permissions, revoke permissions, or permanently delete files.
- Super Admins implicitly have `documents.review` and `documents.manage`.
- Only HR Admins may receive explicit document permission grants.
- `documents.review` and `documents.manage` are independent.
- Reviewers cannot review a submission associated with their own employee profile.
- Rejection and replacement requests require private internal reasons; replacement requests also require employee-safe instructions.
- Managers receive aggregate compliance status for current direct reports only and never receive file or sensitive metadata access.
- Expiration modes are exactly `required`, `optional`, and `disabled`.
- Requirement precedence is exactly employee, job title, department, employment type, then all active employees.
- Same-specificity requirement ties resolve by latest effective date, newest creation timestamp, then stable identifier.
- Ordinary HR workflows archive; permanent deletion is Super Admin-only, reason-required, idempotent, and leaves an audit tombstone.
- PDF, JPG, and PNG may be previewed; DOCX is download-only.
- Upload sessions expire after 10 minutes and finalization is rejected after expiry; signed preview and download URLs expire after 60 seconds.
- Every access-link issuance is authorized and audited; raw object paths and signed URLs never enter list responses or audit payloads.
- Notifications are in-app only and event-driven; scheduled expiration reminders remain excluded.
- Upload finalization, review, restoration, archive/restore, permission changes, and deletion use idempotency keys or request identifiers.
- All privileged PostgreSQL functions use `SECURITY DEFINER`, `set search_path = pg_catalog, public`, explicit role/permission checks, row locking where state can race, stable error codes, and revoked default execution privileges.
- Existing Phase 1–6 behavior and the approved Balanced spacing system must remain compatible.
- Applied migrations are never silently rewritten; fixes discovered after application use forward-only patch migrations.

---

## Verified baseline

Commands run against commit `610f9a1` before planning:

```text
npm ci: completed
npm test: 575 passed, 0 failed
npx tsc --noEmit: exit 0
npm run build: completed successfully
Current latest migration: supabase/migrations/202607160004_fix_employee_manager_summary.sql
Current /documents route: placeholder page
Current storage precedent: private leave-documents upload and signed-download routes
```

## Scope decomposition

Phase 7 remains one implementation plan because the included areas share one authoritative document contract:

```text
category configuration
  -> requirement targeting
  -> upload authorization
  -> private object verification
  -> immutable document/version finalization
  -> review or immediate HR activation
  -> active-version selection
  -> compliance projection
  -> safe employee/manager/HR views
  -> audit and notifications
```

Each task below ends in a testable commit. Database structure and contracts land first; server workflows land before UI; route integration and packaging happen last.

## File map

### Create

```text
supabase/migrations/202607170001_employee_document_management.sql

src/features/documents/constants.ts
src/features/documents/types.ts
src/features/documents/errors.ts
src/features/documents/presentation.ts
src/features/documents/presentation.test.ts
src/features/documents/validation.ts
src/features/documents/validation.test.ts
src/features/documents/auth.ts
src/features/documents/auth.test.ts
src/features/documents/migration.test.ts
src/features/documents/security.test.ts
src/features/documents/concurrency.test.ts
src/features/documents/e2e.test.ts
src/features/documents/ui.test.ts

src/features/documents/categories/queries.ts
src/features/documents/categories/queries.test.ts
src/features/documents/categories/actions.test.ts
src/features/documents/requirements/queries.ts
src/features/documents/requirements/queries.test.ts
src/features/documents/requirements/actions.test.ts
src/features/documents/compliance/queries.ts
src/features/documents/compliance/queries.test.ts
src/features/documents/permissions/queries.ts
src/features/documents/permissions/queries.test.ts
src/features/documents/permissions/actions.test.ts
src/features/documents/uploads/storage.ts
src/features/documents/uploads/storage.test.ts
src/features/documents/uploads/client.ts
src/features/documents/uploads/client.test.ts
src/features/documents/documents/queries.ts
src/features/documents/documents/queries.test.ts
src/features/documents/reviews/queries.ts
src/features/documents/reviews/queries.test.ts
src/features/documents/reviews/actions.test.ts
src/features/documents/notifications/queries.ts
src/features/documents/notifications/queries.test.ts
src/features/documents/lifecycle/actions.test.ts

src/components/documents/document-status-badge.tsx
src/components/documents/document-summary-cards.tsx
src/components/documents/document-requirement-list.tsx
src/components/documents/document-list.tsx
src/components/documents/document-upload-form.tsx
src/components/documents/document-upload-progress.tsx
src/components/documents/document-metadata-fields.tsx
src/components/documents/document-detail-panel.tsx
src/components/documents/document-version-history.tsx
src/components/documents/document-access-button.tsx
src/components/documents/document-review-form.tsx
src/components/documents/document-review-queue.tsx
src/components/documents/document-category-form.tsx
src/components/documents/document-category-version-list.tsx
src/components/documents/document-requirement-form.tsx
src/components/documents/document-permission-form.tsx
src/components/documents/document-archive-form.tsx
src/components/documents/document-restore-version-form.tsx
src/components/documents/document-delete-form.tsx
src/components/documents/document-notification-list.tsx
src/components/documents/manager-document-compliance.tsx

src/app/(dashboard)/documents/loading.tsx
src/app/(dashboard)/documents/error.tsx
src/app/(dashboard)/documents/[documentId]/page.tsx
src/app/(dashboard)/documents/actions.ts

src/app/(dashboard)/admin/documents/page.tsx
src/app/(dashboard)/admin/documents/loading.tsx
src/app/(dashboard)/admin/documents/error.tsx
src/app/(dashboard)/admin/documents/actions.ts
src/app/(dashboard)/admin/documents/review/page.tsx
src/app/(dashboard)/admin/documents/review/[documentId]/page.tsx
src/app/(dashboard)/admin/documents/employees/[employeeId]/page.tsx
src/app/(dashboard)/admin/documents/categories/page.tsx
src/app/(dashboard)/admin/documents/categories/[categoryId]/page.tsx
src/app/(dashboard)/admin/documents/requirements/page.tsx
src/app/(dashboard)/admin/documents/permissions/page.tsx

src/app/api/documents/uploads/prepare/route.ts
src/app/api/documents/uploads/finalize/route.ts
src/app/api/documents/versions/[versionId]/access/route.ts
```

### Modify

```text
src/app/(dashboard)/documents/page.tsx
src/app/(dashboard)/layout.tsx
src/components/app-shell.tsx
src/components/sidebar.tsx
src/components/employees/profile/profile-tabs.tsx
src/app/(dashboard)/employees/[id]/page.tsx
src/app/(dashboard)/dashboard/page.tsx
src/app/(dashboard)/settings/page.tsx
src/app/globals.css
src/lib/utils.ts
.env.example
README.md
docs/superpowers/specs/2026-07-17-phase-7-employee-document-management-design.md
```

## Shared public contracts

Create these unions before any query, action, route, or component consumes them:

```ts
export const documentVisibilityValues = ["employee_hr", "hr_only", "super_admin_only"] as const;
export type DocumentVisibility = (typeof documentVisibilityValues)[number];

export const documentCardinalityValues = ["single", "multiple"] as const;
export type DocumentCardinality = (typeof documentCardinalityValues)[number];

export const documentExpirationModes = ["required", "optional", "disabled"] as const;
export type DocumentExpirationMode = (typeof documentExpirationModes)[number];

export const documentReviewStatuses = [
  "draft",
  "pending_review",
  "approved",
  "rejected",
  "replacement_requested",
] as const;
export type DocumentReviewStatus = (typeof documentReviewStatuses)[number];

export const documentSources = ["employee", "hr"] as const;
export type DocumentSource = (typeof documentSources)[number];

export const documentPermissionCodes = ["documents.review", "documents.manage"] as const;
export type DocumentPermissionCode = (typeof documentPermissionCodes)[number];

export const documentRequirementTargetTypes = [
  "all_active_employees",
  "department",
  "job_title",
  "employment_type",
  "employee",
] as const;
export type DocumentRequirementTargetType = (typeof documentRequirementTargetTypes)[number];

export const documentRequirementStatuses = [
  "missing",
  "pending_review",
  "replacement_requested",
  "approved",
  "expiring_soon",
  "expired",
  "not_required",
] as const;
export type DocumentRequirementStatus = (typeof documentRequirementStatuses)[number];

export const documentExpirationStatuses = ["valid", "expiring_soon", "expired", "no_expiration"] as const;
export type DocumentExpirationStatus = (typeof documentExpirationStatuses)[number];

export const documentCustomFieldTypes = ["text", "long_text", "number", "date", "boolean", "select"] as const;
export type DocumentCustomFieldType = (typeof documentCustomFieldTypes)[number];
```

The protected workflow names are fixed:

```text
create_document_category
create_document_category_version
archive_document_category
restore_document_category
create_document_requirement
revise_document_requirement
archive_document_requirement
restore_document_requirement
grant_document_permission
revoke_document_permission
create_document_upload_session
finalize_employee_document_upload
finalize_hr_document_upload
submit_document_draft
review_employee_document
restore_document_version
archive_employee_document
restore_employee_document
permanently_delete_employee_document
get_employee_document_compliance
get_manager_document_compliance
mark_notification_read
```

Stable error codes are fixed:

```text
DOCUMENT_PERMISSION_DENIED
DOCUMENT_CATEGORY_NOT_FOUND
DOCUMENT_CATEGORY_ARCHIVED
DOCUMENT_CATEGORY_STALE
DOCUMENT_INVALID_VISIBILITY
DOCUMENT_INVALID_METADATA
DOCUMENT_INVALID_FILE
DOCUMENT_FILE_TOO_LARGE
DOCUMENT_FILE_COUNT_EXCEEDED
DOCUMENT_CARDINALITY_CONFLICT
DOCUMENT_UPLOAD_SESSION_INVALID
DOCUMENT_UPLOAD_SESSION_EXPIRED
DOCUMENT_UPLOAD_INCOMPLETE
DOCUMENT_VERSION_STALE
DOCUMENT_INVALID_STATUS
DOCUMENT_SELF_REVIEW_FORBIDDEN
DOCUMENT_REVIEW_ALREADY_COMPLETED
DOCUMENT_REJECTION_REASON_REQUIRED
DOCUMENT_REPLACEMENT_INSTRUCTIONS_REQUIRED
DOCUMENT_ACTIVE_VERSION_CONFLICT
DOCUMENT_REQUIREMENT_CONFLICT
DOCUMENT_PERMISSION_GRANT_INVALID
DOCUMENT_ARCHIVED
DOCUMENT_DELETE_REASON_REQUIRED
DOCUMENT_ACCESS_DENIED
DOCUMENT_NOT_PREVIEWABLE
DOCUMENT_NOT_FOUND
```

## Task 1: Document contracts, safe errors, presentation, and validation

**Files:**
- Create: `src/features/documents/constants.ts`
- Create: `src/features/documents/types.ts`
- Create: `src/features/documents/errors.ts`
- Create: `src/features/documents/presentation.ts`
- Create: `src/features/documents/presentation.test.ts`
- Create: `src/features/documents/validation.ts`
- Create: `src/features/documents/validation.test.ts`

**Interfaces:**
- Consumes: `AppRole` from `src/features/employees/types.ts`.
- Produces: all unions in **Shared public contracts**, `DocumentActionState`, `DocumentCategoryInput`, `DocumentUploadManifest`, `DocumentCoreMetadata`, `DocumentCustomFieldDefinition`, `mapDocumentError`, `documentStatusLabel`, `documentExpirationLabel`, `validateVisibilityOverride`, `validateCategoryInput`, `validateUploadBatch`, `validateDocumentMetadata`, `validateReviewDecision`, `validateRequirementInput`, and `validatePermissionGrant`.

- [ ] **Step 1: Write failing contract, presentation, and validation tests**

Create `src/features/documents/presentation.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  documentExpirationLabel,
  documentStatusLabel,
  requirementStatusLabel,
} from "./presentation.ts";

 test("document status labels are explicit", () => {
  assert.equal(documentStatusLabel("pending_review"), "Pending review");
  assert.equal(documentStatusLabel("replacement_requested"), "Replacement requested");
  assert.equal(documentExpirationLabel("no_expiration"), "No expiration");
  assert.equal(requirementStatusLabel("expiring_soon"), "Expiring soon");
});
```

Create `src/features/documents/validation.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests and confirm the modules are missing**

Run:

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/documents/presentation.test.ts \
  src/features/documents/validation.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for the document modules.

- [ ] **Step 3: Create constants, unions, DTOs, and safe errors**

Create `src/features/documents/constants.ts`:

```ts
export const DOCUMENT_BUCKET = "employee-documents";
export const DOCUMENT_MAX_FILE_COUNT = 10;
export const DOCUMENT_MAX_FILE_BYTES = 15 * 1024 * 1024;
export const DOCUMENT_UPLOAD_SESSION_TTL_SECONDS = 10 * 60;
export const DOCUMENT_ACCESS_URL_TTL_SECONDS = 60;
export const DOCUMENT_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;
export const DOCUMENT_ALLOWED_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "docx"] as const;
export const DOCUMENT_PERMISSION_CODES = ["documents.review", "documents.manage"] as const;
export const DOCUMENT_INTERNAL_REASON_MAX_LENGTH = 1000;
export const DOCUMENT_EMPLOYEE_MESSAGE_MAX_LENGTH = 1000;
export const DOCUMENT_NOTES_MAX_LENGTH = 2000;
export const DOCUMENT_TITLE_MAX_LENGTH = 160;
export const DOCUMENT_REFERENCE_MAX_LENGTH = 160;
export const DOCUMENT_ISSUER_MAX_LENGTH = 200;
export const DOCUMENT_TAG_MAX_COUNT = 20;
export const DOCUMENT_TAG_MAX_LENGTH = 40;
```

Create `src/features/documents/types.ts` with the shared unions and these exact DTOs:

```ts
import type { AppRole } from "@/features/employees/types";

export const documentVisibilityValues = ["employee_hr", "hr_only", "super_admin_only"] as const;
export type DocumentVisibility = (typeof documentVisibilityValues)[number];
export const documentCardinalityValues = ["single", "multiple"] as const;
export type DocumentCardinality = (typeof documentCardinalityValues)[number];
export const documentExpirationModes = ["required", "optional", "disabled"] as const;
export type DocumentExpirationMode = (typeof documentExpirationModes)[number];
export const documentReviewStatuses = ["draft", "pending_review", "approved", "rejected", "replacement_requested"] as const;
export type DocumentReviewStatus = (typeof documentReviewStatuses)[number];
export const documentSources = ["employee", "hr"] as const;
export type DocumentSource = (typeof documentSources)[number];
export const documentPermissionCodes = ["documents.review", "documents.manage"] as const;
export type DocumentPermissionCode = (typeof documentPermissionCodes)[number];
export const documentRequirementTargetTypes = ["all_active_employees", "department", "job_title", "employment_type", "employee"] as const;
export type DocumentRequirementTargetType = (typeof documentRequirementTargetTypes)[number];
export const documentRequirementStatuses = ["missing", "pending_review", "replacement_requested", "approved", "expiring_soon", "expired", "not_required"] as const;
export type DocumentRequirementStatus = (typeof documentRequirementStatuses)[number];
export const documentExpirationStatuses = ["valid", "expiring_soon", "expired", "no_expiration"] as const;
export type DocumentExpirationStatus = (typeof documentExpirationStatuses)[number];
export const documentCustomFieldTypes = ["text", "long_text", "number", "date", "boolean", "select"] as const;
export type DocumentCustomFieldType = (typeof documentCustomFieldTypes)[number];

export type DocumentActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
  correlationId?: string;
};

export type DocumentCustomFieldDefinition = {
  fieldKey: string;
  label: string;
  fieldType: DocumentCustomFieldType;
  isRequired: boolean;
  selectOptions: string[];
  employeeVisible: boolean;
  displayOrder: number;
};

export type DocumentCategoryInput = {
  categoryId: string | null;
  code: string;
  name: string;
  description: string;
  defaultVisibility: DocumentVisibility;
  employeeUploadEnabled: boolean;
  cardinality: DocumentCardinality;
  allowedMimeTypes: string[];
  expirationMode: DocumentExpirationMode;
  defaultValidityMonths: number | null;
  expiringSoonDays: number;
  retentionMonthsAfterSeparation: number | null;
  changeReason: string;
  fields: DocumentCustomFieldDefinition[];
};

export type DocumentUploadManifest = {
  clientFileKey: string;
  name: string;
  type: string;
  size: number;
};

export type DocumentCoreMetadata = {
  title: string;
  referenceNumber: string;
  issueDate: string;
  expirationDate: string;
  issuingOrganization: string;
  notes: string;
  tags: string[];
  customMetadata: Record<string, unknown>;
};

export type DocumentPermissionContext = {
  userId: string;
  role: AppRole;
  employeeId: string | null;
  permissions: DocumentPermissionCode[];
};
```

Create `src/features/documents/errors.ts`:

```ts
const safeDocumentErrors: ReadonlyArray<readonly [string, string]> = [
  ["DOCUMENT_PERMISSION_DENIED", "You do not have permission to perform this document action."],
  ["DOCUMENT_CATEGORY_NOT_FOUND", "The selected document category could not be found."],
  ["DOCUMENT_CATEGORY_ARCHIVED", "The selected document category is archived."],
  ["DOCUMENT_CATEGORY_STALE", "The category configuration changed. Reload and try again."],
  ["DOCUMENT_INVALID_VISIBILITY", "The selected document visibility is not allowed."],
  ["DOCUMENT_INVALID_METADATA", "Review the document details and correct the highlighted fields."],
  ["DOCUMENT_INVALID_FILE", "One or more files are invalid."],
  ["DOCUMENT_FILE_TOO_LARGE", "Each file must be 15 MB or smaller."],
  ["DOCUMENT_FILE_COUNT_EXCEEDED", "Upload no more than 10 files at a time."],
  ["DOCUMENT_CARDINALITY_CONFLICT", "This category accepts only one active document."],
  ["DOCUMENT_UPLOAD_SESSION_INVALID", "The upload session is not valid. Start the upload again."],
  ["DOCUMENT_UPLOAD_SESSION_EXPIRED", "The upload session expired. Start the upload again."],
  ["DOCUMENT_UPLOAD_INCOMPLETE", "The upload could not be completed. No official records were saved."],
  ["DOCUMENT_VERSION_STALE", "This document changed while you were working. Reload and try again."],
  ["DOCUMENT_INVALID_STATUS", "This action is not allowed for the current document status."],
  ["DOCUMENT_SELF_REVIEW_FORBIDDEN", "You cannot review your own document submission."],
  ["DOCUMENT_REVIEW_ALREADY_COMPLETED", "Another reviewer has already processed this submission."],
  ["DOCUMENT_REJECTION_REASON_REQUIRED", "An internal review reason is required."],
  ["DOCUMENT_REPLACEMENT_INSTRUCTIONS_REQUIRED", "Employee replacement instructions are required."],
  ["DOCUMENT_ACTIVE_VERSION_CONFLICT", "The active document version changed. Reload and try again."],
  ["DOCUMENT_REQUIREMENT_CONFLICT", "A conflicting document requirement already exists."],
  ["DOCUMENT_PERMISSION_GRANT_INVALID", "This document permission cannot be granted to that user."],
  ["DOCUMENT_ARCHIVED", "This document is archived."],
  ["DOCUMENT_DELETE_REASON_REQUIRED", "A permanent deletion reason is required."],
  ["DOCUMENT_ACCESS_DENIED", "You do not have access to this document file."],
  ["DOCUMENT_NOT_PREVIEWABLE", "This file type is available for download only."],
  ["DOCUMENT_NOT_FOUND", "The requested document could not be found."],
];

export function mapDocumentError(message: string, fallback = "The document action could not be completed.") {
  return safeDocumentErrors.find(([code]) => message.includes(code))?.[1] ?? fallback;
}
```

- [ ] **Step 4: Implement deterministic presentation and validation**

Create `src/features/documents/presentation.ts` with complete label maps for every union:

```ts
import type { DocumentExpirationStatus, DocumentRequirementStatus, DocumentReviewStatus } from "./types";

const statusLabels: Record<DocumentReviewStatus, string> = {
  draft: "Draft",
  pending_review: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  replacement_requested: "Replacement requested",
};
const expirationLabels: Record<DocumentExpirationStatus, string> = {
  valid: "Valid",
  expiring_soon: "Expiring soon",
  expired: "Expired",
  no_expiration: "No expiration",
};
const requirementLabels: Record<DocumentRequirementStatus, string> = {
  missing: "Missing",
  pending_review: "Pending review",
  replacement_requested: "Replacement requested",
  approved: "Approved",
  expiring_soon: "Expiring soon",
  expired: "Expired",
  not_required: "Not required",
};

export function documentStatusLabel(value: DocumentReviewStatus) { return statusLabels[value]; }
export function documentExpirationLabel(value: DocumentExpirationStatus) { return expirationLabels[value]; }
export function requirementStatusLabel(value: DocumentRequirementStatus) { return requirementLabels[value]; }
```

Create `src/features/documents/validation.ts`. Use these exact exported signatures and return shape:

```ts
import type { AppRole } from "@/features/employees/types";
import {
  DOCUMENT_ALLOWED_MIME_TYPES,
  DOCUMENT_MAX_FILE_BYTES,
  DOCUMENT_MAX_FILE_COUNT,
} from "./constants";
import type {
  DocumentCardinality,
  DocumentCategoryInput,
  DocumentCoreMetadata,
  DocumentCustomFieldDefinition,
  DocumentPermissionCode,
  DocumentRequirementTargetType,
  DocumentUploadManifest,
  DocumentVisibility,
} from "./types";

type ValidationResult<T> = { data?: T; error?: string; fieldErrors?: Record<string, string> };
const visibilityRank: Record<DocumentVisibility, number> = { employee_hr: 0, hr_only: 1, super_admin_only: 2 };

export function validateVisibilityOverride(categoryDefault: DocumentVisibility, override: DocumentVisibility | null, role: AppRole): ValidationResult<DocumentVisibility> {
  const effective = override ?? categoryDefault;
  if (visibilityRank[effective] < visibilityRank[categoryDefault]) return { error: "A visibility override cannot make a document less restrictive." };
  if (effective === "super_admin_only" && role !== "super_admin") return { error: "Only a Super Admin can use Super Admin-only visibility." };
  return { data: effective };
}

export function validateUploadBatch(files: DocumentUploadManifest[], config: { cardinality: DocumentCardinality; allowedMimeTypes: string[] }): ValidationResult<DocumentUploadManifest[]> {
  if (files.length < 1) return { error: "Select at least one file." };
  if (files.length > DOCUMENT_MAX_FILE_COUNT) return { error: "Upload no more than 10 files at a time." };
  if (config.cardinality === "single" && files.length !== 1) return { error: "This category accepts one file per upload." };
  const extensionForMime: Record<string, string[]> = {
    "application/pdf": ["pdf"],
    "image/jpeg": ["jpg", "jpeg"],
    "image/png": ["png"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  };
  for (const file of files) {
    if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > DOCUMENT_MAX_FILE_BYTES) return { error: "Each file must be 15 MB or smaller." };
    if (!DOCUMENT_ALLOWED_MIME_TYPES.includes(file.type as (typeof DOCUMENT_ALLOWED_MIME_TYPES)[number]) || !config.allowedMimeTypes.includes(file.type)) return { error: "This file type is not allowed for the selected category." };
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!extensionForMime[file.type]?.includes(extension)) return { error: "The file extension does not match its file type." };
    if (!file.clientFileKey.trim() || !file.name.trim()) return { error: "Every file requires a stable client key and filename." };
  }
  if (new Set(files.map((file) => file.clientFileKey)).size !== files.length) return { error: "Every file in the upload must have a unique client key." };
  return { data: files };
}

export function validateCategoryInput(input: DocumentCategoryInput, role: AppRole): ValidationResult<DocumentCategoryInput> {
  if (!/^[a-z][a-z0-9_]{2,63}$/.test(input.code)) return { error: "Category codes use lowercase letters, numbers, and underscores." };
  if (!input.name.trim()) return { error: "A category name is required." };
  if (input.defaultVisibility === "super_admin_only" && role !== "super_admin") return { error: "Only a Super Admin can create Super Admin-only categories." };
  if (input.allowedMimeTypes.length < 1 || input.allowedMimeTypes.some((mime) => !DOCUMENT_ALLOWED_MIME_TYPES.includes(mime as (typeof DOCUMENT_ALLOWED_MIME_TYPES)[number]))) return { error: "Choose at least one supported file type." };
  if (input.expirationMode === "disabled" && input.defaultValidityMonths !== null) return { error: "Disabled expiration cannot define a validity period." };
  if (input.defaultValidityMonths !== null && (!Number.isInteger(input.defaultValidityMonths) || input.defaultValidityMonths < 1)) return { error: "Validity months must be a positive whole number." };
  for (const field of input.fields) {
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(field.fieldKey)) return { error: "Custom field keys use lowercase letters, numbers, and underscores." };
    if (field.fieldType === "select" && field.selectOptions.length < 1) return { error: "Select fields require at least one option." };
    if (field.fieldType !== "select" && field.selectOptions.length > 0) return { error: "Only select fields may define options." };
  }
  if (new Set(input.fields.map((field) => field.fieldKey)).size !== input.fields.length) return { error: "Custom field keys must be unique." };
  return { data: { ...input, name: input.name.trim(), description: input.description.trim(), changeReason: input.changeReason.trim() } };
}

export function validateDocumentMetadata(input: DocumentCoreMetadata, config: { expirationMode: "required" | "optional" | "disabled"; defaultValidityMonths: number | null; customFields: DocumentCustomFieldDefinition[] }): ValidationResult<DocumentCoreMetadata & { expirationDate: string }> {
  if (!input.title.trim()) return { error: "A document title is required." };
  let expirationDate = input.expirationDate;
  if (config.expirationMode === "disabled" && expirationDate) return { error: "This category does not use expiration dates." };
  if (!expirationDate && config.expirationMode === "required" && config.defaultValidityMonths && input.issueDate) {
    const calculated = new Date(`${input.issueDate}T00:00:00.000Z`);
    calculated.setUTCMonth(calculated.getUTCMonth() + config.defaultValidityMonths);
    expirationDate = calculated.toISOString().slice(0, 10);
  }
  if (config.expirationMode === "required" && !expirationDate) return { error: "This document requires an expiration date." };
  if (input.issueDate && expirationDate && input.issueDate > expirationDate) return { error: "The issue date cannot be after the expiration date." };
  for (const field of config.customFields) {
    const value = input.customMetadata[field.fieldKey];
    if (field.isRequired && (value === undefined || value === null || value === "")) return { error: `${field.label} is required.` };
    if (field.fieldType === "select" && value !== undefined && !field.selectOptions.includes(String(value))) return { error: `${field.label} has an invalid option.` };
  }
  return { data: { ...input, title: input.title.trim(), expirationDate } };
}

export function validateReviewDecision(input: { decision: "approved" | "rejected" | "replacement_requested"; internalReason: string; employeeMessage: string; expectedVersionUpdatedAt: string; requestId: string }): ValidationResult<typeof input> {
  if (!input.requestId || !input.expectedVersionUpdatedAt) return { error: "The review request is stale." };
  if ((input.decision === "rejected" || input.decision === "replacement_requested") && !input.internalReason.trim()) return { error: "An internal review reason is required." };
  if (input.decision === "replacement_requested" && !input.employeeMessage.trim()) return { error: "Employee replacement instructions are required." };
  return { data: { ...input, internalReason: input.internalReason.trim(), employeeMessage: input.employeeMessage.trim() } };
}

export function validateRequirementInput(input: { categoryId: string; cardinality: DocumentCardinality; requiredCount: number; expiredSatisfies: boolean; effectiveFrom: string; effectiveTo: string | null; targetType: DocumentRequirementTargetType; targetId: string | null }): ValidationResult<typeof input> {
  if (!Number.isInteger(input.requiredCount) || input.requiredCount < 1) return { error: "Required document count must be a positive whole number." };
  if (input.cardinality === "single" && input.requiredCount !== 1) return { error: "Single-document categories require exactly one approved document." };
  if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) return { error: "The requirement end date cannot be before its start date." };
  if (input.targetType === "all_active_employees" && input.targetId !== null) return { error: "All-active-employee requirements cannot specify a target ID." };
  if (input.targetType !== "all_active_employees" && !input.targetId) return { error: "The selected target requires a target ID." };
  return { data: input };
}

export function validatePermissionGrant(input: { userId: string; userRole: AppRole; permissionCode: DocumentPermissionCode }): ValidationResult<{ userId: string; permissionCode: DocumentPermissionCode }> {
  if (input.userRole !== "hr_admin") return { error: "Only HR Admin users can receive document permissions." };
  return { data: { userId: input.userId, permissionCode: input.permissionCode } };
}
```

- [ ] **Step 5: Run document contract tests**

Run:

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/documents/presentation.test.ts \
  src/features/documents/validation.test.ts
```

Expected: 9 tests pass, 0 fail.

- [ ] **Step 6: Commit the shared contracts**

```bash
git add src/features/documents
git commit -m "feat: add employee document domain contracts"
```

## Task 2: Database tables, constraints, indexes, bucket, and immutable guards

**Files:**
- Create: `supabase/migrations/202607170001_employee_document_management.sql`
- Create: `src/features/documents/migration.test.ts`
- Create: `src/features/documents/security.test.ts`

**Interfaces:**
- Consumes: table names, union values, stable errors, and limits from Task 1.
- Produces: the document schema, private bucket, immutable-history triggers, supporting views, indexes, and RLS foundation consumed by every later task.

- [ ] **Step 1: Write failing migration-definition tests**

Create `src/features/documents/migration.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../../../supabase/migrations/202607170001_employee_document_management.sql", import.meta.url), "utf8");
const tables = [
  "document_categories",
  "document_category_versions",
  "document_category_fields",
  "employee_documents",
  "employee_document_versions",
  "document_reviews",
  "document_requirements",
  "document_requirement_targets",
  "document_permission_grants",
  "document_upload_sessions",
  "document_upload_session_files",
  "document_lifecycle_actions",
  "document_audit_logs",
  "document_deletion_tombstones",
  "notifications",
];

 test("migration creates every document table", () => {
  for (const table of tables) assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, "i"));
});

 test("migration creates stable identities and immutable versions", () => {
  assert.match(sql, /document_categories_code_unique/i);
  assert.match(sql, /document_category_versions_number_unique/i);
  assert.match(sql, /employee_document_versions_number_unique/i);
  assert.match(sql, /document_reviews_version_unique/i);
  assert.match(sql, /prevent_document_immutable_mutation/i);
  for (const table of ["document_category_versions", "document_category_fields", "document_reviews", "document_audit_logs", "document_deletion_tombstones"]) {
    assert.match(sql, new RegExp(`before update or delete on public\\.${table}`, "i"));
  }
});

 test("migration constrains approved enums and global limits", () => {
  for (const value of [
    "employee_hr", "hr_only", "super_admin_only", "single", "multiple",
    "required", "optional", "disabled", "draft", "pending_review", "approved",
    "rejected", "replacement_requested", "employee", "hr", "documents.review",
    "documents.manage", "all_active_employees", "department", "job_title",
    "employment_type", "pending", "finalized", "cancelled", "expired", "failed",
  ]) assert.match(sql, new RegExp(`'${value.replace(".", "\\.")}'`, "i"));
  assert.match(sql, /15 \* 1024 \* 1024/i);
  assert.match(sql, /manifest_count[^;]*<= 10/is);
});

 test("migration creates a private employee-documents bucket", () => {
  assert.match(sql, /insert into storage\.buckets/i);
  assert.match(sql, /'employee-documents'/i);
  assert.match(sql, /public\s*,\s*file_size_limit/i);
  assert.match(sql, /false\s*,\s*15 \* 1024 \* 1024/i);
  for (const mime of ["application/pdf", "image/jpeg", "image/png", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]) assert.match(sql, new RegExp(mime.replaceAll("/", "\\/"), "i"));
});

 test("migration includes supporting indexes and one transaction", () => {
  for (const name of [
    "document_category_versions_current_idx",
    "employee_documents_employee_category_idx",
    "employee_document_versions_review_queue_idx",
    "document_requirements_effective_idx",
    "document_permission_grants_active_unique",
    "document_upload_sessions_expiry_idx",
    "notifications_recipient_unread_idx",
  ]) assert.match(sql, new RegExp(name, "i"));
  assert.equal((sql.toLowerCase().match(/^begin;/gm) ?? []).length, 1);
  assert.equal((sql.toLowerCase().match(/^commit;/gm) ?? []).length, 1);
  assert.equal((sql.toLowerCase().match(/notify pgrst, 'reload schema';/g) ?? []).length, 1);
});
```

Create `src/features/documents/security.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../../../supabase/migrations/202607170001_employee_document_management.sql", import.meta.url), "utf8");

 test("document tables enable RLS and deny direct mutation", () => {
  for (const table of [
    "document_categories", "document_category_versions", "document_category_fields",
    "employee_documents", "employee_document_versions", "document_reviews",
    "document_requirements", "document_requirement_targets", "document_permission_grants",
    "document_upload_sessions", "document_upload_session_files", "document_lifecycle_actions",
    "document_audit_logs", "document_deletion_tombstones", "notifications",
  ]) assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  assert.match(sql, /revoke all on public\.employee_document_versions from authenticated/i);
  assert.match(sql, /revoke all on public\.document_reviews from authenticated/i);
});

 test("storage policies do not grant arbitrary list or insert access", () => {
  assert.doesNotMatch(sql, /create policy[^;]+on storage\.objects[^;]+for select[^;]+bucket_id = 'employee-documents'/is);
  assert.doesNotMatch(sql, /create policy[^;]+on storage\.objects[^;]+for insert[^;]+bucket_id = 'employee-documents'/is);
});

 test("audit payload guards reject signed URLs and storage credentials", () => {
  assert.match(sql, /assert_safe_document_audit_payload/i);
  assert.match(sql, /signed_url/i);
  assert.match(sql, /storage_path/i);
  assert.match(sql, /service_role/i);
});
```

- [ ] **Step 2: Run migration tests and verify the SQL file is missing**

Run:

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/documents/migration.test.ts \
  src/features/documents/security.test.ts
```

Expected: FAIL with `ENOENT` for `202607170001_employee_document_management.sql`.

- [ ] **Step 3: Create schema, constraints, indexes, and immutable triggers**

Create `supabase/migrations/202607170001_employee_document_management.sql` with one `begin`/`commit` transaction. Define the fifteen tables listed by the test, using UUID primary keys, `auth.users` actor references, and existing employee/organization foreign keys. Include these exact invariants:

```sql
create unique index document_category_versions_number_unique
  on public.document_category_versions(category_id, version_number);

create unique index employee_document_versions_number_unique
  on public.employee_document_versions(document_id, version_number);

create unique index document_reviews_version_unique
  on public.document_reviews(document_version_id);

create unique index document_permission_grants_active_unique
  on public.document_permission_grants(user_id, permission_code)
  where revoked_at is null;

create unique index employee_documents_single_active_unique
  on public.employee_documents(employee_id, category_id)
  where archived_at is null and cardinality_snapshot = 'single';

alter table public.employee_documents
  add constraint employee_documents_active_version_fkey
  foreign key (active_version_id) references public.employee_document_versions(id)
  deferrable initially deferred;

alter table public.employee_document_versions
  add constraint employee_document_versions_size_check
  check (size_bytes between 1 and 15 * 1024 * 1024);

alter table public.document_upload_sessions
  add constraint document_upload_sessions_manifest_count_check
  check (manifest_count between 1 and 10);
```

Create `prevent_document_immutable_mutation()` and attach it to category versions, category fields, submitted document versions, reviews, audit rows, and deletion tombstones. Submitted versions may change only through protected functions that set a transaction-local guard:

```sql
create or replace function public.prevent_document_immutable_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if current_setting('app.document_workflow', true) <> 'on' then
    raise exception 'DOCUMENT_VERSION_STALE';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
```

Add a deferred constraint trigger that verifies `employee_documents.active_version_id` belongs to the same document and references a version with `review_status = 'approved'`.

- [ ] **Step 4: Add the private bucket, RLS, safe views, and audit payload guard**

Insert the private bucket idempotently:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'employee-documents',
  'employee-documents',
  false,
  15 * 1024 * 1024,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
```

Enable RLS on all document tables. Grant authenticated users only safe `SELECT` access through explicit policies for their own notifications and approved safe projections; direct insert/update/delete on authoritative document tables remains revoked. Do not add bucket-wide client `SELECT` or `INSERT` storage policies because signed upload/access URLs are issued by trusted server code.

Create these safe views with `security_invoker = true` where supported:

```text
document_current_category_versions
document_employee_safe_list
document_hr_review_queue
document_active_requirement_rules
```

Create `assert_safe_document_audit_payload(jsonb)` and reject keys containing `signed_url`, `storage_path`, `service_role`, `raw_file`, or `access_token` before inserting audit JSON.

End the migration with exactly one:

```sql
notify pgrst, 'reload schema';
commit;
```

- [ ] **Step 5: Run migration and security tests**

Run:

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/documents/migration.test.ts \
  src/features/documents/security.test.ts
```

Expected: all migration-definition and security-definition tests pass.

- [ ] **Step 6: Commit the database foundation**

```bash
git add supabase/migrations/202607170001_employee_document_management.sql src/features/documents/migration.test.ts src/features/documents/security.test.ts
git commit -m "feat: add employee document database foundation"
```

## Task 3: Protected PostgreSQL workflows, permission grants, audit, notifications, and seed categories

**Files:**
- Modify: `supabase/migrations/202607170001_employee_document_management.sql`
- Modify: `src/features/documents/migration.test.ts`
- Modify: `src/features/documents/security.test.ts`
- Create: `src/features/documents/concurrency.test.ts`

**Interfaces:**
- Consumes: database tables and error codes from Tasks 1–2.
- Produces: the fixed RPC surface from **Shared public contracts**, deterministic review/activation transactions, idempotent notification/audit writes, safe compliance functions, and editable starter categories.

- [ ] **Step 1: Extend failing tests for every protected workflow**

Append to `src/features/documents/migration.test.ts`:

```ts
const publicRpcs = [
  "create_document_category",
  "create_document_category_version",
  "archive_document_category",
  "restore_document_category",
  "create_document_requirement",
  "revise_document_requirement",
  "archive_document_requirement",
  "restore_document_requirement",
  "grant_document_permission",
  "revoke_document_permission",
  "create_document_upload_session",
  "finalize_employee_document_upload",
  "finalize_hr_document_upload",
  "submit_document_draft",
  "review_employee_document",
  "restore_document_version",
  "archive_employee_document",
  "restore_employee_document",
  "permanently_delete_employee_document",
  "get_employee_document_compliance",
  "get_manager_document_compliance",
  "mark_notification_read",
];

const stableErrors = [
  "DOCUMENT_PERMISSION_DENIED", "DOCUMENT_CATEGORY_NOT_FOUND", "DOCUMENT_CATEGORY_ARCHIVED",
  "DOCUMENT_CATEGORY_STALE", "DOCUMENT_INVALID_VISIBILITY", "DOCUMENT_INVALID_METADATA",
  "DOCUMENT_INVALID_FILE", "DOCUMENT_FILE_TOO_LARGE", "DOCUMENT_FILE_COUNT_EXCEEDED",
  "DOCUMENT_CARDINALITY_CONFLICT", "DOCUMENT_UPLOAD_SESSION_INVALID",
  "DOCUMENT_UPLOAD_SESSION_EXPIRED", "DOCUMENT_UPLOAD_INCOMPLETE", "DOCUMENT_VERSION_STALE",
  "DOCUMENT_INVALID_STATUS", "DOCUMENT_SELF_REVIEW_FORBIDDEN",
  "DOCUMENT_REVIEW_ALREADY_COMPLETED", "DOCUMENT_REJECTION_REASON_REQUIRED",
  "DOCUMENT_REPLACEMENT_INSTRUCTIONS_REQUIRED", "DOCUMENT_ACTIVE_VERSION_CONFLICT",
  "DOCUMENT_REQUIREMENT_CONFLICT", "DOCUMENT_PERMISSION_GRANT_INVALID", "DOCUMENT_ARCHIVED",
  "DOCUMENT_DELETE_REASON_REQUIRED", "DOCUMENT_ACCESS_DENIED", "DOCUMENT_NOT_PREVIEWABLE",
  "DOCUMENT_NOT_FOUND",
];

 test("migration creates every protected document workflow", () => {
  for (const rpc of publicRpcs) assert.match(sql, new RegExp(`create or replace function public\\.${rpc}\\s*\\(`, "i"));
});

 test("migration exposes every stable document error", () => {
  for (const code of stableErrors) assert.match(sql, new RegExp(code, "i"));
});

 test("migration seeds editable prototype categories", () => {
  for (const code of [
    "employment_contract", "government_id", "birth_certificate", "training_certificate",
    "professional_license", "medical_record", "disciplinary_record",
    "investigation_record", "other_employment_form",
  ]) assert.match(sql, new RegExp(`'${code}'`, "i"));
});
```

Append to `src/features/documents/security.test.ts`:

```ts
 test("privileged functions lock search path and revoke default execution", () => {
  for (const rpc of [
    "grant_document_permission", "create_document_upload_session", "review_employee_document",
    "restore_document_version", "permanently_delete_employee_document",
    "get_manager_document_compliance",
  ]) {
    const definition = sql.match(new RegExp(`create or replace function public\\.${rpc}\\s*\\([\\s\\S]*?\\$\\$;`, "i"))?.[0] ?? "";
    assert.match(definition, /security definer/i);
    assert.match(definition, /set search_path = pg_catalog, public/i);
    assert.match(sql, new RegExp(`revoke all on function public\\.${rpc}`, "i"));
  }
});

 test("manager compliance function returns aggregate fields only", () => {
  const definition = sql.match(/create or replace function public\.get_manager_document_compliance[\s\S]*?\$\$;/i)?.[0] ?? "";
  for (const field of ["employee_id", "employee_name", "overall_status", "missing_count", "pending_review_count", "expiring_soon_count", "expired_count"]) assert.match(definition, new RegExp(field, "i"));
  for (const forbidden of ["storage_path", "original_filename", "reference_number", "notes", "issuing_organization", "custom_metadata", "internal_reason"]) assert.doesNotMatch(definition, new RegExp(forbidden, "i"));
});
```

Create `src/features/documents/concurrency.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../../../supabase/migrations/202607170001_employee_document_management.sql", import.meta.url), "utf8");

function functionSql(name: string) {
  return sql.match(new RegExp(`create or replace function public\\.${name}\\s*\\([\\s\\S]*?\\$\\$;`, "i"))?.[0] ?? "";
}

 test("review locks the document and version and rejects stale state", () => {
  const definition = functionSql("review_employee_document");
  assert.match(definition, /for update/i);
  assert.match(definition, /DOCUMENT_VERSION_STALE/i);
  assert.match(definition, /DOCUMENT_REVIEW_ALREADY_COMPLETED/i);
  assert.match(definition, /DOCUMENT_SELF_REVIEW_FORBIDDEN/i);
  assert.match(definition, /active_version_id/i);
});

 test("idempotent workflows persist request identifiers", () => {
  for (const name of [
    "finalize_employee_document_upload", "finalize_hr_document_upload", "review_employee_document",
    "restore_document_version", "archive_employee_document", "restore_employee_document",
    "grant_document_permission", "revoke_document_permission", "permanently_delete_employee_document",
  ]) {
    const definition = functionSql(name);
    assert.match(definition, /p_request_id/i);
    assert.match(definition, /document_lifecycle_actions/i);
  }
});

 test("approval atomically replaces the active approved version", () => {
  const definition = functionSql("review_employee_document");
  assert.match(definition, /review_status = 'approved'/i);
  assert.match(definition, /active_version_id = v_version\.id/i);
  assert.match(definition, /document_reviews/i);
  assert.match(definition, /notifications/i);
  assert.match(definition, /document_audit_logs/i);
});
```

- [ ] **Step 2: Run the workflow tests and verify they fail**

Run:

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/documents/migration.test.ts \
  src/features/documents/security.test.ts \
  src/features/documents/concurrency.test.ts
```

Expected: FAIL because the protected functions and seed rows do not exist.

- [ ] **Step 3: Add reusable authorization, idempotency, audit, and notification helpers**

Add these internal SQL helpers before public workflow functions:

```sql
create or replace function public.current_document_actor()
returns table(user_id uuid, role text, employee_id uuid)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p.id, p.role, e.id
  from public.profiles p
  left join public.employees e on e.profile_id = p.id and e.archived_at is null
  where p.id = auth.uid()
$$;

create or replace function public.has_document_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'super_admin'
        or (
          p.role = 'hr_admin'
          and exists (
            select 1 from public.document_permission_grants g
            where g.user_id = p.id
              and g.permission_code = p_permission
              and g.revoked_at is null
          )
        )
      )
  )
$$;

create or replace function public.write_document_audit(
  p_action text,
  p_employee_id uuid,
  p_category_id uuid,
  p_document_id uuid,
  p_version_id uuid,
  p_request_id uuid,
  p_summary jsonb
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_id uuid := gen_random_uuid();
begin
  perform public.assert_safe_document_audit_payload(coalesce(p_summary, '{}'::jsonb));
  insert into public.document_audit_logs(id, actor_user_id, action, employee_id, category_id, document_id, document_version_id, request_id, summary, created_at)
  values (v_id, auth.uid(), p_action, p_employee_id, p_category_id, p_document_id, p_version_id, p_request_id, coalesce(p_summary, '{}'::jsonb), now());
  return v_id;
end;
$$;

create or replace function public.create_document_notification(
  p_recipient_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_resource_type text,
  p_resource_id uuid,
  p_source_event_key text
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_id uuid;
begin
  insert into public.notifications(id, recipient_user_id, type, title, body, resource_type, resource_id, source_event_key, created_at)
  values (gen_random_uuid(), p_recipient_user_id, p_type, p_title, p_body, p_resource_type, p_resource_id, p_source_event_key, now())
  on conflict (recipient_user_id, source_event_key) do update set source_event_key = excluded.source_event_key
  returning id into v_id;
  return v_id;
end;
$$;
```

`document_lifecycle_actions` stores `request_id`, action name, actor, target identifier, safe result JSON, and completion timestamp. Every idempotent function first returns the prior safe result for the same actor, action, and request ID.

- [ ] **Step 4: Implement category, requirement, and permission workflows**

Implement the fixed RPC names with typed parameters and `jsonb` return values. The category create/version functions must insert fields in display order, supersede the prior current version, and write audit rows. Requirement create/revise functions validate target existence and cardinality before inserting immutable replacement rows. Permission functions require a Super Admin actor and an eligible HR Admin target.

Use this exact active-grant pattern:

```sql
if not exists (select 1 from public.profiles where id = p_user_id and role = 'hr_admin') then
  raise exception 'DOCUMENT_PERMISSION_GRANT_INVALID';
end if;

insert into public.document_permission_grants(id, user_id, permission_code, granted_by, granted_at)
values (gen_random_uuid(), p_user_id, p_permission_code, auth.uid(), now())
on conflict (user_id, permission_code) where revoked_at is null do nothing;
```

Grant and revoke operations insert `document_lifecycle_actions`, call `write_document_audit`, and return the active permission list.

- [ ] **Step 5: Implement upload-session and finalization workflows**

`create_document_upload_session` accepts actor-bound employee/category metadata, an idempotency key, common core metadata, visibility override, and a JSON manifest. It validates the latest category version, actor authority, count, cardinality, file metadata, category allowlist, and single-category conflict. Set `expires_at = now() + interval '10 minutes'` and reject every prepare/finalize call after that timestamp before inserting:

```text
document_upload_sessions
document_upload_session_files
```

Generate exact paths with PostgreSQL UUIDs:

```text
documents/{document_uuid}/versions/{version_uuid}/{file_uuid}.{extension}
```

The function returns only session/file IDs, expected safe filenames, and opaque storage paths to trusted server code. The API route converts those paths to signed upload URLs.

`finalize_employee_document_upload` and `finalize_hr_document_upload` must:

```text
lock pending session
verify actor, expiry, idempotency, and verified manifest rows
set app.document_workflow = on locally
create one employee_documents row per file, or reuse the single-category record
create immutable employee_document_versions rows
set employee source to pending_review unless saved as draft
set HR source to draft or approved according to the request
activate approved HR versions atomically
create reviewer or employee notifications
write audit and lifecycle action rows
mark the upload session finalized
return safe document identifiers and statuses
```

Finalization never receives arbitrary storage paths from the browser; it uses only paths persisted in `document_upload_session_files`.

- [ ] **Step 6: Implement review, restoration, archive, deletion, notification, and compliance workflows**

`review_employee_document` locks the pending version and parent document, compares the expected update timestamp, rejects self-review, and handles exactly three decisions. Approval sets the active pointer and creates an employee notification. Rejection preserves the inactive version. Replacement request preserves the version and requires both an internal reason and employee instructions.

`restore_document_version` accepts only a previously approved version belonging to the document, locks both rows, replaces the active pointer, and writes audit history without deleting newer versions.

`archive_employee_document` and `restore_employee_document` toggle lifecycle timestamps through protected transactions. `permanently_delete_employee_document` requires Super Admin, a nonblank reason, deletion classification `invalid`, `duplicate`, or `mistaken_upload`, and returns the storage paths for trusted server cleanup after writing a non-file tombstone.

`mark_notification_read` updates only a notification whose `recipient_user_id = auth.uid()`.

`get_employee_document_compliance` applies target specificity with a window function:

```sql
row_number() over (
  partition by employee_id, category_id
  order by
    case target_type
      when 'employee' then 5
      when 'job_title' then 4
      when 'department' then 3
      when 'employment_type' then 2
      when 'all_active_employees' then 1
    end desc,
    effective_from desc,
    created_at desc,
    requirement_id desc
)
```

`get_manager_document_compliance` first verifies the current manager relationship, then returns aggregate counts only.

- [ ] **Step 7: Seed the nine editable prototype categories**

Seed stable category identities and version 1 configurations idempotently. Use these exact defaults:

```text
employment_contract: employee_hr, single, employee upload false
government_id: employee_hr, multiple, employee upload true
birth_certificate: employee_hr, single, employee upload true
training_certificate: employee_hr, multiple, employee upload true
professional_license: employee_hr, multiple, employee upload true
medical_record: hr_only, multiple, employee upload true
disciplinary_record: hr_only, multiple, employee upload false
investigation_record: super_admin_only, multiple, employee upload false
other_employment_form: employee_hr, multiple, employee upload true
```

Every starter category allows PDF/JPG/PNG; Employment Contract and Other Employment Form also allow DOCX. Use `optional` expiration by default except Professional License and Training Certificate, which use `required`, 12-month validity, and 30-day expiring-soon thresholds.

- [ ] **Step 8: Lock function privileges and run workflow tests**

For each public workflow:

```sql
revoke all on function public.function_name(argument_types) from public;
revoke all on function public.function_name(argument_types) from anon;
grant execute on function public.function_name(argument_types) to authenticated;
```

Run:

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/documents/migration.test.ts \
  src/features/documents/security.test.ts \
  src/features/documents/concurrency.test.ts
```

Expected: all document migration, security, and concurrency tests pass.

- [ ] **Step 9: Commit protected workflows**

```bash
git add supabase/migrations/202607170001_employee_document_management.sql src/features/documents
git commit -m "feat: add protected document workflows"
```

## Task 4: Document authorization and permission context

**Files:**
- Create: `src/features/documents/auth.ts`
- Create: `src/features/documents/auth.test.ts`
- Create: `src/features/documents/permissions/queries.ts`
- Create: `src/features/documents/permissions/queries.test.ts`
- Modify: `src/app/(dashboard)/layout.tsx`
- Modify: `src/components/app-shell.tsx`

**Interfaces:**
- Consumes: `requireUser()` and `AppRole` from the employee feature, `document_permission_grants` from Task 3.
- Produces: `getDocumentPermissionContext()`, `requireDocumentReviewer()`, `requireDocumentManager()`, `requireDocumentEmployeeAccess(employeeId)`, `requireDocumentAdminAccess()`, `listDocumentPermissionGrants()`, and an `AppShell` user payload containing `documentPermissions`.

- [ ] **Step 1: Write failing authorization tests**

Create `src/features/documents/auth.test.ts`:

```ts
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
```

Create `src/features/documents/permissions/queries.test.ts`:

```ts
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
```

- [ ] **Step 2: Run authorization tests and verify they fail**

Run:

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/documents/auth.test.ts \
  src/features/documents/permissions/queries.test.ts
```

Expected: FAIL because authorization and permission-query modules do not exist.

- [ ] **Step 3: Implement pure permission predicates and server guards**

Create `src/features/documents/auth.ts`:

```ts
import { redirect } from "next/navigation";
import { requireUser } from "@/features/employees/auth";
import type { DocumentPermissionContext, DocumentVisibility } from "./types";

export function canReviewDocuments(context: DocumentPermissionContext) {
  return context.role === "super_admin" || context.permissions.includes("documents.review");
}
export function canManageDocuments(context: DocumentPermissionContext) {
  return context.role === "super_admin" || context.permissions.includes("documents.manage");
}
export function canAccessDocumentAdmin(context: DocumentPermissionContext) {
  return context.role === "super_admin" || context.role === "hr_admin";
}
export function canUseVisibility(context: DocumentPermissionContext, visibility: DocumentVisibility) {
  if (visibility === "employee_hr") return true;
  if (visibility === "hr_only") return context.role === "hr_admin" || context.role === "super_admin";
  return context.role === "super_admin";
}

export async function getDocumentPermissionContext(): Promise<DocumentPermissionContext> {
  const { supabase, user } = await requireUser();
  const [{ data: profile }, { data: employee }, { data: grants }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    supabase.from("employees").select("id").eq("profile_id", user.id).is("archived_at", null).maybeSingle(),
    supabase.from("document_permission_grants").select("permission_code").eq("user_id", user.id).is("revoked_at", null),
  ]);
  return {
    userId: user.id,
    role: (profile?.role ?? "employee") as DocumentPermissionContext["role"],
    employeeId: employee?.id ?? null,
    permissions: (grants ?? []).map((row) => row.permission_code) as DocumentPermissionContext["permissions"],
  };
}

export async function requireDocumentReviewer() {
  const context = await getDocumentPermissionContext();
  if (!canReviewDocuments(context)) redirect("/documents?error=unauthorized");
  return context;
}
export async function requireDocumentManager() {
  const context = await getDocumentPermissionContext();
  if (!canManageDocuments(context)) redirect("/admin/documents?error=unauthorized");
  return context;
}
export async function requireDocumentEmployeeAccess(employeeId: string) {
  const context = await getDocumentPermissionContext();
  if (context.employeeId !== employeeId && context.role === "employee") redirect("/documents?error=unauthorized");
  return context;
}
export async function requireDocumentAdminAccess() {
  const context = await getDocumentPermissionContext();
  if (!canAccessDocumentAdmin(context)) redirect("/documents?error=unauthorized");
  return context;
}
```

- [ ] **Step 4: Implement permission-list normalization and query**

Create `src/features/documents/permissions/queries.ts`:

```ts
import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { DocumentPermissionCode } from "../types";

type PermissionRow = { user_id: string; role: string; permission_code: string | null; revoked_at: string | null };

export function normalizeDocumentPermissionRows(rows: PermissionRow[]) {
  const users = new Map<string, { userId: string; role: string; permissions: DocumentPermissionCode[] }>();
  for (const row of rows) {
    const entry = users.get(row.user_id) ?? { userId: row.user_id, role: row.role, permissions: [] };
    if (row.role === "super_admin") entry.permissions = ["documents.review", "documents.manage"];
    else if (!row.revoked_at && (row.permission_code === "documents.review" || row.permission_code === "documents.manage") && !entry.permissions.includes(row.permission_code)) entry.permissions.push(row.permission_code);
    users.set(row.user_id, entry);
  }
  return [...users.values()];
}

export async function listDocumentPermissionGrants() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_document_permission_grants");
  if (error) throw new Error(error.message);
  return normalizeDocumentPermissionRows((data ?? []) as PermissionRow[]);
}
```

Add protected SQL function `list_document_permission_grants()` to the migration. It must require Super Admin and return Super Admin and HR Admin users with active grants only.

- [ ] **Step 5: Pass permission data through the dashboard shell**

Modify `src/app/(dashboard)/layout.tsx` to call `getDocumentPermissionContext()` once and pass permission codes:

```tsx
const documentContext = await getDocumentPermissionContext();

<AppShell user={{
  name,
  email: user.email ?? "",
  role: profile?.role ?? "employee",
  documentPermissions: documentContext.permissions,
}}>
  {children}
</AppShell>
```

Modify `ShellUser` in `src/components/app-shell.tsx`:

```ts
export type ShellUser = {
  name: string;
  email: string;
  role: string;
  documentPermissions: Array<"documents.review" | "documents.manage">;
};
```

Pass both role and permissions to `Sidebar`; navigation changes land in Task 14.

- [ ] **Step 6: Run authorization tests and the full suite**

Run:

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/documents/auth.test.ts \
  src/features/documents/permissions/queries.test.ts
npm test
```

Expected: new tests pass and all existing tests remain green.

- [ ] **Step 7: Commit authorization and permission context**

```bash
git add src/features/documents/auth.ts src/features/documents/auth.test.ts src/features/documents/permissions src/app/'(dashboard)'/layout.tsx src/components/app-shell.tsx supabase/migrations/202607170001_employee_document_management.sql
git commit -m "feat: add document permission context"
```

## Task 5: Category version and requirement query modules

**Files:**
- Create: `src/features/documents/categories/queries.ts`
- Create: `src/features/documents/categories/queries.test.ts`
- Create: `src/features/documents/requirements/queries.ts`
- Create: `src/features/documents/requirements/queries.test.ts`

**Interfaces:**
- Consumes: category/version/field and requirement tables from Task 3.
- Produces: `listCurrentDocumentCategories(options)`, `getDocumentCategoryDetail(categoryId)`, `listDocumentRequirements(filters)`, `getRequirementFormOptions()`, `normalizeCategoryRows(rows)`, and `selectApplicableRequirement(requirements, employee, date)`.

- [ ] **Step 1: Write failing category and requirement tests**

Create `src/features/documents/categories/queries.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCategoryRows } from "./queries.ts";

 test("category rows group immutable fields under the correct version", () => {
  const result = normalizeCategoryRows([
    {
      category_id: "c1", code: "professional_license", archived_at: null,
      version_id: "v2", version_number: 2, name: "Professional License",
      description: "Current license", default_visibility: "employee_hr",
      employee_upload_enabled: true, cardinality: "multiple",
      allowed_mime_types: ["application/pdf"], expiration_mode: "required",
      default_validity_months: 12, expiring_soon_days: 30,
      retention_months_after_separation: 60, created_at: "2026-07-17T00:00:00Z",
      field_id: "f1", field_key: "license_type", field_label: "License type",
      field_type: "select", field_required: true, select_options: ["PRC"],
      employee_visible: true, display_order: 1,
    },
    {
      category_id: "c1", code: "professional_license", archived_at: null,
      version_id: "v2", version_number: 2, name: "Professional License",
      description: "Current license", default_visibility: "employee_hr",
      employee_upload_enabled: true, cardinality: "multiple",
      allowed_mime_types: ["application/pdf"], expiration_mode: "required",
      default_validity_months: 12, expiring_soon_days: 30,
      retention_months_after_separation: 60, created_at: "2026-07-17T00:00:00Z",
      field_id: "f2", field_key: "license_number", field_label: "License number",
      field_type: "text", field_required: true, select_options: [],
      employee_visible: true, display_order: 2,
    },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].fields.length, 2);
  assert.equal(result[0].fields[0].fieldKey, "license_type");
});
```

Create `src/features/documents/requirements/queries.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { selectApplicableRequirement } from "./queries.ts";

const employee = { id: "e1", departmentId: "d1", jobTitleId: "j1", employmentType: "regular" };
const base = {
  categoryId: "c1", requiredCount: 1, expiredSatisfies: false,
  effectiveFrom: "2026-01-01", effectiveTo: null, createdAt: "2026-01-01T00:00:00Z",
};

 test("requirement precedence chooses the most specific target", () => {
  const result = selectApplicableRequirement([
    { ...base, id: "r1", targetType: "all_active_employees", targetId: null },
    { ...base, id: "r2", targetType: "employment_type", targetId: "regular" },
    { ...base, id: "r3", targetType: "department", targetId: "d1" },
    { ...base, id: "r4", targetType: "job_title", targetId: "j1" },
    { ...base, id: "r5", targetType: "employee", targetId: "e1" },
  ], employee, "2026-07-17");
  assert.equal(result?.id, "r5");
});

 test("same-specificity ties use effective date, creation time, then stable id", () => {
  const result = selectApplicableRequirement([
    { ...base, id: "r1", effectiveFrom: "2026-05-01", createdAt: "2026-06-01T00:00:00Z", targetType: "department", targetId: "d1" },
    { ...base, id: "r3", effectiveFrom: "2026-05-01", createdAt: "2026-06-02T00:00:00Z", targetType: "department", targetId: "d1" },
    { ...base, id: "r2", effectiveFrom: "2026-05-01", createdAt: "2026-06-02T00:00:00Z", targetType: "department", targetId: "d1" },
  ], employee, "2026-07-17");
  assert.equal(result?.id, "r3");
});

 test("inactive date ranges and unrelated targets are ignored", () => {
  const result = selectApplicableRequirement([
    { ...base, id: "r1", effectiveTo: "2026-01-31", targetType: "employee", targetId: "e1" },
    { ...base, id: "r2", targetType: "department", targetId: "other" },
  ], employee, "2026-07-17");
  assert.equal(result, null);
});
```

- [ ] **Step 2: Run the query tests and verify they fail**

Run:

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/documents/categories/queries.test.ts \
  src/features/documents/requirements/queries.test.ts
```

Expected: FAIL because the query modules do not exist.

- [ ] **Step 3: Implement category normalization and server queries**

Create `src/features/documents/categories/queries.ts` with `server-only`, a typed `CategoryRow`, and these exact public types:

```ts
export type DocumentCategorySummary = {
  id: string;
  code: string;
  archivedAt: string | null;
  currentVersion: {
    id: string;
    versionNumber: number;
    name: string;
    description: string | null;
    defaultVisibility: DocumentVisibility;
    employeeUploadEnabled: boolean;
    cardinality: DocumentCardinality;
    allowedMimeTypes: string[];
    expirationMode: DocumentExpirationMode;
    defaultValidityMonths: number | null;
    expiringSoonDays: number;
    retentionMonthsAfterSeparation: number | null;
    createdAt: string;
    fields: Array<DocumentCustomFieldDefinition & { id: string }>;
  };
};

export function normalizeCategoryRows(rows: CategoryRow[]) {
  const categories = new Map<string, DocumentCategorySummary>();
  for (const row of rows) {
    const category = categories.get(row.category_id) ?? {
      id: row.category_id,
      code: row.code,
      archivedAt: row.archived_at,
      currentVersion: {
        id: row.version_id,
        versionNumber: row.version_number,
        name: row.name,
        description: row.description,
        defaultVisibility: row.default_visibility,
        employeeUploadEnabled: row.employee_upload_enabled,
        cardinality: row.cardinality,
        allowedMimeTypes: row.allowed_mime_types,
        expirationMode: row.expiration_mode,
        defaultValidityMonths: row.default_validity_months,
        expiringSoonDays: row.expiring_soon_days,
        retentionMonthsAfterSeparation: row.retention_months_after_separation,
        createdAt: row.created_at,
        fields: [],
      },
    };
    if (row.field_id && !category.currentVersion.fields.some((field) => field.id === row.field_id)) {
      category.currentVersion.fields.push({
        id: row.field_id,
        fieldKey: row.field_key!,
        label: row.field_label!,
        fieldType: row.field_type!,
        isRequired: row.field_required!,
        selectOptions: row.select_options ?? [],
        employeeVisible: row.employee_visible!,
        displayOrder: row.display_order!,
      });
      category.currentVersion.fields.sort((left, right) => left.displayOrder - right.displayOrder);
    }
    categories.set(row.category_id, category);
  }
  return [...categories.values()];
}
```

Implement:

```ts
export async function listCurrentDocumentCategories(options: { includeArchived?: boolean; employeeUploadOnly?: boolean } = {})
export async function getDocumentCategoryDetail(categoryId: string)
```

Both query the safe category-version projection; detail also loads immutable version history and fields. Throw `DOCUMENT_CATEGORY_NOT_FOUND` when detail returns no category.

- [ ] **Step 4: Implement requirement selection and server queries**

Create `src/features/documents/requirements/queries.ts` with these public types and pure function:

```ts
export type RequirementCandidate = {
  id: string;
  categoryId: string;
  requiredCount: number;
  expiredSatisfies: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
  targetType: DocumentRequirementTargetType;
  targetId: string | null;
};

export type RequirementEmployee = {
  id: string;
  departmentId: string | null;
  jobTitleId: string | null;
  employmentType: string | null;
};

const specificity: Record<DocumentRequirementTargetType, number> = {
  all_active_employees: 1,
  employment_type: 2,
  department: 3,
  job_title: 4,
  employee: 5,
};

export function selectApplicableRequirement(candidates: RequirementCandidate[], employee: RequirementEmployee, date: string) {
  return candidates
    .filter((requirement) => requirement.effectiveFrom <= date && (!requirement.effectiveTo || requirement.effectiveTo >= date))
    .filter((requirement) => requirement.targetType === "all_active_employees"
      || (requirement.targetType === "employee" && requirement.targetId === employee.id)
      || (requirement.targetType === "job_title" && requirement.targetId === employee.jobTitleId)
      || (requirement.targetType === "department" && requirement.targetId === employee.departmentId)
      || (requirement.targetType === "employment_type" && requirement.targetId === employee.employmentType))
    .sort((left, right) => specificity[right.targetType] - specificity[left.targetType]
      || right.effectiveFrom.localeCompare(left.effectiveFrom)
      || right.createdAt.localeCompare(left.createdAt)
      || right.id.localeCompare(left.id))[0] ?? null;
}
```

Implement:

```ts
export async function listDocumentRequirements(filters: { categoryId?: string; includeArchived?: boolean } = {})
export async function getRequirementFormOptions()
```

`getRequirementFormOptions()` returns active categories, active departments, active job titles, distinct employment types from active employees, and active employees. It never returns sensitive employee fields.

- [ ] **Step 5: Run category and requirement tests**

Run:

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/documents/categories/queries.test.ts \
  src/features/documents/requirements/queries.test.ts
```

Expected: 4 tests pass, 0 fail.

- [ ] **Step 6: Commit category and requirement queries**

```bash
git add src/features/documents/categories src/features/documents/requirements
git commit -m "feat: add document category and requirement queries"
```

## Task 6: Compliance calculations and manager-safe projections

**Files:**
- Create: `src/features/documents/compliance/queries.ts`
- Create: `src/features/documents/compliance/queries.test.ts`
- Modify: `supabase/migrations/202607170001_employee_document_management.sql`

**Interfaces:**
- Consumes: `get_employee_document_compliance` and `get_manager_document_compliance` from Task 3.
- Produces: `classifyExpiration(expirationDate, expiringSoonDays, today)`, `deriveRequirementStatus(input)`, `getOwnDocumentCompliance()`, `getEmployeeDocumentCompliance(employeeId)`, and `getManagerDocumentCompliance()`.

- [ ] **Step 1: Write failing expiration, requirement-status, and safe-projection tests**

Create `src/features/documents/compliance/queries.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the compliance tests and verify they fail**

Run:

```bash
node --no-warnings --test --experimental-strip-types src/features/documents/compliance/queries.test.ts
```

Expected: FAIL because the compliance query module does not exist.

- [ ] **Step 3: Implement pure classification and normalization**

Create `src/features/documents/compliance/queries.ts`:

```ts
import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { DocumentExpirationStatus, DocumentRequirementStatus } from "../types";

export function classifyExpiration(expirationDate: string | null, expiringSoonDays: number, today: string): DocumentExpirationStatus {
  if (!expirationDate) return "no_expiration";
  if (expirationDate < today) return "expired";
  const start = Date.parse(`${today}T00:00:00.000Z`);
  const end = Date.parse(`${expirationDate}T00:00:00.000Z`);
  return Math.floor((end - start) / 86_400_000) <= expiringSoonDays ? "expiring_soon" : "valid";
}

export function deriveRequirementStatus(input: {
  requiredCount: number;
  approvedValidCount: number;
  approvedExpiringCount: number;
  approvedExpiredCount: number;
  pendingCount: number;
  replacementRequestedCount: number;
  expiredSatisfies: boolean;
}): DocumentRequirementStatus {
  if (input.approvedValidCount + input.approvedExpiringCount + (input.expiredSatisfies ? input.approvedExpiredCount : 0) >= input.requiredCount) {
    return input.approvedValidCount >= input.requiredCount ? "approved" : input.approvedExpiringCount > 0 ? "expiring_soon" : "approved";
  }
  if (input.pendingCount > 0) return "pending_review";
  if (input.replacementRequestedCount > 0) return "replacement_requested";
  if (input.approvedExpiredCount > 0) return "expired";
  return "missing";
}

export type ManagerComplianceRow = {
  employeeId: string;
  employeeName: string;
  overallStatus: DocumentRequirementStatus;
  missingCount: number;
  pendingReviewCount: number;
  expiringSoonCount: number;
  expiredCount: number;
};

export function normalizeManagerComplianceRows(rows: Array<Record<string, unknown>>): ManagerComplianceRow[] {
  return rows.map((row) => ({
    employeeId: String(row.employee_id),
    employeeName: String(row.employee_name),
    overallStatus: String(row.overall_status) as DocumentRequirementStatus,
    missingCount: Number(row.missing_count),
    pendingReviewCount: Number(row.pending_review_count),
    expiringSoonCount: Number(row.expiring_soon_count),
    expiredCount: Number(row.expired_count),
  }));
}

export async function getOwnDocumentCompliance() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_employee_document_compliance", { p_employee_id: null });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getEmployeeDocumentCompliance(employeeId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_employee_document_compliance", { p_employee_id: employeeId });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getManagerDocumentCompliance() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_manager_document_compliance");
  if (error) throw new Error(error.message);
  return normalizeManagerComplianceRows((data ?? []) as Array<Record<string, unknown>>);
}
```

- [ ] **Step 4: Harden SQL compliance outputs**

Update the migration functions so employee compliance returns these safe fields:

```text
category_id
category_name
required_count
approved_count
status
expiration_status
nearest_expiration_date
employee_upload_enabled
```

The manager function returns only:

```text
employee_id
employee_name
overall_status
missing_count
pending_review_count
expiring_soon_count
expired_count
```

Use current direct-report relationships from `employees.manager_id`, active employee filters, and the precedence window defined in Task 3. No direct document-table manager policy is added.

- [ ] **Step 5: Run compliance and security tests**

Run:

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/documents/compliance/queries.test.ts \
  src/features/documents/security.test.ts
```

Expected: all compliance and manager-safe projection tests pass.

- [ ] **Step 6: Commit compliance queries**

```bash
git add src/features/documents/compliance supabase/migrations/202607170001_employee_document_management.sql
git commit -m "feat: add document compliance projections"
```

## Task 7: Private upload sessions, signature verification, cleanup, and upload APIs

**Files:**
- Create: `src/lib/supabase/admin.ts`
- Create: `src/features/documents/uploads/storage.ts`
- Create: `src/features/documents/uploads/storage.test.ts`
- Create: `src/features/documents/uploads/client.ts`
- Create: `src/features/documents/uploads/client.test.ts`
- Create: `src/app/api/documents/uploads/prepare/route.ts`
- Create: `src/app/api/documents/uploads/finalize/route.ts`
- Modify: `supabase/migrations/202607170001_employee_document_management.sql`
- Modify: `README.md`

**Interfaces:**
- Consumes: validation, authorization, upload-session RPCs, and private bucket from Tasks 1–4.
- Produces: `createAdminClient()`, `sanitizeDocumentFilename`, `verifyDocumentSignature`, `createSignedDocumentUploadTickets`, `verifyUploadedDocumentObjects`, `removeDocumentObjects`, `uploadDocumentBatch`, and protected prepare/finalize API responses.

- [ ] **Step 1: Write failing storage and upload-client tests**

Create `src/features/documents/uploads/storage.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeDocumentFilename,
  verifyDocumentSignature,
  documentExtensionForMime,
} from "./storage.ts";

 test("display filenames are sanitized without losing the extension", () => {
  assert.equal(sanitizeDocumentFilename("  My / ID .. copy.PDF  "), "my-id-copy.pdf");
  assert.equal(sanitizeDocumentFilename("résumé 2026.docx"), "resume-2026.docx");
});

 test("stored extensions are derived from MIME instead of client names", () => {
  assert.equal(documentExtensionForMime("application/pdf"), "pdf");
  assert.equal(documentExtensionForMime("image/jpeg"), "jpg");
  assert.equal(documentExtensionForMime("application/vnd.openxmlformats-officedocument.wordprocessingml.document"), "docx");
});

 test("file signatures must match the approved MIME", () => {
  assert.equal(verifyDocumentSignature(Buffer.from("%PDF-1.7"), "application/pdf"), true);
  assert.equal(verifyDocumentSignature(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg"), true);
  assert.equal(verifyDocumentSignature(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png"), true);
  assert.equal(verifyDocumentSignature(Buffer.from([0x50, 0x4b, 0x03, 0x04]), "application/vnd.openxmlformats-officedocument.wordprocessingml.document"), true);
  assert.equal(verifyDocumentSignature(Buffer.from("%PDF-1.7"), "image/png"), false);
});
```

Create `src/features/documents/uploads/client.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { matchUploadTicketsToFiles } from "./client.ts";

 test("upload tickets bind to files by stable client key", () => {
  const files = [
    { clientFileKey: "front", file: { name: "front.pdf" } },
    { clientFileKey: "back", file: { name: "back.pdf" } },
  ];
  const tickets = [
    { clientFileKey: "back", path: "p2", token: "t2" },
    { clientFileKey: "front", path: "p1", token: "t1" },
  ];
  assert.deepEqual(matchUploadTicketsToFiles(files, tickets).map((item) => item.ticket.path), ["p1", "p2"]);
});

 test("missing or duplicate upload tickets are rejected", () => {
  assert.throws(() => matchUploadTicketsToFiles(
    [{ clientFileKey: "front", file: { name: "front.pdf" } }],
    [{ clientFileKey: "other", path: "p1", token: "t1" }],
  ), /DOCUMENT_UPLOAD_SESSION_INVALID/);
});
```

- [ ] **Step 2: Run storage tests and verify they fail**

Run:

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/documents/uploads/storage.test.ts \
  src/features/documents/uploads/client.test.ts
```

Expected: FAIL because storage and client modules do not exist.

- [ ] **Step 3: Create a server-only Supabase admin client**

Create `src/lib/supabase/admin.ts`:

```ts
import "server-only";
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Missing Supabase admin environment variables.");
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
```

Add this server-only variable to `README.md` and the existing `.env.example`:

```text
SUPABASE_SERVICE_ROLE_KEY=server-only Supabase service-role key used for scoped document storage operations
```

State explicitly that this value is never prefixed with `NEXT_PUBLIC_`, never returned by APIs, and is required only in trusted server runtime.

- [ ] **Step 4: Implement filename, extension, signature, hash, signed-ticket, verification, and cleanup helpers**

Create `src/features/documents/uploads/storage.ts`:

```ts
import "server-only";
import { createHash } from "node:crypto";
import { DOCUMENT_BUCKET } from "../constants";
import { createAdminClient } from "@/lib/supabase/admin";

const extensions: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export function documentExtensionForMime(mime: string) {
  const extension = extensions[mime];
  if (!extension) throw new Error("DOCUMENT_INVALID_FILE");
  return extension;
}

export function sanitizeDocumentFilename(filename: string) {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  const base = filename.slice(0, Math.max(0, filename.length - extension.length - 1))
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 180) || "document";
  return `${base}.${extension}`.toLowerCase();
}

export function verifyDocumentSignature(bytes: Buffer, mime: string) {
  if (mime === "application/pdf") return bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  if (mime === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  return false;
}

export function sha256Document(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function createSignedDocumentUploadTickets(files: Array<{ clientFileKey: string; storagePath: string }>) {
  const admin = createAdminClient();
  const tickets = [];
  for (const file of files) {
    const { data, error } = await admin.storage.from(DOCUMENT_BUCKET).createSignedUploadUrl(file.storagePath, { upsert: false });
    if (error || !data) throw new Error("DOCUMENT_UPLOAD_SESSION_INVALID");
    tickets.push({ clientFileKey: file.clientFileKey, path: data.path, token: data.token });
  }
  return tickets;
}

export async function verifyUploadedDocumentObjects(files: Array<{ id: string; storagePath: string; expectedMimeType: string; expectedSizeBytes: number }>) {
  const admin = createAdminClient();
  const verified = [];
  for (const file of files) {
    const { data, error } = await admin.storage.from(DOCUMENT_BUCKET).download(file.storagePath);
    if (error || !data) throw new Error("DOCUMENT_UPLOAD_INCOMPLETE");
    const bytes = Buffer.from(await data.arrayBuffer());
    if (bytes.byteLength !== file.expectedSizeBytes || !verifyDocumentSignature(bytes, file.expectedMimeType)) throw new Error("DOCUMENT_INVALID_FILE");
    verified.push({ fileId: file.id, sha256: sha256Document(bytes) });
  }
  return verified;
}

export async function removeDocumentObjects(paths: string[]) {
  if (paths.length === 0) return;
  const { error } = await createAdminClient().storage.from(DOCUMENT_BUCKET).remove(paths);
  if (error) throw new Error("DOCUMENT_UPLOAD_INCOMPLETE");
}
```

Keep `sanitizeDocumentFilename` display-only; stored names come from server UUIDs and MIME-derived extensions.

- [ ] **Step 5: Implement deterministic client-side ticket matching and direct upload**

Create `src/features/documents/uploads/client.ts`:

```ts
import { createClient } from "@/lib/supabase/client";

export function matchUploadTicketsToFiles<T extends { clientFileKey: string; file: { name: string } }>(files: T[], tickets: Array<{ clientFileKey: string; path: string; token: string }>) {
  const byKey = new Map(tickets.map((ticket) => [ticket.clientFileKey, ticket]));
  if (byKey.size !== tickets.length || files.some((file) => !byKey.has(file.clientFileKey))) throw new Error("DOCUMENT_UPLOAD_SESSION_INVALID");
  return files.map((file) => ({ file, ticket: byKey.get(file.clientFileKey)! }));
}

export async function uploadDocumentBatch(input: {
  sessionId: string;
  files: Array<{ clientFileKey: string; file: File }>;
  tickets: Array<{ clientFileKey: string; path: string; token: string }>;
  onProgress?: (completed: number, total: number) => void;
}) {
  const supabase = createClient();
  const matched = matchUploadTicketsToFiles(input.files, input.tickets);
  let completed = 0;
  for (const item of matched) {
    const { error } = await supabase.storage.from("employee-documents").uploadToSignedUrl(
      item.ticket.path,
      item.ticket.token,
      item.file.file,
      { contentType: item.file.file.type, upsert: false },
    );
    if (error) throw new Error("DOCUMENT_UPLOAD_INCOMPLETE");
    completed += 1;
    input.onProgress?.(completed, matched.length);
  }
  const response = await fetch("/api/documents/uploads/finalize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: input.sessionId }),
  });
  if (!response.ok) throw new Error((await response.json()).code ?? "DOCUMENT_UPLOAD_INCOMPLETE");
  return response.json();
}
```

- [ ] **Step 6: Implement the protected prepare route**

Create `src/app/api/documents/uploads/prepare/route.ts`. It must:

1. Require an authenticated user.
2. Parse JSON with `employeeId`, `categoryId`, `categoryVersionId`, `mode`, `saveAsDraft`, `visibilityOverride`, `commonMetadata`, `files`, and `idempotencyKey`.
3. Validate the manifest and metadata using Task 1 functions.
4. Call `create_document_upload_session` with no client-provided paths.
5. Convert the returned server-selected paths into signed tickets.
6. Return only safe session data.

Use this response contract:

```ts
return Response.json({
  sessionId: result.session_id,
  expiresAt: result.expires_at,
  tickets: await createSignedDocumentUploadTickets(result.files),
});
```

On ticket-generation failure, call `cancel_document_upload_session`, remove any created objects, and return `{ code: "DOCUMENT_UPLOAD_SESSION_INVALID", message: mapDocumentError(...) }` with status 400.

- [ ] **Step 7: Implement the protected finalize route and compensating cleanup**

Create `src/app/api/documents/uploads/finalize/route.ts`. It must:

1. Require the authenticated actor.
2. Load the actor-bound pending session and exact manifest through `get_document_upload_session_manifest`.
3. Download and verify each expected object using the admin client.
4. Call `mark_document_upload_files_verified` with file IDs and SHA-256 values.
5. Call employee or HR finalization RPC based on the persisted session source, not a new client flag.
6. Return safe document IDs/statuses.
7. On any failure before successful finalization, attempt `removeDocumentObjects(manifest.paths)` and call `fail_document_upload_session`.
8. Never include storage paths in the response or server logs.

Use one generated correlation ID in the safe error response:

```ts
return Response.json({
  code: "DOCUMENT_UPLOAD_INCOMPLETE",
  message: "The upload could not be completed. No official records were saved.",
  correlationId,
}, { status: 400 });
```

Add `get_document_upload_session_manifest`, `mark_document_upload_files_verified`, `cancel_document_upload_session`, and `fail_document_upload_session` as authenticated protected helper RPCs in the migration. They remain actor-bound and are not UI workflows.

- [ ] **Step 8: Run upload tests and full TypeScript validation**

Run:

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/documents/uploads/storage.test.ts \
  src/features/documents/uploads/client.test.ts
npx tsc --noEmit
```

Expected: upload tests pass and TypeScript exits 0.

- [ ] **Step 9: Commit secure upload infrastructure**

```bash
git add src/lib/supabase/admin.ts src/features/documents/uploads src/app/api/documents/uploads supabase/migrations/202607170001_employee_document_management.sql README.md .env.example
git commit -m "feat: add secure employee document uploads"
```

## Task 8: Document queries and authorized preview/download access

**Files:**
- Create: `src/features/documents/documents/queries.ts`
- Create: `src/features/documents/documents/queries.test.ts`
- Create: `src/app/api/documents/versions/[versionId]/access/route.ts`
- Modify: `supabase/migrations/202607170001_employee_document_management.sql`

**Interfaces:**
- Consumes: private bucket admin client, effective visibility rules, and document/version tables.
- Produces: `listOwnDocuments(filters)`, `getOwnDocumentDetail(documentId)`, `listEmployeeDocumentsForHr(employeeId, filters)`, `getDocumentDetailForHr(documentId)`, `getDocumentAccessUrl(versionId, disposition)`, and API response `{ url, filename, mimeType, disposition, expiresIn }`.

- [ ] **Step 1: Write failing row-normalization and access-rule tests**

Create `src/features/documents/documents/queries.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  canPreviewMime,
  normalizeEmployeeDocumentRow,
  resolveEffectiveVisibility,
} from "./queries.ts";

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
```

- [ ] **Step 2: Run the query tests and verify they fail**

Run:

```bash
node --no-warnings --test --experimental-strip-types src/features/documents/documents/queries.test.ts
```

Expected: FAIL because the document query module does not exist.

- [ ] **Step 3: Implement safe employee and HR query functions**

Create `src/features/documents/documents/queries.ts` with these pure helpers:

```ts
const visibilityRank = { employee_hr: 0, hr_only: 1, super_admin_only: 2 } as const;

export function resolveEffectiveVisibility(categoryDefault: DocumentVisibility, override: DocumentVisibility | null) {
  const effective = override ?? categoryDefault;
  if (visibilityRank[effective] < visibilityRank[categoryDefault]) throw new Error("DOCUMENT_INVALID_VISIBILITY");
  return effective;
}

export function canPreviewMime(mime: string) {
  return mime === "application/pdf" || mime === "image/jpeg" || mime === "image/png";
}

export function normalizeEmployeeDocumentRow(row: Record<string, unknown>) {
  return {
    id: String(row.document_id),
    title: String(row.title),
    categoryName: String(row.category_name),
    visibility: String(row.effective_visibility),
    reviewStatus: String(row.review_status),
    expirationStatus: String(row.expiration_status),
    issueDate: row.issue_date ? String(row.issue_date) : null,
    expirationDate: row.expiration_date ? String(row.expiration_date) : null,
    versionNumber: Number(row.version_number),
    updatedAt: String(row.updated_at),
    canAccessFile: Boolean(row.can_access_file),
  };
}
```

Implement server-only query functions against safe views/RPCs:

```ts
export async function listOwnDocuments(filters: { categoryId?: string; reviewStatus?: string; expirationStatus?: string; page?: number } = {})
export async function getOwnDocumentDetail(documentId: string)
export async function listEmployeeDocumentsForHr(employeeId: string, filters: { includeArchived?: boolean; categoryId?: string } = {})
export async function getDocumentDetailForHr(documentId: string)
export async function listRecentDocumentActivity(limit = 10)
```

Employee detail includes only employee-visible custom fields and employee-safe review messages. HR detail includes category snapshots, version history, review history, compliance context, and safe audit summaries subject to visibility authorization. Neither returns `storage_path`.

- [ ] **Step 4: Add protected file-access authorization RPC**

Add `authorize_document_file_access(p_version_id uuid, p_disposition text, p_request_id uuid)` to the migration. It must:

```text
validate disposition is preview or download
load version, document, employee, category default, and effective override
reject archived documents except authorized HR historical access
allow employee only for own employee_hr file
allow HR Admin for employee_hr or hr_only using existing HR access
allow Super Admin for all visibility levels
reject preview when MIME is DOCX
insert preview_link_issued or download_link_issued audit event
return bucket, path, safe filename, MIME, and 60-second TTL to trusted server code only
```

The function uses `SECURITY DEFINER`, a stable error code, and a request ID for idempotent access-audit issuance.

- [ ] **Step 5: Implement the access API route**

Create `src/app/api/documents/versions/[versionId]/access/route.ts`:

```ts
export async function POST(request: Request, context: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await context.params;
  const body = await request.json() as { disposition: "preview" | "download" };
  const requestId = crypto.randomUUID();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("authorize_document_file_access", {
    p_version_id: versionId,
    p_disposition: body.disposition,
    p_request_id: requestId,
  });
  if (error || !data) return Response.json({ code: error?.message ?? "DOCUMENT_ACCESS_DENIED", message: mapDocumentError(error?.message ?? "DOCUMENT_ACCESS_DENIED") }, { status: 403 });
  const admin = createAdminClient();
  const { data: signed, error: signedError } = await admin.storage.from(data.bucket).createSignedUrl(data.path, data.expires_in, {
    download: body.disposition === "download" ? data.filename : false,
  });
  if (signedError || !signed) return Response.json({ code: "DOCUMENT_ACCESS_DENIED", message: mapDocumentError("DOCUMENT_ACCESS_DENIED") }, { status: 403 });
  return Response.json({ url: signed.signedUrl, filename: data.filename, mimeType: data.mime_type, disposition: body.disposition, expiresIn: data.expires_in });
}
```

No caching is allowed; return `Cache-Control: no-store`.

- [ ] **Step 6: Run document query, security, and TypeScript tests**

Run:

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/documents/documents/queries.test.ts \
  src/features/documents/security.test.ts
npx tsc --noEmit
```

Expected: tests pass and TypeScript exits 0.

- [ ] **Step 7: Commit document queries and file access**

```bash
git add src/features/documents/documents src/app/api/documents/versions supabase/migrations/202607170001_employee_document_management.sql
git commit -m "feat: add secure document access"
```

## Task 9: Review queue, immutable decisions, and in-app notification queries

**Files:**
- Create: `src/features/documents/reviews/queries.ts`
- Create: `src/features/documents/reviews/queries.test.ts`
- Create: `src/features/documents/notifications/queries.ts`
- Create: `src/features/documents/notifications/queries.test.ts`
- Modify: `supabase/migrations/202607170001_employee_document_management.sql`

**Interfaces:**
- Consumes: review workflow, safe document detail, and notifications from Tasks 3 and 8.
- Produces: `listDocumentReviewQueue(filters)`, `getDocumentReviewDetail(documentId)`, `normalizeReviewQueueRows`, `listDocumentNotifications()`, `normalizeNotificationRows`, and `getUnreadDocumentNotificationCount()`.

- [ ] **Step 1: Write failing review and notification query tests**

Create `src/features/documents/reviews/queries.test.ts`:

```ts
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
```

Create `src/features/documents/notifications/queries.test.ts`:

```ts
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
```

- [ ] **Step 2: Run query tests and verify they fail**

Run:

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/documents/reviews/queries.test.ts \
  src/features/documents/notifications/queries.test.ts
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement reviewer-safe queue and detail queries**

Create `src/features/documents/reviews/queries.ts`:

```ts
import "server-only";
import { createClient } from "@/lib/supabase/server";

export function normalizeReviewQueueRows(rows: Array<Record<string, unknown>>) {
  return rows.map((row) => ({
    documentId: String(row.document_id),
    versionId: String(row.version_id),
    employeeId: String(row.employee_id),
    employeeName: String(row.employee_name),
    categoryId: String(row.category_id),
    categoryName: String(row.category_name),
    title: String(row.title),
    submittedAt: String(row.submitted_at),
    expirationDate: row.expiration_date ? String(row.expiration_date) : null,
    reviewStatus: String(row.review_status),
    expectedUpdatedAt: String(row.expected_updated_at),
  }));
}

export async function listDocumentReviewQueue(filters: {
  status?: "pending_review" | "replacement_requested";
  categoryId?: string;
  employeeQuery?: string;
  submittedFrom?: string;
  submittedTo?: string;
  expiration?: "none" | "valid" | "expiring_soon" | "expired";
  page?: number;
} = {}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_document_review_queue", {
    p_status: filters.status ?? "pending_review",
    p_category_id: filters.categoryId ?? null,
    p_employee_query: filters.employeeQuery?.trim() || null,
    p_submitted_from: filters.submittedFrom ?? null,
    p_submitted_to: filters.submittedTo ?? null,
    p_expiration: filters.expiration ?? null,
    p_page: filters.page ?? 1,
    p_page_size: 25,
  });
  if (error) throw new Error(error.message);
  return normalizeReviewQueueRows((data ?? []) as Array<Record<string, unknown>>);
}

export async function getDocumentReviewDetail(documentId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_document_review_detail", { p_document_id: documentId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("DOCUMENT_NOT_FOUND");
  return data;
}
```

Add `list_document_review_queue` and `get_document_review_detail` protected reviewer-only functions to the migration. The detail projection includes file-safe metadata, category version snapshot, version history, review history, and requirement context but never another employee’s unrelated documents.

- [ ] **Step 4: Implement safe notification queries**

Create `src/features/documents/notifications/queries.ts`:

```ts
import "server-only";
import { createClient } from "@/lib/supabase/server";

export function normalizeNotificationRows(rows: Array<Record<string, unknown>>) {
  return rows.map((row) => ({
    id: String(row.id),
    type: String(row.type),
    title: String(row.title),
    body: String(row.body),
    resourceType: row.resource_type ? String(row.resource_type) : null,
    resourceId: row.resource_id ? String(row.resource_id) : null,
    createdAt: String(row.created_at),
    isRead: Boolean(row.read_at),
  }));
}

export async function listDocumentNotifications(limit = 20) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("notifications")
    .select("id,type,title,body,resource_type,resource_id,created_at,read_at")
    .like("type", "document_%")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return normalizeNotificationRows((data ?? []) as Array<Record<string, unknown>>);
}

export async function getUnreadDocumentNotificationCount() {
  const supabase = await createClient();
  const { count, error } = await supabase.from("notifications")
    .select("id", { count: "exact", head: true })
    .like("type", "document_%")
    .is("read_at", null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}
```

RLS on `notifications` allows recipients to select their own rows only. Mutation remains through `mark_notification_read`.

- [ ] **Step 5: Run review, notification, security, and concurrency tests**

Run:

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/documents/reviews/queries.test.ts \
  src/features/documents/notifications/queries.test.ts \
  src/features/documents/security.test.ts \
  src/features/documents/concurrency.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit review and notification queries**

```bash
git add src/features/documents/reviews src/features/documents/notifications supabase/migrations/202607170001_employee_document_management.sql
git commit -m "feat: add document review and notification queries"
```

## Task 10: Employee and HR server actions for review, configuration, permissions, and lifecycle

**Files:**
- Create: `src/app/(dashboard)/documents/actions.ts`
- Create: `src/app/(dashboard)/admin/documents/actions.ts`
- Create: `src/features/documents/categories/actions.test.ts`
- Create: `src/features/documents/requirements/actions.test.ts`
- Create: `src/features/documents/permissions/actions.test.ts`
- Create: `src/features/documents/reviews/actions.test.ts`
- Create: `src/features/documents/lifecycle/actions.test.ts`
- Modify: `supabase/migrations/202607170001_employee_document_management.sql`

**Interfaces:**
- Consumes: authorization guards, validators, RPCs, admin storage cleanup, and query paths from Tasks 1–9.
- Produces: employee actions `submitDocumentDraft`, `archiveOwnDocumentDraft`, `markDocumentNotificationRead`; HR actions `createDocumentCategory`, `createDocumentCategoryVersion`, `archiveDocumentCategory`, `restoreDocumentCategory`, `createDocumentRequirement`, `reviseDocumentRequirement`, `archiveDocumentRequirement`, `restoreDocumentRequirement`, `grantDocumentPermission`, `revokeDocumentPermission`, `reviewDocumentSubmission`, `restoreApprovedDocumentVersion`, `archiveEmployeeDocument`, `restoreEmployeeDocument`, and `permanentlyDeleteEmployeeDocument`.

- [ ] **Step 1: Write failing source-contract tests for server actions**

Create `src/features/documents/reviews/actions.test.ts`:

```ts
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
```

Create `src/features/documents/categories/actions.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source = await readFile(new URL("../../../app/(dashboard)/admin/documents/actions.ts", import.meta.url), "utf8");
 test("category actions require manage permission and use immutable-version RPCs", () => {
  assert.match(source, /requireDocumentManager\(\)/);
  assert.match(source, /rpc\("create_document_category"/);
  assert.match(source, /rpc\("create_document_category_version"/);
  assert.match(source, /rpc\("archive_document_category"/);
  assert.match(source, /rpc\("restore_document_category"/);
});
```

Create `src/features/documents/requirements/actions.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source = await readFile(new URL("../../../app/(dashboard)/admin/documents/actions.ts", import.meta.url), "utf8");
 test("requirement actions validate and call protected immutable workflows", () => {
  assert.match(source, /validateRequirementInput/);
  for (const rpc of ["create_document_requirement", "revise_document_requirement", "archive_document_requirement", "restore_document_requirement"]) assert.match(source, new RegExp(`rpc\\("${rpc}"`));
});
```

Create `src/features/documents/permissions/actions.test.ts`:

```ts
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
```

Create `src/features/documents/lifecycle/actions.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source = await readFile(new URL("../../../app/(dashboard)/admin/documents/actions.ts", import.meta.url), "utf8");
 test("archive, restore, version restoration, and deletion use protected workflows", () => {
  for (const rpc of ["restore_document_version", "archive_employee_document", "restore_employee_document", "permanently_delete_employee_document"]) assert.match(source, new RegExp(`rpc\\("${rpc}"`));
  assert.match(source, /removeDocumentObjects/);
  assert.match(source, /deletion_reason/);
});
```

- [ ] **Step 2: Run action source tests and verify the action modules are missing**

Run:

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/documents/categories/actions.test.ts \
  src/features/documents/requirements/actions.test.ts \
  src/features/documents/permissions/actions.test.ts \
  src/features/documents/reviews/actions.test.ts \
  src/features/documents/lifecycle/actions.test.ts
```

Expected: FAIL with `ENOENT` for the action files.

- [ ] **Step 3: Implement employee document actions**

Create `src/app/(dashboard)/documents/actions.ts` with `"use server"` and these exact actions:

```ts
export async function submitDocumentDraft(documentId: string, versionId: string, requestId: string): Promise<DocumentActionState>
export async function archiveOwnDocumentDraft(documentId: string, requestId: string): Promise<DocumentActionState>
export async function markDocumentNotificationRead(notificationId: string): Promise<void>
```

Each action calls `getDocumentPermissionContext()`, requires the actor’s employee profile, invokes the matching protected RPC, maps stable errors with `mapDocumentError`, and revalidates:

```text
/documents
/documents/{documentId}
/dashboard
```

`markDocumentNotificationRead` calls `mark_notification_read` and never accepts a recipient ID from the browser.

- [ ] **Step 4: Implement category and requirement actions**

Create `src/app/(dashboard)/admin/documents/actions.ts` with one shared helper:

```ts
function documentActionError(error: unknown, fallback: string): DocumentActionState {
  const message = error instanceof Error ? error.message : String(error);
  return { error: mapDocumentError(message, fallback) };
}
```

Implement category actions by parsing all fields, JSON-decoding custom-field definitions from a hidden field, calling `validateCategoryInput`, then invoking the category RPC with a generated `requestId`. Category version creation requires a nonblank change reason.

Implement requirement actions using `validateRequirementInput`; revise creates a replacement row linked to the old requirement. Revalidate:

```text
/admin/documents
/admin/documents/categories
/admin/documents/categories/{categoryId}
/admin/documents/requirements
/documents
```

- [ ] **Step 5: Implement Super Admin permission actions**

`grantDocumentPermission` and `revokeDocumentPermission` begin with `requireSuperAdmin()`. Load the target profile role before `validatePermissionGrant`. Pass an explicit request ID to the RPC and revalidate:

```text
/admin/documents/permissions
/admin/documents
```

Revocation requires a confirmation boolean from the form; absent confirmation returns `{ error: "Confirm the permission revocation." }` without calling the database.

- [ ] **Step 6: Implement review actions with stale-state protection**

`reviewDocumentSubmission` begins with `requireDocumentReviewer()`, parses:

```text
document_id
version_id
decision
internal_reason
employee_message
expected_version_updated_at
request_id
```

Validate with `validateReviewDecision`, call `review_employee_document`, map stale/concurrent errors, then revalidate:

```text
/admin/documents
/admin/documents/review
/admin/documents/review/{documentId}
/admin/documents/employees/{employeeId}
/documents/{documentId}
```

No review reason or employee message is placed in the URL.

- [ ] **Step 7: Implement archive, restore, version restoration, and permanent deletion**

Archive and restore require HR document administration access; version restoration also requires a nonblank reason and expected active-version ID. Permanent deletion begins with `requireSuperAdmin()`, validates classification and mandatory reason, calls `permanently_delete_employee_document`, removes only returned paths through `removeDocumentObjects`, then calls `complete_permanent_document_deletion` with the tombstone ID.

If storage removal fails, call `fail_permanent_document_deletion` so the tombstone records cleanup failure and return a safe correlation ID. The deleted record remains inaccessible and cleanup may be retried by Super Admin.

- [ ] **Step 8: Run action tests, TypeScript, and the full test suite**

Run:

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/documents/categories/actions.test.ts \
  src/features/documents/requirements/actions.test.ts \
  src/features/documents/permissions/actions.test.ts \
  src/features/documents/reviews/actions.test.ts \
  src/features/documents/lifecycle/actions.test.ts
npx tsc --noEmit
npm test
```

Expected: action tests pass, TypeScript exits 0, and all existing tests remain green.

- [ ] **Step 9: Commit document server actions**

```bash
git add src/app/'(dashboard)'/documents/actions.ts src/app/'(dashboard)'/admin/documents/actions.ts src/features/documents supabase/migrations/202607170001_employee_document_management.sql
git commit -m "feat: add document administration actions"
```

## Task 11: Employee document portal, upload form, detail, replacement, and notifications

**Files:**
- Modify: `src/app/(dashboard)/documents/page.tsx`
- Create: `src/app/(dashboard)/documents/loading.tsx`
- Create: `src/app/(dashboard)/documents/error.tsx`
- Create: `src/app/(dashboard)/documents/[documentId]/page.tsx`
- Create: `src/components/documents/document-status-badge.tsx`
- Create: `src/components/documents/document-summary-cards.tsx`
- Create: `src/components/documents/document-requirement-list.tsx`
- Create: `src/components/documents/document-list.tsx`
- Create: `src/components/documents/document-upload-form.tsx`
- Create: `src/components/documents/document-upload-progress.tsx`
- Create: `src/components/documents/document-metadata-fields.tsx`
- Create: `src/components/documents/document-detail-panel.tsx`
- Create: `src/components/documents/document-version-history.tsx`
- Create: `src/components/documents/document-access-button.tsx`
- Create: `src/components/documents/document-notification-list.tsx`
- Modify: `src/features/documents/ui.test.ts`

**Interfaces:**
- Consumes: employee-safe documents, compliance, category options, upload APIs, access API, notifications, and employee actions from Tasks 5–10.
- Produces: complete `/documents` and `/documents/[documentId]` employee workflows with no HR-only data in HTML or client props.

- [ ] **Step 1: Write failing employee-portal source tests**

Create `src/features/documents/ui.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../../app/(dashboard)/documents/page.tsx", import.meta.url), "utf8");
const detail = await readFile(new URL("../../app/(dashboard)/documents/[documentId]/page.tsx", import.meta.url), "utf8");
const upload = await readFile(new URL("../../components/documents/document-upload-form.tsx", import.meta.url), "utf8");
const access = await readFile(new URL("../../components/documents/document-access-button.tsx", import.meta.url), "utf8");

 test("employee document portal uses live compliance, document, category, and notification queries", () => {
  for (const symbol of ["getOwnDocumentCompliance", "listOwnDocuments", "listCurrentDocumentCategories", "listDocumentNotifications"]) assert.match(page, new RegExp(symbol));
  assert.match(page, /DocumentSummaryCards/);
  assert.match(page, /DocumentRequirementList/);
  assert.match(page, /DocumentUploadForm/);
  assert.match(page, /DocumentNotificationList/);
});

 test("employee document detail uses safe detail and version history", () => {
  assert.match(detail, /getOwnDocumentDetail/);
  assert.match(detail, /DocumentDetailPanel/);
  assert.match(detail, /DocumentVersionHistory/);
  assert.match(detail, /replacement_requested/);
});

 test("upload form prepares, uploads, finalizes, and displays progress", () => {
  assert.match(upload, /\/api\/documents\/uploads\/prepare/);
  assert.match(upload, /uploadDocumentBatch/);
  assert.match(upload, /DocumentUploadProgress/);
  assert.match(upload, /accept=/);
});

 test("file access is issued on demand without storing signed URLs", () => {
  assert.match(access, /\/api\/documents\/versions\/\$\{versionId\}\/access/);
  assert.match(access, /window\.open/);
  assert.doesNotMatch(page, /signedUrl|storagePath/);
  assert.doesNotMatch(detail, /internalReason|storagePath/);
});
```

- [ ] **Step 2: Run the employee UI tests and verify they fail**

Run:

```bash
node --no-warnings --test --experimental-strip-types src/features/documents/ui.test.ts
```

Expected: FAIL because the new routes and components do not exist.

- [ ] **Step 3: Implement shared status, summary, requirement, and list components**

Create `DocumentStatusBadge` with explicit badge mapping:

```tsx
const badgeLabels: Record<string, string> = {
  draft: "Draft",
  pending_review: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  replacement_requested: "Replacement requested",
  missing: "Missing",
  expiring_soon: "Expiring soon",
  expired: "Expired",
  not_required: "Not required",
  valid: "Valid",
  no_expiration: "No expiration",
};

export function DocumentStatusBadge({ value }: { value: DocumentReviewStatus | DocumentRequirementStatus | DocumentExpirationStatus }) {
  const tone = value === "approved" || value === "valid" ? "success"
    : value === "pending_review" || value === "expiring_soon" || value === "replacement_requested" ? "warning"
    : value === "rejected" || value === "expired" || value === "missing" ? "danger"
    : "info";
  return <span className={`badge ${tone}`}>{badgeLabels[value]}</span>;
}
```

Create `DocumentSummaryCards` with five cards: Missing, Pending review, Approved, Expiring soon, Expired. Create `DocumentRequirementList` as accessible cards showing category, required count, current count, status, nearest expiration, and upload action when enabled. Create `DocumentList` as a desktop table plus mobile stacked cards with category/status/expiration filters preserved in query-string links.

Use these prop contracts:

```ts
export type EmployeeRequirementRow = {
  categoryId: string;
  categoryName: string;
  requiredCount: number;
  approvedCount: number;
  status: DocumentRequirementStatus;
  expirationStatus: DocumentExpirationStatus | null;
  nearestExpirationDate: string | null;
  employeeUploadEnabled: boolean;
};

export type EmployeeDocumentListItem = {
  id: string;
  title: string;
  categoryName: string;
  reviewStatus: DocumentReviewStatus;
  expirationStatus: DocumentExpirationStatus;
  expirationDate: string | null;
  versionNumber: number;
  updatedAt: string;
  canAccessFile: boolean;
};

export type DocumentSummaryCounts = { missing: number; pendingReview: number; approved: number; expiringSoon: number; expired: number };
export function DocumentSummaryCards({ counts }: { counts: DocumentSummaryCounts }): React.ReactNode;
export function DocumentRequirementList({ requirements, uploadCategoryId }: { requirements: EmployeeRequirementRow[]; uploadCategoryId?: string }): React.ReactNode;
export function DocumentList({ documents }: { documents: EmployeeDocumentListItem[] }): React.ReactNode;
```

- [ ] **Step 4: Implement metadata fields, progress, and upload form**

`DocumentMetadataFields` renders core metadata and category fields from typed definitions. It does not render fields where `employeeVisible = false` for employee uploads. `DocumentUploadProgress` shows `completed / total`, percentage, and one of `Preparing`, `Uploading`, `Finalizing`, `Complete`, or `Failed`.

`DocumentUploadForm` is a client component with these rules:

```text
category options include employeeUploadEnabled only
single category forces one selected file
accept attribute is derived from category allowed MIME types
selected files are validated before prepare request
clientFileKey uses crypto.randomUUID()
prepare sends manifests and metadata, never file bytes
uploadDocumentBatch performs signed uploads and finalization
replacement mode includes documentId and supersedesVersionId
success refreshes the route and resets the form
failure retains metadata and displays safe error text
```

Use this prepare payload:

```ts
{
  employeeId,
  categoryId,
  categoryVersionId,
  source: "employee",
  saveAsDraft,
  replacementDocumentId,
  supersedesVersionId,
  visibilityOverride: null,
  commonMetadata,
  files: selectedFiles.map(({ key, file }) => ({ clientFileKey: key, name: file.name, type: file.type, size: file.size })),
  idempotencyKey,
}
```

- [ ] **Step 5: Implement on-demand access and employee-safe detail components**

`DocumentAccessButton` posts `{ disposition }` to the access route, opens the returned signed URL in a new tab for preview, and uses an anchor click with `download` for download. Disable preview for DOCX and show only Download.

`DocumentDetailPanel` displays title, category, review status, permitted reference/issue/expiration/issuer/notes/tags/custom fields, and employee-safe review message. `DocumentVersionHistory` for employees shows version number, submission date, status, employee-safe message, and access actions only where `canAccessFile = true`; it never accepts internal reason or storage path props.

- [ ] **Step 6: Replace the placeholder employee documents page**

Implement `src/app/(dashboard)/documents/page.tsx` as a server component. Define these local helpers before the page function:

```ts
function scalar(value: string | string[] | undefined) { return typeof value === "string" ? value : undefined; }
function positivePage(value: string | string[] | undefined) { const page = Number(scalar(value) ?? "1"); return Number.isInteger(page) && page > 0 ? page : 1; }
function summarizeCompliance(rows: Array<{ status: string }>) {
  return {
    missing: rows.filter((row) => row.status === "missing").length,
    pendingReview: rows.filter((row) => row.status === "pending_review").length,
    approved: rows.filter((row) => row.status === "approved").length,
    expiringSoon: rows.filter((row) => row.status === "expiring_soon").length,
    expired: rows.filter((row) => row.status === "expired").length,
  };
}
```

Then implement the page:

```tsx
export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const context = await getDocumentPermissionContext();
  if (!context.employeeId) redirect("/dashboard?error=employee_profile_required");
  const [compliance, documents, categories, notifications] = await Promise.all([
    getOwnDocumentCompliance(),
    listOwnDocuments({ categoryId: scalar(query.category), reviewStatus: scalar(query.status), expirationStatus: scalar(query.expiration), page: positivePage(query.page) }),
    listCurrentDocumentCategories({ employeeUploadOnly: true }),
    listDocumentNotifications(),
  ]);
  return <>
    <PageHeader title="Documents" description="View required records, submit documents, and track review or expiration status." />
    <DocumentSummaryCards counts={summarizeCompliance(compliance)} />
    <div className="document-portal-grid">
      <section className="content-stack"><DocumentRequirementList requirements={compliance} /><DocumentList documents={documents} /></section>
      <aside className="content-stack"><DocumentUploadForm employeeId={context.employeeId} categories={categories} /><DocumentNotificationList notifications={notifications} /></aside>
    </div>
  </>;
}
```

Add filter form controls and query-state messages without using mock data.

- [ ] **Step 7: Implement employee detail, loading, and error routes**

`/documents/[documentId]` loads `getOwnDocumentDetail`, calls `notFound()` for `DOCUMENT_NOT_FOUND`, and renders replacement upload only when the latest status is `replacement_requested` and the category still allows employee upload.

`loading.tsx` uses shared skeleton/card classes and `error.tsx` is a client error boundary with retry. The error boundary shows a safe message and correlation ID when present but not raw exception text.

- [ ] **Step 8: Run employee UI, full tests, and TypeScript**

Run:

```bash
node --no-warnings --test --experimental-strip-types src/features/documents/ui.test.ts
npm test
npx tsc --noEmit
```

Expected: employee UI tests pass, all tests remain green, and TypeScript exits 0.

- [ ] **Step 9: Commit the employee portal**

```bash
git add src/app/'(dashboard)'/documents src/components/documents src/features/documents/ui.test.ts
git commit -m "feat: build employee document portal"
```

## Task 12: HR document dashboard, review queue, employee records, and lifecycle UI

**Files:**
- Create: `src/app/(dashboard)/admin/documents/page.tsx`
- Create: `src/app/(dashboard)/admin/documents/loading.tsx`
- Create: `src/app/(dashboard)/admin/documents/error.tsx`
- Create: `src/app/(dashboard)/admin/documents/review/page.tsx`
- Create: `src/app/(dashboard)/admin/documents/review/[documentId]/page.tsx`
- Create: `src/app/(dashboard)/admin/documents/employees/[employeeId]/page.tsx`
- Create: `src/components/documents/document-review-form.tsx`
- Create: `src/components/documents/document-review-queue.tsx`
- Create: `src/components/documents/document-archive-form.tsx`
- Create: `src/components/documents/document-restore-version-form.tsx`
- Create: `src/components/documents/document-delete-form.tsx`
- Modify: `src/features/documents/ui.test.ts`

**Interfaces:**
- Consumes: document admin access, review queries/actions, HR upload, compliance, lifecycle actions, and secure access from Tasks 4–10.
- Produces: `/admin/documents`, review queue/detail, and per-employee HR document administration.

- [ ] **Step 1: Extend failing UI tests for HR routes**

Append to `src/features/documents/ui.test.ts`:

```ts
const adminDashboard = await readFile(new URL("../../app/(dashboard)/admin/documents/page.tsx", import.meta.url), "utf8");
const reviewPage = await readFile(new URL("../../app/(dashboard)/admin/documents/review/page.tsx", import.meta.url), "utf8");
const reviewDetail = await readFile(new URL("../../app/(dashboard)/admin/documents/review/[documentId]/page.tsx", import.meta.url), "utf8");
const employeeAdmin = await readFile(new URL("../../app/(dashboard)/admin/documents/employees/[employeeId]/page.tsx", import.meta.url), "utf8");

 test("HR dashboard is live and permission-aware", () => {
  assert.match(adminDashboard, /requireDocumentAdminAccess/);
  assert.match(adminDashboard, /pendingReviewCount/);
  assert.match(adminDashboard, /missingDocumentCount/);
  assert.match(adminDashboard, /expiringSoonCount/);
  assert.match(adminDashboard, /recent/);
});

 test("review routes require reviewer permission and expose review actions", () => {
  assert.match(reviewPage, /requireDocumentReviewer/);
  assert.match(reviewPage, /listDocumentReviewQueue/);
  assert.match(reviewDetail, /getDocumentReviewDetail/);
  assert.match(reviewDetail, /DocumentReviewForm/);
  assert.match(reviewDetail, /DocumentAccessButton/);
});

 test("employee administration supports HR uploads and lifecycle controls", () => {
  assert.match(employeeAdmin, /listEmployeeDocumentsForHr/);
  assert.match(employeeAdmin, /getEmployeeDocumentCompliance/);
  assert.match(employeeAdmin, /DocumentUploadForm/);
  assert.match(employeeAdmin, /DocumentRestoreVersionForm/);
  assert.match(employeeAdmin, /DocumentArchiveForm/);
  assert.match(employeeAdmin, /DocumentDeleteForm/);
});
```

- [ ] **Step 2: Run UI tests and verify HR routes are missing**

Run:

```bash
node --no-warnings --test --experimental-strip-types src/features/documents/ui.test.ts
```

Expected: FAIL with `ENOENT` for HR document routes.

- [ ] **Step 3: Add HR dashboard query projection and page**

Add these types and `getDocumentAdminDashboard()` to `src/features/documents/documents/queries.ts`:

```ts
export type AdminDocumentActivity = {
  id: string;
  documentId: string;
  employeeId: string;
  employeeName: string;
  categoryName: string;
  title: string;
  action: string;
  occurredAt: string;
};

export type DocumentAdminDashboard = {
  pendingReviewCount: number;
  missingDocumentCount: number;
  expiringSoonCount: number;
  expiredCount: number;
  recentUploads: AdminDocumentActivity[];
  recentDecisions: AdminDocumentActivity[];
};

export async function getDocumentAdminDashboard(): Promise<DocumentAdminDashboard>;
```

Implement `/admin/documents` after `requireDocumentAdminAccess()`. Show four metric cards, recent uploads, recent decisions, and quick links. Hide review link unless `canReviewDocuments(context)`. Hide category/requirement links unless `canManageDocuments(context)`. Show permission administration only to Super Admin.

- [ ] **Step 4: Build review queue and review detail**

`DocumentReviewQueue` renders filters for status, category, employee search, submission range, expiration, and pagination. Use a table on desktop and cards on mobile.

`DocumentReviewForm` is a client/server-action form with:

```text
Approve
Reject
Request replacement
Internal reason textarea shown and required for reject/replacement
Employee instructions textarea shown and required for replacement
Hidden version ID, expected update timestamp, and request ID
Submit disabled after first click
Safe stale-state error
```

The review detail page shows secure preview/download, submitted core/custom metadata, category-rule snapshot, prior versions, requirement context, and review history. Private internal reasons render only in the reviewer/admin page and never pass into employee components.

- [ ] **Step 5: Build per-employee HR document administration**

`/admin/documents/employees/[employeeId]` begins with `requireDocumentAdminAccess()`, verifies the employee exists, then loads:

```text
employee identity summary
authorized documents including archived when requested
compliance requirements
active categories
safe document audit history
permission context
```

Provide HR-issued upload through `DocumentUploadForm` with `source="hr"`, employee visibility override controls, Save draft, and Approve immediately options. HR Admins cannot choose `super_admin_only`; Super Admin can.

For each document show active version, complete authorized history, preview/download, restore prior approved version, archive/restore record, and Super Admin deletion form. Deletion form requires typed confirmation, classification, and reason.

- [ ] **Step 6: Add loading and safe error states**

Create admin `loading.tsx` and `error.tsx` using the same safe patterns as the employee portal. Review concurrency errors display “Another reviewer has already processed this submission. Reload the queue.” and link back to `/admin/documents/review`.

- [ ] **Step 7: Run HR UI tests, full tests, and build**

Run:

```bash
node --no-warnings --test --experimental-strip-types src/features/documents/ui.test.ts
npm test
npx tsc --noEmit
npm run build
```

Expected: document UI tests pass, all tests pass, TypeScript exits 0, and the production build succeeds.

- [ ] **Step 8: Commit HR document workflows**

```bash
git add src/app/'(dashboard)'/admin/documents src/components/documents src/features/documents
git commit -m "feat: build HR document administration"
```

## Task 13: Category, custom-field, requirement, and permission administration UI

**Files:**
- Create: `src/app/(dashboard)/admin/documents/categories/page.tsx`
- Create: `src/app/(dashboard)/admin/documents/categories/[categoryId]/page.tsx`
- Create: `src/app/(dashboard)/admin/documents/requirements/page.tsx`
- Create: `src/app/(dashboard)/admin/documents/permissions/page.tsx`
- Create: `src/components/documents/document-category-form.tsx`
- Create: `src/components/documents/document-category-version-list.tsx`
- Create: `src/components/documents/document-requirement-form.tsx`
- Create: `src/components/documents/document-permission-form.tsx`
- Modify: `src/features/documents/ui.test.ts`

**Interfaces:**
- Consumes: category/requirement/permission queries and actions from Tasks 4, 5, and 10.
- Produces: complete configuration administration with immutable version history and Super Admin-only permission controls.

- [ ] **Step 1: Extend failing configuration UI tests**

Append to `src/features/documents/ui.test.ts`:

```ts
const categoriesPage = await readFile(new URL("../../app/(dashboard)/admin/documents/categories/page.tsx", import.meta.url), "utf8");
const categoryDetail = await readFile(new URL("../../app/(dashboard)/admin/documents/categories/[categoryId]/page.tsx", import.meta.url), "utf8");
const requirementsPage = await readFile(new URL("../../app/(dashboard)/admin/documents/requirements/page.tsx", import.meta.url), "utf8");
const permissionsPage = await readFile(new URL("../../app/(dashboard)/admin/documents/permissions/page.tsx", import.meta.url), "utf8");

 test("configuration routes use independent authorization", () => {
  assert.match(categoriesPage, /requireDocumentManager/);
  assert.match(categoryDetail, /requireDocumentManager/);
  assert.match(requirementsPage, /requireDocumentManager/);
  assert.match(permissionsPage, /requireSuperAdmin/);
});

 test("category detail preserves version history", () => {
  assert.match(categoryDetail, /getDocumentCategoryDetail/);
  assert.match(categoryDetail, /DocumentCategoryVersionList/);
  assert.match(categoryDetail, /createDocumentCategoryVersion/);
});

 test("requirements and permission pages use protected actions", () => {
  assert.match(requirementsPage, /DocumentRequirementForm/);
  assert.match(permissionsPage, /DocumentPermissionForm/);
});
```

- [ ] **Step 2: Run UI tests and verify configuration routes are missing**

Run:

```bash
node --no-warnings --test --experimental-strip-types src/features/documents/ui.test.ts
```

Expected: FAIL with `ENOENT` for configuration routes.

- [ ] **Step 3: Build category list, form, and immutable version history**

`DocumentCategoryForm` supports:

```text
stable code on create only
name and description
default visibility
employee upload toggle
single or multiple cardinality
allowed MIME checkboxes
expiration mode
default validity months
expiring-soon days
retention months after separation
ordered custom field editor
change reason on revision
```

The custom field editor uses stable client keys and emits one JSON hidden input. Each field supports key, label, type, required, employee visible, display order, and select options. Once a category has versions, code remains read-only.

Category list shows current version, visibility, upload authority, cardinality, expiration mode, version number, and archived state. Category detail shows current configuration plus complete immutable history and archive/restore controls.

- [ ] **Step 4: Build requirement administration**

`DocumentRequirementForm` supports category, count, expired-satisfies, effective range, target type, and target selector. Change the target selector based on type:

```text
all_active_employees: no target control
employment_type: active employment-type values
department: active departments
job_title: active job titles
employee: active employee search/select
```

The page lists current and archived requirements, target description, precedence level, effective range, required count, and revision history link. Revising a requirement creates a replacement row; it never edits an effective row directly.

- [ ] **Step 5: Build Super Admin permission administration**

`DocumentPermissionForm` lists Super Admin and HR Admin users, displays implicit Super Admin access, and allows independent toggles for `documents.review` and `documents.manage` on HR Admins. Grant and revoke forms include generated request IDs. Revocation requires a confirmation checkbox.

Do not render employees as eligible targets. Do not render grant controls for Super Admin rows.

- [ ] **Step 6: Run configuration UI tests and production validation**

Run:

```bash
node --no-warnings --test --experimental-strip-types src/features/documents/ui.test.ts
npm test
npx tsc --noEmit
npm run build
```

Expected: configuration UI tests pass, all tests pass, TypeScript exits 0, and build succeeds.

- [ ] **Step 7: Commit configuration administration**

```bash
git add src/app/'(dashboard)'/admin/documents/categories src/app/'(dashboard)'/admin/documents/requirements src/app/'(dashboard)'/admin/documents/permissions src/components/documents src/features/documents/ui.test.ts
git commit -m "feat: add document configuration administration"
```

## Task 14: Navigation, employee-profile integration, manager summary, settings, and Balanced spacing

**Files:**
- Modify: `src/components/sidebar.tsx`
- Modify: `src/components/app-shell.tsx`
- Modify: `src/components/employees/profile/profile-tabs.tsx`
- Modify: `src/app/(dashboard)/employees/[id]/page.tsx`
- Modify: `src/app/(dashboard)/dashboard/page.tsx`
- Create: `src/components/documents/manager-document-compliance.tsx`
- Modify: `src/app/(dashboard)/settings/page.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/lib/utils.ts`
- Modify: `src/features/documents/ui.test.ts`
- Modify: `src/features/layout/balanced-spacing.test.ts`

**Interfaces:**
- Consumes: shell permission context, manager-safe compliance query, and all document routes.
- Produces: permission-aware navigation, employee profile links, manager-safe direct-report status, settings cards, and responsive document layout classes.

- [ ] **Step 1: Add failing navigation, profile, and spacing tests**

Append to `src/features/documents/ui.test.ts`:

```ts
const sidebar = await readFile(new URL("../../components/sidebar.tsx", import.meta.url), "utf8");
const profileTabs = await readFile(new URL("../../components/employees/profile/profile-tabs.tsx", import.meta.url), "utf8");
const settings = await readFile(new URL("../../app/(dashboard)/settings/page.tsx", import.meta.url), "utf8");

 test("navigation exposes employee and permission-aware admin document routes", () => {
  assert.match(sidebar, /"\/documents", "Documents"/);
  assert.match(sidebar, /"\/admin\/documents", "Document Administration"/);
  assert.match(sidebar, /documentPermissions/);
  assert.match(profileTabs, /documents/);
});

 test("settings links document configuration without merging permissions", () => {
  assert.match(settings, /\/admin\/documents\/categories/);
  assert.match(settings, /\/admin\/documents\/requirements/);
  assert.match(settings, /\/admin\/documents\/permissions/);
});
```

Append to `src/features/layout/balanced-spacing.test.ts`:

```ts
 test("document layouts use the shared balanced spacing system", () => {
  for (const className of [
    "document-portal-grid", "document-summary-grid", "document-filter-grid",
    "document-upload-form", "document-requirement-grid", "document-admin-quick-links",
    "document-detail-grid", "document-version-list", "document-review-layout",
    "document-field-builder", "manager-document-compliance-grid",
  ]) assert.match(css, new RegExp(`\\.${className}\\s*\\{`));
  assert.match(css, /document-portal-grid[\s\S]*gap:\s*var\(--space-section\)/);
});
```

- [ ] **Step 2: Run integration tests and verify they fail**

Run:

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/documents/ui.test.ts \
  src/features/layout/balanced-spacing.test.ts
```

Expected: FAIL because navigation and document layout classes are incomplete.

- [ ] **Step 3: Make sidebar document navigation permission-aware**

Change `Sidebar` props:

```ts
export function Sidebar({
  role,
  documentPermissions,
}: {
  role: string;
  documentPermissions: Array<"documents.review" | "documents.manage">;
})
```

Always include `/documents`. Include `/admin/documents` for HR Admin or Super Admin. Include review only for Super Admin or `documents.review`; include categories/requirements only for Super Admin or `documents.manage`; include permissions only for Super Admin. Preserve the existing longest-prefix active-link logic and sidebar scrolling.

Update `AppShell` to pass `user.documentPermissions`.

- [ ] **Step 4: Add employee profile document link and manager-safe summary**

Add `{ id: "documents", label: "Documents", restricted: true, route: true }` to profile tabs and map it to `/admin/documents/employees/{employeeId}` for HR access. Do not add a manager file route.

Create `ManagerDocumentCompliance`:

```tsx
export function ManagerDocumentCompliance({ rows }: { rows: ManagerComplianceRow[] }) {
  if (rows.length === 0) return <div className="empty-state"><strong>No direct-report document requirements</strong><span>No current compliance items are available.</span></div>;
  return <div className="manager-document-compliance-grid">{rows.map((row) => <article className="card" key={row.employeeId}><div className="card-header-row"><strong>{row.employeeName}</strong><DocumentStatusBadge value={row.overallStatus} /></div><dl className="profile-summary-list compact"><div><dt>Missing</dt><dd>{row.missingCount}</dd></div><div><dt>Pending review</dt><dd>{row.pendingReviewCount}</dd></div><div><dt>Expiring soon</dt><dd>{row.expiringSoonCount}</dd></div><div><dt>Expired</dt><dd>{row.expiredCount}</dd></div></dl></article>)}</div>;
}
```

Modify `src/app/(dashboard)/dashboard/page.tsx`. For non-HR users, call `getManagerDocumentCompliance()` in parallel with the existing attendance context and render `<ManagerDocumentCompliance rows={managerCompliance} />` after attendance only when rows are present. HR dashboard behavior remains unchanged. No document IDs, filenames, or links are passed to the component.

- [ ] **Step 5: Add settings cards with permission-aware visibility**

Call `getDocumentPermissionContext()` in `src/app/(dashboard)/settings/page.tsx` and derive:

```ts
const canManageDocuments = context.role === "super_admin" || context.permissions.includes("documents.manage");
const isSuperAdmin = context.role === "super_admin";
```

Add settings entries:

```text
Document categories -> /admin/documents/categories -> visible when canManageDocuments
Document requirements -> /admin/documents/requirements -> visible when canManageDocuments
Document permissions -> /admin/documents/permissions -> visible when isSuperAdmin
```

Update backend status text to say employee document management and in-app document notifications are connected; payroll and announcements remain later phases.

- [ ] **Step 6: Add document badge tones and exact responsive layout classes**

Extend `badgeClass` in `src/lib/utils.ts`:

```ts
if (["active", "approved", "present", "valid"].includes(normalized)) return "success";
if (["pending", "pending review", "late", "on leave", "probation", "expiring soon", "replacement requested"].includes(normalized)) return "warning";
if (["rejected", "inactive", "absent", "terminated", "expired", "missing"].includes(normalized)) return "danger";
```

Add CSS using existing tokens:

```css
.document-portal-grid { display:grid; grid-template-columns:minmax(0, 1.7fr) minmax(300px, .8fr); gap:var(--space-section); align-items:start; }
.document-summary-grid { display:grid; grid-template-columns:repeat(5, minmax(0, 1fr)); gap:var(--space-card); }
.document-filter-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:var(--space-related); align-items:end; }
.document-upload-form,
.document-detail-grid,
.document-review-layout { display:grid; gap:var(--space-card); }
.document-requirement-grid,
.document-admin-quick-links,
.manager-document-compliance-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:var(--space-card); }
.document-version-list { display:grid; gap:var(--space-related); }
.document-field-builder { display:grid; grid-template-columns:1.1fr 1.3fr .8fr auto; gap:var(--space-related); align-items:end; }
```

At 1100 px, summary cards become three columns and portal becomes one column. At 760 px, every document grid becomes one column, tables use existing horizontal wrappers or mobile cards, buttons become full width where existing patterns require it, and card padding stays at the approved 16 px mobile value.

- [ ] **Step 7: Run integration, spacing, full tests, and build**

Run:

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/documents/ui.test.ts \
  src/features/layout/balanced-spacing.test.ts
npm test
npx tsc --noEmit
npm run build
```

Expected: integration and spacing tests pass, the full suite passes, TypeScript exits 0, and build succeeds.

- [ ] **Step 8: Commit navigation and responsive integration**

```bash
git add src/components/sidebar.tsx src/components/app-shell.tsx src/components/employees/profile/profile-tabs.tsx src/app/'(dashboard)'/employees/'[id]'/page.tsx src/app/'(dashboard)'/dashboard/page.tsx src/components/documents/manager-document-compliance.tsx src/app/'(dashboard)'/settings/page.tsx src/app/globals.css src/lib/utils.ts src/features/documents/ui.test.ts src/features/layout/balanced-spacing.test.ts
git commit -m "feat: integrate document navigation and responsive layouts"
```

## Task 15: End-to-end contracts, security regressions, deployment documentation, and release verification

**Files:**
- Create: `src/features/documents/e2e.test.ts`
- Modify: `src/features/documents/migration.test.ts`
- Modify: `src/features/documents/security.test.ts`
- Modify: `src/features/documents/concurrency.test.ts`
- Modify: `src/features/documents/ui.test.ts`
- Modify: `src/features/build-config.test.ts`
- Modify: `README.md`
- Modify: `supabase/migrations/202607170001_employee_document_management.sql` only for defects proven by failing tests

**Interfaces:**
- Consumes: the complete Phase 7 migration, domain modules, routes, actions, and components.
- Produces: final repository-level proof for approved workflows, security boundaries, migration shape, route ownership, environment safety, and Phase 1–6 regressions.

- [ ] **Step 1: Create end-to-end source-ownership tests**

Create `src/features/documents/e2e.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../../../supabase/migrations/202607170001_employee_document_management.sql", import.meta.url), "utf8");
const employeeActions = await readFile(new URL("../../app/(dashboard)/documents/actions.ts", import.meta.url), "utf8");
const adminActions = await readFile(new URL("../../app/(dashboard)/admin/documents/actions.ts", import.meta.url), "utf8");
const prepareRoute = await readFile(new URL("../../app/api/documents/uploads/prepare/route.ts", import.meta.url), "utf8");
const finalizeRoute = await readFile(new URL("../../app/api/documents/uploads/finalize/route.ts", import.meta.url), "utf8");
const accessRoute = await readFile(new URL("../../app/api/documents/versions/[versionId]/access/route.ts", import.meta.url), "utf8");

const flows = [
  ["employee submission", ["create_document_upload_session", "finalize_employee_document_upload", "pending_review", "document_submission_received"]],
  ["HR immediate activation", ["finalize_hr_document_upload", "approved", "active_version_id", "document_activated"]],
  ["review approval", ["review_employee_document", "DOCUMENT_SELF_REVIEW_FORBIDDEN", "document_reviews", "active_version_id"]],
  ["replacement request", ["replacement_requested", "employee_message", "supersedes_version_id"]],
  ["version restoration", ["restore_document_version", "DOCUMENT_ACTIVE_VERSION_CONFLICT"]],
  ["requirement precedence", ["get_employee_document_compliance", "all_active_employees", "employment_type", "department", "job_title", "employee"]],
  ["permission separation", ["documents.review", "documents.manage", "grant_document_permission", "revoke_document_permission"]],
  ["permanent deletion", ["permanently_delete_employee_document", "document_deletion_tombstones", "DOCUMENT_DELETE_REASON_REQUIRED"]],
] as const;

 test("approved workflows are owned by protected database and server layers", () => {
  const source = [migration, employeeActions, adminActions, prepareRoute, finalizeRoute, accessRoute].join("\n");
  for (const [name, tokens] of flows) {
    for (const token of tokens) assert.match(source, new RegExp(token.replace(".", "\\."), "i"), `${name} should contain ${token}`);
  }
});

 test("browser-facing code never embeds service-role credentials", () => {
  const browserFacing = [employeeActions, adminActions, prepareRoute, finalizeRoute, accessRoute].join("\n");
  assert.doesNotMatch(browserFacing, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(browserFacing, /serviceRoleKey\s*:/);
});

 test("upload and access routes do not return raw storage paths", () => {
  assert.doesNotMatch(finalizeRoute, /storagePath\s*:/);
  assert.doesNotMatch(accessRoute, /path:\s*data\.path/);
  assert.match(accessRoute, /Cache-Control/);
  assert.match(accessRoute, /no-store/);
});
```

- [ ] **Step 2: Complete migration and security coverage**

Extend migration tests to assert all fifteen tables, safe views, helper functions, public workflows, indexes, triggers, RLS enablement, revoked privileges, seed categories, MIME types, error codes, and one migration transaction.

Extend security tests to prove:

```text
employees have no direct access to HR-only or Super Admin-only files
managers have no direct select policy on document/version/review tables
review and manage permissions are independent
only Super Admin can grant/revoke permissions
only Super Admin can permanently delete
all signed access is authorized by authorize_document_file_access
bucket has no public read/list/insert policy
admin client exists only in server-only modules
no UI prop or list mapper contains storage_path, signed_url, internal_reason, or unrestricted custom_metadata
audit payloads reject storage credentials, URLs, and raw file content
```

Use exact regex assertions against repository source so the tests run without a live Supabase instance.

- [ ] **Step 3: Complete concurrency and idempotency coverage**

Extend `concurrency.test.ts` to assert row locks and stale checks in:

```text
create_document_category_version
create_document_upload_session
finalize_employee_document_upload
finalize_hr_document_upload
review_employee_document
restore_document_version
archive_employee_document
restore_employee_document
grant_document_permission
revoke_document_permission
permanently_delete_employee_document
```

Verify each state-changing workflow checks `document_lifecycle_actions` for prior completion by actor/action/request ID. Verify upload-session finalization locks the session, review locks version and document, restoration locks active version state, and permanent deletion cannot complete twice.

- [ ] **Step 4: Add build-configuration and route-tree regressions**

Extend `src/features/build-config.test.ts` to assert:

```ts
assert.doesNotMatch(envExample, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
assert.match(adminClient, /import "server-only"/);
assert.match(adminClient, /SUPABASE_SERVICE_ROLE_KEY/);
```

Extend UI tests to assert every approved route exists:

```text
/documents
/documents/[documentId]
/admin/documents
/admin/documents/review
/admin/documents/review/[documentId]
/admin/documents/employees/[employeeId]
/admin/documents/categories
/admin/documents/categories/[categoryId]
/admin/documents/requirements
/admin/documents/permissions
```

Also assert the original mock document array and fake employee names are absent from `/documents`.

- [ ] **Step 5: Document migration, environment, and operating procedures**

Add a Phase 7 section to `README.md` covering these exact deployment steps:

```text
1. Configure SUPABASE_SERVICE_ROLE_KEY only in trusted server environment.
2. Apply supabase/migrations/202607170001_employee_document_management.sql after 202607160004_fix_employee_manager_summary.sql.
3. Confirm employee-documents exists and public = false.
4. Confirm authenticated users cannot list arbitrary employee-documents objects.
5. Grant documents.review and documents.manage only to selected HR Admin users.
6. Review and revise seeded category configurations before production use.
7. Create requirement rules and confirm precedence on sample employees.
8. Test employee upload, HR upload, review, replacement, archive, restoration, and deletion cleanup.
9. Keep service-role values, raw storage paths, signed URLs, review reasons, and sensitive metadata out of logs.
10. Use forward-only patch migrations for defects after the primary migration is applied.
```

Document PDF/JPG/PNG/DOCX support, 15 MB maximum, 10-file maximum, 10-minute upload sessions, 60-second access URLs, preview/download behavior, and in-app-notification scope.

- [ ] **Step 6: Apply the migration to an ephemeral Supabase instance when available**

Preferred commands in the real repository:

```bash
npx supabase start
npx supabase db reset
```

Then run:

```bash
psql "$LOCAL_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
select to_regclass('public.document_categories') is not null as categories_exist;
select to_regclass('public.employee_document_versions') is not null as versions_exist;
select proname, prosecdef
from pg_proc
where proname in (
  'create_document_upload_session',
  'finalize_employee_document_upload',
  'review_employee_document',
  'get_manager_document_compliance',
  'permanently_delete_employee_document'
)
order by proname;
select id, name, public, file_size_limit
from storage.buckets
where id = 'employee-documents';
SQL
```

Expected:

```text
categories_exist = t
versions_exist = t
all five functions have prosecdef = t
employee-documents has public = f and file_size_limit = 15728640
```

When local Supabase cannot run, record that limitation in the verification report and require migration execution before deployment. Static migration tests are not a replacement for applying the SQL.

- [ ] **Step 7: Run the complete automated release suite**

Run:

```bash
npm ci
npm test
npx tsc --noEmit
npm run build
```

Expected:

```text
npm ci: exit 0
npm test: 0 failed
npx tsc --noEmit: exit 0
npm run build: exit 0
```

Record the exact test count. Review build output for every approved document route, client/server boundary failures, environment access during build, and dynamic route errors.

- [ ] **Step 8: Manually verify the approved acceptance matrix**

Use separate employee, manager, HR reviewer, HR document manager, and Super Admin sessions:

```text
Employee
[ ] sees own required-document statuses and permitted files only
[ ] sees safe status but no file for own HR-only submission
[ ] uploads one single-category file
[ ] uploads several multi-category files as separate records
[ ] cannot upload unsupported, mismatched, oversized, or excess files
[ ] saves a draft and submits it
[ ] sees pending, approved, rejected, and replacement-requested states
[ ] uploads a replacement without deleting history
[ ] previews PDF/JPG/PNG and downloads DOCX
[ ] marks document notifications read

Manager
[ ] sees direct-report aggregate compliance only
[ ] cannot reach document detail, file, metadata, or review routes

HR reviewer
[ ] sees review queue only with documents.review
[ ] cannot open configuration without documents.manage
[ ] cannot review own submission
[ ] approves, rejects, and requests replacement with required text
[ ] receives stale-state response when another reviewer wins

HR document manager
[ ] creates category and immutable revised version
[ ] configures custom fields, expiration, and cardinality
[ ] creates and revises requirements
[ ] uploads HR-issued drafts and approved documents
[ ] restores prior approved version
[ ] archives and restores document records
[ ] cannot use Super Admin-only visibility or permanent deletion

Super Admin
[ ] grants and revokes independent permissions
[ ] accesses Super Admin-only records
[ ] permanently deletes invalid/duplicate/mistaken upload with reason
[ ] leaves a tombstone and removes storage object

Security and responsiveness
[ ] bucket is private and arbitrary listing fails
[ ] signed URLs expire and are issued only after authorization
[ ] access issuance creates audit events without raw URLs or paths
[ ] document pages remain usable at desktop, tablet, and mobile widths
[ ] existing Phase 1–6 workflows remain operational
```

Capture every defect as a failing automated test before changing implementation.

- [ ] **Step 9: Commit final tests and documentation**

```bash
git add src/features/documents src/features/build-config.test.ts README.md supabase/migrations/202607170001_employee_document_management.sql
git commit -m "test: verify Phase 7 document management"
```

## Task 16: Clean repository package, verification report, and checksum

**Files:**
- Create outside repository: `/mnt/data/hris-repository-phase-7-document-management.zip`
- Create outside repository: `/mnt/data/phase-7-document-management-report.md`
- Create outside repository: `/mnt/data/phase-7-document-management.sha256`

**Interfaces:**
- Consumes: verified repository from Task 15.
- Produces: user-deliverable source ZIP, factual verification report, and SHA-256 checksum.

- [ ] **Step 1: Confirm the working tree and final commit history**

Run:

```bash
git status --short
git log --oneline -12
```

Expected: clean status and one coherent commit per plan task. Do not package uncommitted changes.

- [ ] **Step 2: Re-run release verification immediately before packaging**

Run:

```bash
npm test | tee /tmp/phase7-tests.log
npx tsc --noEmit | tee /tmp/phase7-tsc.log
npm run build | tee /tmp/phase7-build.log
```

Expected: zero failed tests, TypeScript exit 0, build exit 0. Preserve the exact test count and route output for the report.

- [ ] **Step 3: Create a clean source archive**

From the parent directory, create an archive containing one top-level `hris-repository` folder while excluding runtime and secret material:

```bash
rm -f /mnt/data/hris-repository-phase-7-document-management.zip
zip -qr /mnt/data/hris-repository-phase-7-document-management.zip hris-repository \
  -x 'hris-repository/.git/*' \
     'hris-repository/.next/*' \
     'hris-repository/node_modules/*' \
     'hris-repository/.env' \
     'hris-repository/.env.*' \
     'hris-repository/tsconfig.tsbuildinfo' \
     'hris-repository/*.log'
```

Retain `.env.example` by adding it after archive creation when the exclusion pattern removes it:

```bash
zip -q /mnt/data/hris-repository-phase-7-document-management.zip hris-repository/.env.example
```

- [ ] **Step 4: Verify archive integrity and exclusions**

Run:

```bash
unzip -t /mnt/data/hris-repository-phase-7-document-management.zip
unzip -l /mnt/data/hris-repository-phase-7-document-management.zip | grep -E '(^|/)(node_modules|\.next|\.git)/|(^|/)\.env($|\.)' && exit 1 || true
unzip -l /mnt/data/hris-repository-phase-7-document-management.zip | grep '202607170001_employee_document_management.sql'
unzip -l /mnt/data/hris-repository-phase-7-document-management.zip | grep '2026-07-17-phase-7-employee-document-management-design.md'
unzip -l /mnt/data/hris-repository-phase-7-document-management.zip | grep '2026-07-17-phase-7-employee-document-management.md'
```

Expected: archive integrity passes, forbidden paths are absent, and migration/spec/plan are present.

- [ ] **Step 5: Write the factual verification report**

Create `/mnt/data/phase-7-document-management-report.md` with:

```markdown
# Phase 7 Employee Document Management Verification Report

## Source
- Final commit: `<actual git commit hash>`
- Primary migration: `supabase/migrations/202607170001_employee_document_management.sql`

## Verification
- Automated tests: `<actual passed count> passed, 0 failed`
- TypeScript: passed
- Next.js production build: passed
- Local Supabase migration: `<passed or explicitly not run with reason>`
- ZIP integrity: passed

## Delivered capabilities
- Private employee document storage and signed access
- Immutable category and file versions
- Employee upload and HR review workflow
- HR-issued document activation
- Granular review/manage permissions
- Requirement and expiration compliance
- Manager-safe aggregate status
- Archive, restoration, restricted deletion, audit, and notifications
- Responsive Balanced spacing integration

## Deployment
1. Preserve the target repository's `.git` and `.env.local`.
2. Apply `202607170001_employee_document_management.sql` after `202607160004_fix_employee_manager_summary.sql`.
3. Configure `SUPABASE_SERVICE_ROLE_KEY` only in trusted server environment.
4. Run `npm ci`, `npm test`, `npx tsc --noEmit`, and `npm run build`.
5. Confirm `employee-documents` is private before enabling uploads.
```

Replace bracketed values with actual evidence. Do not report a migration run that did not occur.

- [ ] **Step 6: Generate and verify SHA-256 checksum**

Run:

```bash
sha256sum /mnt/data/hris-repository-phase-7-document-management.zip > /mnt/data/phase-7-document-management.sha256
sha256sum -c /mnt/data/phase-7-document-management.sha256
```

Expected: `OK`.

- [ ] **Step 7: Provide all three artifacts**

Final response links:

```text
sandbox:/mnt/data/hris-repository-phase-7-document-management.zip
sandbox:/mnt/data/phase-7-document-management-report.md
sandbox:/mnt/data/phase-7-document-management.sha256
```

Include actual verification results and migration instructions, not planned values.

## Final execution checklist

Before claiming Phase 7 complete, record fresh evidence for:

```text
[ ] Primary migration applied to local Supabase or limitation recorded
[ ] employee-documents bucket confirmed private
[ ] Arbitrary bucket listing and direct file access denied
[ ] Exact full-test count with zero failures
[ ] TypeScript exit code 0
[ ] Production build exit code 0
[ ] Employee, manager, reviewer, document manager, and Super Admin acceptance matrix
[ ] No raw paths, signed URLs, service-role credentials, or private review reasons in logs/UI/audit JSON
[ ] Clean ZIP integrity and exclusion checks
[ ] SHA-256 checksum verification
```

The implementation is not complete until every applicable item has fresh evidence.

## Spec coverage matrix

| Approved design requirement | Plan tasks |
|---|---|
| Employee document management scope and exclusions | Global Constraints; Tasks 1–16 |
| Category-based visibility and restrictive override | Tasks 1–3, 8, 11–13, 15 |
| Configurable employee uploads and HR uploads | Tasks 1, 3, 7, 10–12 |
| Draft, pending, approved, rejected, replacement workflow | Tasks 1, 3, 9–12, 15 |
| Immutable file and category versions | Tasks 2–3, 5, 8, 10, 12–13 |
| Expiration rules and status | Tasks 1, 3, 6, 11–13 |
| Required-document targeting and precedence | Tasks 3, 5–6, 13, 15 |
| PDF/JPG/PNG/DOCX, 10 files, 15 MB | Tasks 1–3, 7, 11, 15 |
| Separate private bucket and signed access | Tasks 2–3, 7–8, 15 |
| Manager status-only summaries | Tasks 3, 6, 14–15 |
| Archive-first and restricted deletion | Tasks 2–3, 10, 12, 15 |
| Single/multiple cardinality | Tasks 1–3, 5–7, 11–13 |
| Standard and category-specific metadata | Tasks 1–3, 5, 7, 11–13 |
| Secure preview and DOCX download-only | Tasks 7–8, 11–12, 15 |
| Independent review/manage permissions | Tasks 3–4, 10, 13–15 |
| In-app notifications | Tasks 3, 9–11, 15 |
| Review self-approval and concurrency protection | Tasks 3, 9–10, 12, 15 |
| Audit events and safe payloads | Tasks 2–3, 7–10, 12, 15 |
| Safe errors and compensating cleanup | Tasks 1, 7, 10–12, 15 |
| Approved routes and responsive layouts | Tasks 11–14 |
| Automated tests and release verification | Every task; consolidated in Task 15 |
| Clean ZIP, report, and checksum | Task 16 |

## Plan self-review

- **Spec coverage:** Every approved scope item and acceptance criterion maps to at least one task in the coverage matrix.
- **Placeholder scan:** No unresolved implementation markers, unnamed validation steps, or generic test instructions remain.
- **Type consistency:** Shared unions are defined once in Task 1; later query, action, component, and test signatures use the same values.
- **RPC consistency:** The canonical protected workflow names are fixed before Task 2 and used consistently by migration tests, server actions, and end-to-end contracts.
- **Security consistency:** Storage administration exists only in a `server-only` module, browser uploads are limited to signed tickets, and file access is authorized before every signed URL.
- **Scope:** Electronic signatures, OCR, policy libraries, email/SMS/push delivery, scheduled reminders, paid malware scanning, bulk ZIP exports, and manager file access remain excluded.
- **Migration ordering:** The Phase 7 migration follows `202607160004_fix_employee_manager_summary.sql`; later corrections use patch migrations rather than rewriting an applied migration.
- **Delivery evidence:** Packaging requires a fresh full test run, TypeScript, production build, archive integrity check, factual report, and checksum.
