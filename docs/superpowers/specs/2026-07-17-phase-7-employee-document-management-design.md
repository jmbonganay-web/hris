# Phase 7 Employee Document Management Design

## Status

Approved prototype design for the Northstar HRIS Phase 7 implementation.

## Goal

Provide secure personnel-document management for employees and HR while preserving immutable history, enforcing category and requirement rules, limiting file access by role and visibility, and exposing managers only to aggregate compliance status.

## Scope

Phase 7 includes:

- Versioned document categories and category-specific custom metadata.
- Employee and HR-issued uploads to a private Supabase Storage bucket.
- Draft, submission, review, rejection, replacement, approval, archive, restoration, and restricted permanent-deletion workflows.
- Effective-dated document requirements targeted to all active employees, employment type, department, job title, or one employee.
- Expiration and compliance status.
- Independent `documents.review` and `documents.manage` permissions for HR Admins.
- In-app event notifications, audit history, and manager-safe aggregate status.

Company-wide policy libraries, electronic signatures, OCR, scheduled reminders, email/SMS/push notifications, malware scanning, bulk ZIP exports, and manager file access are outside this phase.

## Architecture

PostgreSQL is the source of truth for document identities, immutable category versions, immutable file versions, reviews, requirement targeting, permission grants, compliance, notifications, lifecycle actions, and audit events.

Files are stored in a separate private Supabase Storage bucket named `employee-documents`. Browser clients never select arbitrary object paths. Trusted server routes request server-generated opaque paths, issue short-lived signed upload tickets, verify uploaded objects, and authorize every preview or download before issuing a signed URL.

The Next.js App Router exposes separate experiences for:

- Employees: own requirements, safe metadata, uploads, status, replacement, and notifications.
- HR reviewers: review queue and immutable decisions.
- HR document managers: category, requirement, employee-record, upload, archive, and restoration administration.
- Super Admins: permission grants, Super Admin-only visibility, and permanent deletion.
- Managers: aggregate compliance counts for current direct reports only.

## Roles and authorization

- Super Admins implicitly have `documents.review` and `documents.manage`.
- Only Super Admins may grant or revoke document permissions, set `super_admin_only`, or permanently delete files.
- Explicit document permissions may be granted only to HR Admins.
- `documents.review` and `documents.manage` are independent.
- Reviewers cannot review a submission associated with their own employee profile.
- Employees may access only their own `employee_hr` documents.
- HR Admins may access `employee_hr` and `hr_only` records according to their authorized workflow.
- Managers receive no file, filename, reference number, notes, issuer, custom metadata, review reason, object path, or signed URL.

## Visibility

Visibility is ordered:

```text
employee_hr < hr_only < super_admin_only
```

A document override may preserve or increase restriction but may never loosen the category default.

## Categories and metadata

Category identity is stable. Once used, configuration changes create a new immutable category-version row rather than editing the existing version.

Category versions define:

- Name and description.
- Default visibility.
- Employee-upload authority.
- Single or multiple cardinality.
- Allowed MIME types.
- Expiration mode and default validity.
- Expiring-soon threshold.
- Retention configuration.
- Ordered custom fields and employee visibility for each field.

Starter categories are editable and include employment contracts, government IDs, birth certificates, training certificates, professional licenses, medical records, disciplinary records, investigation records, and other employment forms.

## Files and upload limits

- Supported formats: PDF, JPG/JPEG, PNG, and DOCX.
- Maximum file size: 15 MB per file.
- Maximum upload batch: 10 files.
- Single-cardinality categories accept one file per upload and one non-archived document identity per employee/category.
- Every file in a multi-file upload creates a separate document record.
- Upload sessions expire after 10 minutes.
- Stored object paths are server-generated and opaque:

```text
documents/{document_uuid}/versions/{version_uuid}/{file_uuid}.{extension}
```

The server verifies expected object size, approved MIME type, file signature, and SHA-256 hash before finalization.

## Versioning and review

Document versions use these states:

```text
draft
pending_review
approved
rejected
replacement_requested
```

Submitted versions and completed reviews are immutable. A document may have only one active approved version. Employee submissions enter review unless saved as draft. HR uploads may be saved as draft or approved immediately when authorized.

Review decisions are atomic and concurrency-safe:

- Approval activates the submitted version.
- Rejection requires a private internal reason.
- Replacement request requires a private internal reason and employee-safe instructions.
- Stale or already-completed reviews return stable errors.
- Restoration activates a previously approved version without deleting newer history.

## Requirements and compliance

Requirement precedence is:

```text
employee
job title
department
employment type
all active employees
```

Same-specificity ties resolve by latest effective date, newest creation timestamp, then stable identifier.

Compliance statuses are:

```text
missing
pending_review
replacement_requested
approved
expiring_soon
expired
not_required
```

Expiration modes are `required`, `optional`, and `disabled`. Managers receive only overall status and aggregate missing, pending-review, expiring-soon, and expired counts for current direct reports.

## File access

- PDF, JPG/JPEG, and PNG may be previewed or downloaded.
- DOCX is download-only.
- Preview/download URLs expire after 60 seconds.
- Every access-link issuance is authorized and audited.
- Raw object paths and signed URLs never enter list responses or audit payloads.
- Responses use `Cache-Control: no-store`.

## Lifecycle and deletion

Ordinary HR workflows archive records. Permanent deletion is Super Admin-only, reason-required, idempotent, and limited to `invalid`, `duplicate`, or `mistaken_upload` classifications.

Permanent deletion uses a tombstone and two-stage cleanup:

1. Restrict the record and return object paths only to trusted server cleanup.
2. Remove storage objects, complete database cleanup, and retain the non-file tombstone.

Cleanup failure is recorded for retry without restoring user access.

## Audit and notifications

Document actions write safe audit events. Audit JSON rejects keys or payloads containing signed URLs, raw storage paths, service-role credentials, access tokens, or raw file content.

Notifications are in-app, recipient-scoped, event-driven, and idempotent. Scheduled expiration reminders are excluded.

## Database security

- All authoritative document tables use Row Level Security.
- Direct authenticated mutation is revoked.
- Privileged functions use `SECURITY DEFINER` and `set search_path = pg_catalog, public`.
- Default execution privileges are revoked and authenticated execution is granted only to approved public workflows.
- State-changing functions use row locks, stable error codes, and actor/action/request idempotency or actor-bound upload-session idempotency.
- Applied migrations are never rewritten; later defects use forward-only patch migrations.

## Routes

Employee routes:

```text
/documents
/documents/[documentId]
```

HR and Super Admin routes:

```text
/admin/documents
/admin/documents/review
/admin/documents/review/[documentId]
/admin/documents/employees/[employeeId]
/admin/documents/categories
/admin/documents/categories/[categoryId]
/admin/documents/requirements
/admin/documents/permissions
```

Trusted server routes:

```text
/api/documents/uploads/prepare
/api/documents/uploads/finalize
/api/documents/versions/[versionId]/access
```

## Acceptance boundaries

The implementation is releasable only when:

- Automated tests, TypeScript, and the production build pass.
- The migration is applied in a local or preview Supabase environment.
- `employee-documents` is confirmed private and arbitrary client listing is denied.
- Employee, manager, HR reviewer, HR document manager, and Super Admin sessions pass the role-specific acceptance matrix.
- No raw path, signed URL, service-role credential, or private review reason appears in UI, browser responses, logs, or audit JSON.
