# Phase 6 Leave Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build secure employee and HR leave management with immutable policy and request history, calendar-year allocations, append-only balance accounting, whole-day and half-day leave, private attachments, atomic attendance integration, conflict review, and leave-aware reporting.

**Architecture:** PostgreSQL is the source of truth for leave policies, request lifecycle, balance accounting, attendance classification, and concurrency. One Phase 6 migration adds stable leave identities, immutable revisions, append-only ledger entries, protected `SECURITY DEFINER` workflows, safe projections, storage policies, and report extensions; focused Next.js server modules call those RPCs, normalize rows, and render separate employee, HR, and settings workspaces. Submitted content and ledger history are never mutated directly, while draft-only content remains editable through protected workflows.

**Tech Stack:** Next.js 16.2.10 App Router, React 19.1.1, TypeScript 5.7.2, Supabase PostgreSQL/Auth/RLS/Storage, PostgreSQL PL/pgSQL, Node built-in test runner, existing `exceljs` reporting stack, existing CSS system.

## Global Constraints

- Company timezone remains exactly `Asia/Manila`.
- Leave years are calendar years from January 1 through December 31.
- Leave units are days in exact `0.5` increments.
- Multi-day requests are full-day only; first-half and second-half requests are single-day only.
- One request cannot cross December 31.
- Only effective scheduled workdays consume leave; holidays, rest days, and no-schedule dates consume `0` units.
- A submitted request must contain at least one chargeable date.
- Employee submissions allow at most 30 calendar days of backdating and at most 365 calendar days in advance.
- HR Admin and Super Admin may exceed employee date-window limits but must pass every other rule.
- Paid leave is always balance-tracked.
- Unpaid leave defaults to balance-exempt and may be configured as balance-tracked.
- Tracked balances are deducted only on approval and may never become negative.
- Pending requests reserve balance logically without creating ledger rows.
- Expiring carryover is consumed before current-year allocation and non-expiring adjustments.
- Carryover is disabled by default, may be capped, and expires on December 31 of the following calendar year.
- Annual allocations are fixed; monthly accrual and automatic proration are excluded.
- Submitted request revisions, submitted attachments, request-day revisions, actions, policy versions, and ledger rows are immutable.
- Employees may edit or permanently delete only drafts and may withdraw only their own pending requests.
- HR Admin and Super Admin are the only approvers and the only roles allowed to cancel approved requests.
- Approval and rejection apply to the complete request; partial approval and manager approval are excluded.
- Rejection, cancellation, backdated/current policy replacement, and HR balance adjustment require private reasons no longer than 1,000 characters.
- Employee notes are no longer than 1,000 characters and remain confidential.
- Attachments are limited to five files, 10 MB each, using PDF, JPG/JPEG, or PNG only.
- Employees see only their own leave data and attachments; HR Admin and Super Admin see organization-wide leave data.
- The frontend never directly creates approval decisions, ledger charges, carryover entries, cancellation restorations, conflict releases, or year-opening allocations.
- All privileged functions use `SECURITY DEFINER`, `set search_path = pg_catalog, public`, explicit role checks, row locking, stable error codes, and revoked default execution privileges.
- General audit JSON and reports exclude employee notes, attachment metadata, rejection reasons, cancellation reasons, approval notes, HR adjustment reasons, recalculation reasons, and conflict-resolution notes.
- Phase 6 does not calculate salary, leave pay, payroll amounts, notifications, public-holiday imports, hourly leave, or units smaller than `0.5`.
- Existing Phase 1 through Phase 5C behavior and tests must remain compatible.

---

## Verified baseline

Commands run against the approved Phase 5C repository before planning:

```text
npm ci: completed
npm test: 399 passed, 0 failed
npx tsc --noEmit: exit 0
npm run build: exit 0
Current latest migration: supabase/migrations/202607150005_fix_employee_attendance_summary_ambiguity.sql
Current /leave page: static mock data
Current report exports: CSV and XLSX under /api/reports/export
```

The repository ZIP does not contain `.git`; implementation steps still include commit boundaries for execution inside the real Git checkout.

## Scope decomposition

Phase 6 remains one implementation plan because every included subsystem depends on the same authoritative contracts:

```text
leave policy version
  -> draft preview
  -> frozen submission snapshots
  -> pending reservation
  -> approval ledger posting
  -> attendance recalculation
  -> conflict state
  -> leave-aware reports
```

The tasks are ordered so each reviewer can approve a coherent, independently testable layer before the next layer consumes it.

## File map

### Create

```text
supabase/migrations/202607160001_leave_management.sql

src/features/leave/constants.ts
src/features/leave/types.ts
src/features/leave/errors.ts
src/features/leave/validation.ts
src/features/leave/validation.test.ts
src/features/leave/presentation.ts
src/features/leave/presentation.test.ts
src/features/leave/auth.ts
src/features/leave/migration.test.ts
src/features/leave/security.test.ts
src/features/leave/concurrency.test.ts

src/features/leave/policy/queries.ts
src/features/leave/policy/queries.test.ts
src/features/leave/policy/actions.test.ts
src/features/leave/balances/queries.ts
src/features/leave/balances/queries.test.ts
src/features/leave/balances/actions.test.ts
src/features/leave/requests/queries.ts
src/features/leave/requests/queries.test.ts
src/features/leave/requests/actions.test.ts
src/features/leave/requests/storage.ts
src/features/leave/requests/storage.test.ts
src/features/leave/conflicts/queries.ts
src/features/leave/conflicts/queries.test.ts
src/features/leave/attendance-integration.test.ts
src/features/leave/recalculation.test.ts
src/features/leave/ui.test.ts
src/features/leave/e2e.test.ts

src/components/leave/leave-balance-cards.tsx
src/components/leave/leave-calendar.tsx
src/components/leave/leave-request-table.tsx
src/components/leave/leave-request-form.tsx
src/components/leave/leave-request-preview.tsx
src/components/leave/leave-attachment-uploader.tsx
src/components/leave/withdraw-leave-button.tsx
src/components/leave/leave-type-form.tsx
src/components/leave/leave-type-version-list.tsx
src/components/leave/leave-review-form.tsx
src/components/leave/cancel-approved-leave-form.tsx
src/components/leave/leave-conflict-table.tsx
src/components/leave/resolve-leave-conflict-form.tsx
src/components/leave/leave-balance-adjustment-form.tsx
src/components/leave/leave-year-opening-form.tsx
src/components/leave/employee-leave-setting-form.tsx

src/app/(dashboard)/employee/leave/page.tsx
src/app/(dashboard)/employee/leave/loading.tsx
src/app/(dashboard)/employee/leave/error.tsx
src/app/(dashboard)/employee/leave/new/page.tsx
src/app/(dashboard)/employee/leave/[requestGroupId]/page.tsx
src/app/(dashboard)/employee/leave/[requestGroupId]/edit/page.tsx
src/app/(dashboard)/employee/leave/actions.ts

src/app/(dashboard)/admin/leave/page.tsx
src/app/(dashboard)/admin/leave/loading.tsx
src/app/(dashboard)/admin/leave/error.tsx
src/app/(dashboard)/admin/leave/new/page.tsx
src/app/(dashboard)/admin/leave/[requestGroupId]/page.tsx
src/app/(dashboard)/admin/leave/actions.ts
src/app/(dashboard)/admin/leave/conflicts/page.tsx
src/app/(dashboard)/admin/leave/balances/page.tsx
src/app/(dashboard)/admin/leave/year-opening/page.tsx

src/app/(dashboard)/settings/leave-types/page.tsx
src/app/(dashboard)/settings/leave-types/new/page.tsx
src/app/(dashboard)/settings/leave-types/[leaveTypeId]/page.tsx
src/app/(dashboard)/settings/leave-types/[leaveTypeId]/new-version/page.tsx
src/app/(dashboard)/settings/leave-types/actions.ts

src/app/api/leave/attachments/prepare/route.ts
src/app/api/leave/attachments/finalize/route.ts
src/app/api/leave/attachments/[attachmentId]/download/route.ts
```

### Modify

```text
src/app/(dashboard)/leave/page.tsx
src/components/sidebar.tsx
src/app/(dashboard)/settings/page.tsx
src/app/globals.css

src/features/attendance/calculations/types.ts
src/features/attendance/calculations/presentation.ts
src/features/reports/types.ts
src/features/reports/constants.ts
src/features/reports/filters.ts
src/features/reports/queries.ts
src/features/reports/csv.ts
src/features/reports/xlsx.ts
src/features/reports/components/report-tabs.tsx
src/features/reports/components/daily-attendance-table.tsx
src/features/reports/components/employee-summary-table.tsx
src/features/reports/components/exports-panel.tsx
src/app/(dashboard)/reports/page.tsx
src/app/api/reports/export/csv/route.ts
src/app/api/reports/export/xlsx/route.ts

README.md
```

## Shared public contracts

Create these exact core unions before any query, action, or component uses them:

```ts
export const leaveDurationModes = ["full_day", "first_half", "second_half"] as const;
export type LeaveDurationMode = (typeof leaveDurationModes)[number];

export const leaveRequestStatuses = [
  "draft",
  "pending",
  "approved",
  "rejected",
  "withdrawn",
  "cancelled",
  "superseded",
] as const;
export type LeaveRequestStatus = (typeof leaveRequestStatuses)[number];

export const leaveClassifications = [
  "paid_leave",
  "unpaid_leave",
  "non_chargeable_holiday",
  "non_chargeable_rest_day",
  "non_chargeable_no_schedule",
  "attendance_precedence",
] as const;
export type LeaveClassification = (typeof leaveClassifications)[number];

export const leaveConflictTypes = [
  "full_day_completed_attendance",
  "full_day_incomplete_attendance",
  "half_day_covered_time_overlap",
  "schedule_recalculation_failed",
  "holiday_recalculation_failed",
  "insufficient_balance_after_recalculation",
] as const;
export type LeaveConflictType = (typeof leaveConflictTypes)[number];

export type LeaveUnit = 0 | 0.5 | 1;
```

The protected RPC names are fixed:

```text
create_leave_type
create_leave_type_version
archive_leave_type
create_leave_draft
update_leave_draft
delete_leave_draft
submit_leave_request
create_hr_leave_request
withdraw_leave_request
review_leave_request
cancel_approved_leave_request
create_leave_balance_adjustment
upsert_employee_leave_year_setting
preview_leave_year_opening
generate_leave_year_opening
generate_individual_leave_allocation
recalculate_leave_request_dates
resolve_leave_attendance_conflict
```

## Task 1: Leave constants, shared types, safe errors, validation, and presentation

**Files:**
- Create: `src/features/leave/constants.ts`
- Create: `src/features/leave/types.ts`
- Create: `src/features/leave/errors.ts`
- Create: `src/features/leave/validation.ts`
- Create: `src/features/leave/validation.test.ts`
- Create: `src/features/leave/presentation.ts`
- Create: `src/features/leave/presentation.test.ts`

**Interfaces:**
- Consumes: `companyDateAt(now?: Date): string` from `src/features/attendance/time.ts`.
- Produces: all leave unions, DTOs, action states, `mapLeaveError(message)`, `validateLeaveTypeVersion`, `validateLeaveDraft`, `validateLeaveReview`, `validateLeaveCancellation`, `validateLeaveAdjustment`, `validateLeaveYearOpening`, `formatLeaveUnits`, `leaveStatusLabel`, and `leaveConflictLabel`.

- [ ] **Step 1: Write failing validation and presentation tests**

Create `src/features/leave/validation.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  validateLeaveAdjustment,
  validateLeaveCancellation,
  validateLeaveDraft,
  validateLeaveReview,
  validateLeaveTypeVersion,
  validateLeaveYearOpening,
} from "./validation.ts";

const employeeId = "11111111-1111-4111-8111-111111111111";
const leaveTypeId = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const revisionId = "44444444-4444-4444-8444-444444444444";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

test("paid leave must be balance tracked", () => {
  const result = validateLeaveTypeVersion(
    form({
      leave_type_id: leaveTypeId,
      effective_from: "2026-08-01",
      name: "Vacation Leave",
      description: "Paid vacation",
      is_active: "true",
      is_paid: "true",
      is_balance_tracked: "false",
      default_annual_units: "0",
      carryover_enabled: "false",
      carryover_cap_units: "",
      employee_note_required: "false",
      document_required: "false",
      document_required_min_units: "",
      change_reason: "",
    }),
    "2026-07-16",
  );
  assert.equal(result.data, undefined);
  assert.equal(
    result.state?.fieldErrors?.is_balance_tracked,
    "Paid leave must track a balance.",
  );
});

test("balance-exempt leave rejects allocation and carryover", () => {
  const result = validateLeaveTypeVersion(
    form({
      leave_type_id: leaveTypeId,
      effective_from: "2026-08-01",
      name: "Unpaid Leave",
      description: "",
      is_active: "true",
      is_paid: "false",
      is_balance_tracked: "false",
      default_annual_units: "5",
      carryover_enabled: "true",
      carryover_cap_units: "2",
      employee_note_required: "false",
      document_required: "false",
      document_required_min_units: "",
      change_reason: "",
    }),
    "2026-07-16",
  );
  assert.equal(result.data, undefined);
  assert.equal(
    result.state?.fieldErrors?.default_annual_units,
    "Balance-exempt leave must use 0 annual units.",
  );
  assert.equal(
    result.state?.fieldErrors?.carryover_enabled,
    "Balance-exempt leave cannot carry over units.",
  );
});

test("leave units require exact half-day increments", () => {
  const result = validateLeaveAdjustment(
    form({
      employee_id: employeeId,
      leave_type_id: leaveTypeId,
      leave_year: "2026",
      units: "1.25",
      reason: "Correction",
    }),
    2026,
  );
  assert.equal(result.data, undefined);
  assert.equal(result.state?.fieldErrors?.units, "Units must use 0.5-day increments.");
});

test("multi-day half-day request is rejected", () => {
  const result = validateLeaveDraft(
    form({
      employee_id: employeeId,
      leave_type_id: leaveTypeId,
      start_date: "2026-08-01",
      end_date: "2026-08-02",
      duration_mode: "first_half",
      employee_note: "",
      replaces_request_group_id: "",
    }),
  );
  assert.equal(result.data, undefined);
  assert.equal(
    result.state?.fieldErrors?.duration_mode,
    "Half-day leave must use one calendar date.",
  );
});

test("draft date range cannot cross a calendar year", () => {
  const result = validateLeaveDraft(
    form({
      employee_id: employeeId,
      leave_type_id: leaveTypeId,
      start_date: "2026-12-31",
      end_date: "2027-01-01",
      duration_mode: "full_day",
      employee_note: "",
      replaces_request_group_id: "",
    }),
  );
  assert.equal(result.data, undefined);
  assert.equal(result.state?.fieldErrors?.end_date, "A request cannot cross calendar years.");
});

test("rejection requires review text while approval permits an empty note", () => {
  const approve = validateLeaveReview(
    form({
      request_group_id: requestId,
      expected_request_revision_id: revisionId,
      expected_status: "pending",
      expected_day_fingerprint: "abc123",
      expected_chargeable_units: "2.0",
      decision: "approve",
      review_text: "",
    }),
  );
  assert.equal(approve.data?.reviewText, null);

  const reject = validateLeaveReview(
    form({
      request_group_id: requestId,
      expected_request_revision_id: revisionId,
      expected_status: "pending",
      expected_day_fingerprint: "abc123",
      expected_chargeable_units: "2.0",
      decision: "reject",
      review_text: "",
    }),
  );
  assert.equal(reject.data, undefined);
  assert.equal(
    reject.state?.fieldErrors?.review_text,
    "A rejection reason is required.",
  );
});

test("approved cancellation and balance adjustment require private reasons", () => {
  const cancellation = validateLeaveCancellation(
    form({ request_group_id: requestId, expected_status: "approved", reason: "" }),
  );
  assert.equal(cancellation.data, undefined);
  assert.equal(
    cancellation.state?.fieldErrors?.reason,
    "A cancellation reason is required.",
  );

  const adjustment = validateLeaveAdjustment(
    form({
      employee_id: employeeId,
      leave_type_id: leaveTypeId,
      leave_year: "2026",
      units: "0.5",
      reason: "",
    }),
    2026,
  );
  assert.equal(adjustment.data, undefined);
  assert.equal(adjustment.state?.fieldErrors?.reason, "An adjustment reason is required.");
});

test("year opening accepts the current and next leave year", () => {
  assert.equal(
    validateLeaveYearOpening(form({ leave_year: "2027" }), 2026).data?.leaveYear,
    2027,
  );
  assert.equal(
    validateLeaveYearOpening(form({ leave_year: "2025" }), 2026).state?.fieldErrors?.leave_year,
    "Choose the current or next leave year.",
  );
});
```

Create `src/features/leave/presentation.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  formatLeaveUnits,
  leaveConflictLabel,
  leaveStatusLabel,
} from "./presentation.ts";

 test("leave unit formatting preserves half days", () => {
  assert.equal(formatLeaveUnits(0), "0 days");
  assert.equal(formatLeaveUnits(0.5), "0.5 day");
  assert.equal(formatLeaveUnits(1), "1 day");
  assert.equal(formatLeaveUnits(2.5), "2.5 days");
});

test("status and conflict labels are explicit", () => {
  assert.equal(leaveStatusLabel("superseded"), "Superseded");
  assert.equal(
    leaveConflictLabel("full_day_incomplete_attendance"),
    "Incomplete attendance during full-day leave",
  );
});
```

- [ ] **Step 2: Run the new tests and verify they fail**

Run:

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/leave/validation.test.ts \
  src/features/leave/presentation.test.ts
```

Expected: failure because the leave modules do not exist.

- [ ] **Step 3: Create exact constants and shared contracts**

Create `src/features/leave/constants.ts`:

```ts
export const COMPANY_TIME_ZONE = "Asia/Manila";
export const EMPLOYEE_BACKDATE_DAYS = 30;
export const EMPLOYEE_FUTURE_DAYS = 365;
export const LEAVE_NOTE_MAX_LENGTH = 1000;
export const LEAVE_ATTACHMENT_MAX_COUNT = 5;
export const LEAVE_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const LEAVE_ATTACHMENT_BUCKET = "leave-documents";
export const LEAVE_ATTACHMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;
export const LEAVE_ATTACHMENT_EXTENSIONS = ["pdf", "jpg", "jpeg", "png"] as const;
```

Create `src/features/leave/types.ts` with the unions from **Shared public contracts** and these DTOs:

```ts
export const leaveDurationModes = ["full_day", "first_half", "second_half"] as const;
export type LeaveDurationMode = (typeof leaveDurationModes)[number];

export const leaveRequestStatuses = [
  "draft", "pending", "approved", "rejected", "withdrawn", "cancelled", "superseded",
] as const;
export type LeaveRequestStatus = (typeof leaveRequestStatuses)[number];

export const leaveClassifications = [
  "paid_leave",
  "unpaid_leave",
  "non_chargeable_holiday",
  "non_chargeable_rest_day",
  "non_chargeable_no_schedule",
  "attendance_precedence",
] as const;
export type LeaveClassification = (typeof leaveClassifications)[number];

export const leaveConflictTypes = [
  "full_day_completed_attendance",
  "full_day_incomplete_attendance",
  "half_day_covered_time_overlap",
  "schedule_recalculation_failed",
  "holiday_recalculation_failed",
  "insufficient_balance_after_recalculation",
] as const;
export type LeaveConflictType = (typeof leaveConflictTypes)[number];

export type LeaveUnit = 0 | 0.5 | 1;
export type LeaveCreatedSource = "employee" | "hr";
export type LeaveReviewDecision = "approve" | "reject";
export type LeaveConflictStatus = "open" | "resolved" | "superseded";
export type LeaveLedgerEntryType =
  | "annual_allocation"
  | "carryover"
  | "hr_adjustment_credit"
  | "hr_adjustment_debit"
  | "approved_leave_charge"
  | "cancellation_restoration"
  | "attendance_conflict_release"
  | "recalculation_charge"
  | "recalculation_release";

export type LeaveActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
  data?: unknown;
};

export type LeaveTypeVersion = {
  id: string;
  leave_type_id: string;
  revision_number: number;
  effective_from: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_paid: boolean;
  is_balance_tracked: boolean;
  default_annual_units: number;
  carryover_enabled: boolean;
  carryover_cap_units: number | null;
  employee_note_required: boolean;
  document_required: boolean;
  document_required_min_units: number | null;
  created_by: string;
  created_at: string;
  change_reason: string | null;
};

export type LeaveTypeSummary = {
  id: string;
  code: string;
  current: LeaveTypeVersion | null;
  upcoming: LeaveTypeVersion[];
  history: LeaveTypeVersion[];
};

export type LeaveDayPreview = {
  leave_date: string;
  schedule_assignment_id: string | null;
  schedule_version_id: string | null;
  holiday_version_id: string | null;
  is_scheduled_workday: boolean;
  is_rest_day: boolean;
  is_holiday: boolean;
  is_chargeable: boolean;
  chargeable_units: LeaveUnit;
  leave_classification: LeaveClassification;
  half_day_boundary_at: string | null;
};

export type LeaveDraftPreview = {
  policyVersion: LeaveTypeVersion;
  days: LeaveDayPreview[];
  requestedUnits: number;
  chargeableUnits: number;
  ledgerBalance: number | null;
  pendingReservedUnits: number;
  availableUnits: number | null;
  requiresDocument: boolean;
};

export type LeaveAttachment = {
  id: string;
  requestGroupId: string;
  requestRevisionId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  frozenAt: string | null;
};

export type LeaveRequestSummary = {
  request_group_id: string;
  request_revision_id: string;
  employee_id: string;
  employee_name: string;
  employee_number: string;
  department_name: string | null;
  leave_type_id: string;
  leave_type_code: string;
  leave_type_name: string;
  leave_type_version_id: string;
  leave_year: number;
  start_date: string;
  end_date: string;
  duration_mode: LeaveDurationMode;
  requested_units: number;
  submitted_chargeable_units: number;
  current_chargeable_units: number;
  current_status: LeaveRequestStatus;
  created_source: LeaveCreatedSource;
  submitted_at: string | null;
  updated_at: string;
  has_open_conflict: boolean;
  replaces_request_group_id: string | null;
  superseded_by_request_group_id: string | null;
};

export type LeaveBalanceSummary = {
  employeeId: string;
  leaveTypeId: string;
  leaveTypeCode: string;
  leaveTypeName: string;
  leaveYear: number;
  isPaid: boolean;
  isBalanceTracked: boolean;
  allocatedUnits: number;
  carryoverUnits: number;
  adjustmentUnits: number;
  usedUnits: number;
  pendingUnits: number;
  availableUnits: number | null;
  expiringUnits: number;
  expiresOn: string | null;
};

export type LeaveReviewInput = {
  requestGroupId: string;
  expectedRequestRevisionId: string;
  expectedStatus: "pending";
  expectedDayFingerprint: string;
  expectedChargeableUnits: number;
  decision: LeaveReviewDecision;
  reviewText: string | null;
};

export type LeaveTypeOption = {
  leaveTypeId: string;
  leaveTypeVersionId: string;
  code: string;
  name: string;
  isPaid: boolean;
  isBalanceTracked: boolean;
  employeeNoteRequired: boolean;
  documentRequired: boolean;
  documentRequiredMinUnits: number | null;
};

export type LeaveDraftValues = {
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  durationMode: LeaveDurationMode;
  employeeNote: string;
  replacesRequestGroupId: string | null;
};

export type LeavePreviewDay = {
  leaveDate: string;
  scheduleName: string | null;
  classification: LeaveClassification;
  chargeableUnits: LeaveUnit;
  isHoliday: boolean;
  isRestDay: boolean;
  halfDayBoundaryAt: string | null;
};

export type LeavePreviewResult = {
  days: LeavePreviewDay[];
  requestedUnits: number;
  chargeableUnits: number;
  ledgerBalance: number | null;
  pendingReservedUnits: number;
  availableUnits: number | null;
  requiresDocument: boolean;
};

export type LeaveRequestListItem = {
  requestGroupId: string;
  employeeId: string;
  employeeName: string;
  employeeNumber: string | null;
  departmentName: string | null;
  leaveTypeName: string;
  isPaid: boolean;
  isBalanceTracked: boolean;
  startDate: string;
  endDate: string;
  durationMode: LeaveDurationMode;
  status: LeaveRequestStatus;
  requestedUnits: number;
  chargeableUnits: number;
  submittedAt: string | null;
  reviewedAt: string | null;
  replacesRequestGroupId: string | null;
  supersededByRequestGroupId: string | null;
};

export type LeaveRequestDetail = LeaveRequestListItem & {
  activeRevisionId: string;
  leaveTypeId: string;
  leaveTypeVersionId: string;
  leaveYear: number;
  employeeNote: string | null;
  otherPendingReservedUnits: number;
  dayFingerprint: string;
  days: Array<{
    requestDayId: string;
    activeDayRevisionId: string;
    leaveDate: string;
    scheduleName: string | null;
    classification: LeaveClassification;
    chargeableUnits: LeaveUnit;
    isHoliday: boolean;
    isRestDay: boolean;
    conflictState: string | null;
  }>;
  actions: Array<{
    id: string;
    actionType: string;
    fromStatus: LeaveRequestStatus | null;
    toStatus: LeaveRequestStatus;
    actorName: string | null;
    createdAt: string;
    privateText: string | null;
  }>;
  attachments: LeaveAttachment[];
  balance: LeaveBalanceSummary | null;
};

export type LeaveAttendanceConflict = {
  conflictId: string;
  conflictType: LeaveConflictType;
  status: LeaveConflictStatus;
  employeeId: string;
  employeeName: string;
  employeeNumber: string | null;
  leaveTypeName: string;
  leaveDate: string;
  durationMode: LeaveDurationMode;
  chargeableUnits: number;
  attendanceBaseStatus: string | null;
  automaticBalanceAction: string | null;
  createdAt: string;
};
```

- [ ] **Step 4: Implement safe error mapping**

Create `src/features/leave/errors.ts`:

```ts
const safeLeaveErrors: ReadonlyArray<readonly [string, string]> = [
  ["LEAVE_INSUFFICIENT_BALANCE", "The available leave balance cannot cover this action."],
  ["LEAVE_OVERLAP", "This request overlaps pending or approved leave."],
  ["LEAVE_NO_CHARGEABLE_DAYS", "Choose at least one scheduled workday."],
  ["LEAVE_OUTSIDE_DATE_WINDOW", "The selected dates are outside the allowed request window."],
  ["LEAVE_CROSSES_YEAR", "A request cannot cross calendar years."],
  ["LEAVE_HALF_DAY_RANGE_INVALID", "Half-day leave must use one calendar date."],
  ["LEAVE_DOCUMENT_REQUIRED", "A supporting document is required for this request."],
  ["LEAVE_POLICY_INACTIVE", "The selected leave type is not available for these dates."],
  ["LEAVE_NOT_ELIGIBLE", "The employee is not eligible for this leave type and year."],
  ["LEAVE_REQUEST_STALE", "This leave request changed while it was being reviewed. Reload and try again."],
  ["LEAVE_RECALCULATION_FAILED", "Leave and attendance could not be recalculated safely."],
  ["LEAVE_ATTACHMENT_INVALID", "One or more supporting documents are invalid."],
  ["LEAVE_PERMISSION_DENIED", "You do not have permission to perform this leave action."],
  ["LEAVE_INVALID_STATUS", "This action is not allowed for the current request status."],
  ["LEAVE_ADJUSTMENT_REASON_REQUIRED", "An adjustment reason is required."],
  ["LEAVE_REJECTION_REASON_REQUIRED", "A rejection reason is required."],
  ["LEAVE_CANCELLATION_REASON_REQUIRED", "A cancellation reason is required."],
  ["LEAVE_GENERATION_CONFLICT", "Leave-year generation changed or is already in progress. Reload and try again."],
];

export function mapLeaveError(message: string, fallback = "The leave action could not be completed.") {
  return safeLeaveErrors.find(([code]) => message.includes(code))?.[1] ?? fallback;
}
```

- [ ] **Step 5: Implement deterministic form validation**

Create `src/features/leave/validation.ts`. Use these helpers and exported functions exactly:

```ts
import {
  leaveDurationModes,
  type LeaveActionState,
  type LeaveDurationMode,
  type LeaveReviewInput,
} from "./types.ts";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}
function checked(formData: FormData, key: string) {
  return ["true", "on", "1"].includes(text(formData, key));
}
function halfIncrement(value: number) {
  return Number.isFinite(value) && value >= 0 && Number.isInteger(value * 2);
}
function invalid(fieldErrors: Record<string, string>, values: Record<string, string> = {}) {
  return { state: { error: "Please correct the highlighted fields.", fieldErrors, values } satisfies LeaveActionState };
}

export function validateLeaveTypeVersion(formData: FormData, companyDate: string) {
  const leaveTypeId = text(formData, "leave_type_id") || null;
  const code = text(formData, "code").toUpperCase();
  const effectiveFrom = text(formData, "effective_from");
  const name = text(formData, "name");
  const description = text(formData, "description") || null;
  const isActive = checked(formData, "is_active");
  const isPaid = checked(formData, "is_paid");
  const isBalanceTracked = checked(formData, "is_balance_tracked");
  const defaultUnitsText = text(formData, "default_annual_units") || "0";
  const defaultAnnualUnits = Number(defaultUnitsText);
  const carryoverEnabled = checked(formData, "carryover_enabled");
  const capText = text(formData, "carryover_cap_units");
  const carryoverCapUnits = capText ? Number(capText) : null;
  const employeeNoteRequired = checked(formData, "employee_note_required");
  const documentRequired = checked(formData, "document_required");
  const thresholdText = text(formData, "document_required_min_units");
  const documentRequiredMinUnits = thresholdText ? Number(thresholdText) : null;
  const changeReason = text(formData, "change_reason") || null;
  const fieldErrors: Record<string, string> = {};

  if (leaveTypeId && !uuidPattern.test(leaveTypeId)) fieldErrors.leave_type_id = "Invalid leave type.";
  if (!leaveTypeId && !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(code)) fieldErrors.code = "Code is required and may contain letters, numbers, and hyphens.";
  if (!datePattern.test(effectiveFrom)) fieldErrors.effective_from = "Effective date is required.";
  if (!name) fieldErrors.name = "Name is required.";
  else if (name.length > 100) fieldErrors.name = "Name must be 100 characters or fewer.";
  if (description && description.length > 1000) fieldErrors.description = "Description must be 1,000 characters or fewer.";
  if (!halfIncrement(defaultAnnualUnits)) fieldErrors.default_annual_units = "Annual units must use 0.5-day increments.";
  if (isPaid && !isBalanceTracked) fieldErrors.is_balance_tracked = "Paid leave must track a balance.";
  if (!isBalanceTracked && defaultAnnualUnits !== 0) fieldErrors.default_annual_units = "Balance-exempt leave must use 0 annual units.";
  if (!isBalanceTracked && carryoverEnabled) fieldErrors.carryover_enabled = "Balance-exempt leave cannot carry over units.";
  if (carryoverCapUnits !== null && (!halfIncrement(carryoverCapUnits) || carryoverCapUnits <= 0)) fieldErrors.carryover_cap_units = "Carryover cap must be a positive 0.5-day increment.";
  if (!carryoverEnabled && carryoverCapUnits !== null) fieldErrors.carryover_cap_units = "Enable carryover before setting a cap.";
  if (documentRequiredMinUnits !== null && (!documentRequired || !halfIncrement(documentRequiredMinUnits) || documentRequiredMinUnits <= 0)) fieldErrors.document_required_min_units = "Document threshold requires documents and a positive 0.5-day increment.";
  if (effectiveFrom && effectiveFrom <= companyDate && !changeReason && leaveTypeId) fieldErrors.change_reason = "A reason is required for a current or backdated version.";
  if (changeReason && changeReason.length > 1000) fieldErrors.change_reason = "Reason must be 1,000 characters or fewer.";

  if (Object.keys(fieldErrors).length) return invalid(fieldErrors, {
    effective_from: effectiveFrom,
    name,
    description: description ?? "",
    default_annual_units: defaultUnitsText,
    carryover_cap_units: capText,
    document_required_min_units: thresholdText,
  });

  return { data: {
    leaveTypeId,
    code,
    effectiveFrom,
    name,
    description,
    isActive,
    isPaid,
    isBalanceTracked,
    defaultAnnualUnits,
    carryoverEnabled,
    carryoverCapUnits,
    employeeNoteRequired,
    documentRequired,
    documentRequiredMinUnits,
    changeReason,
  } };
}

export function validateLeaveDraft(formData: FormData) {
  const employeeId = text(formData, "employee_id");
  const leaveTypeId = text(formData, "leave_type_id");
  const startDate = text(formData, "start_date");
  const endDate = text(formData, "end_date");
  const durationMode = text(formData, "duration_mode") as LeaveDurationMode;
  const employeeNote = text(formData, "employee_note") || null;
  const replacesRequestGroupId = text(formData, "replaces_request_group_id") || null;
  const fieldErrors: Record<string, string> = {};

  if (!uuidPattern.test(employeeId)) fieldErrors.employee_id = "Select a valid employee.";
  if (!uuidPattern.test(leaveTypeId)) fieldErrors.leave_type_id = "Select a valid leave type.";
  if (!datePattern.test(startDate)) fieldErrors.start_date = "Start date is required.";
  if (!datePattern.test(endDate)) fieldErrors.end_date = "End date is required.";
  else if (startDate && endDate < startDate) fieldErrors.end_date = "End date must be on or after the start date.";
  else if (startDate.slice(0, 4) !== endDate.slice(0, 4)) fieldErrors.end_date = "A request cannot cross calendar years.";
  if (!leaveDurationModes.includes(durationMode)) fieldErrors.duration_mode = "Choose full day, first half, or second half.";
  else if (durationMode !== "full_day" && startDate !== endDate) fieldErrors.duration_mode = "Half-day leave must use one calendar date.";
  if (employeeNote && employeeNote.length > 1000) fieldErrors.employee_note = "Note must be 1,000 characters or fewer.";
  if (replacesRequestGroupId && !uuidPattern.test(replacesRequestGroupId)) fieldErrors.replaces_request_group_id = "Invalid replacement request.";

  if (Object.keys(fieldErrors).length) return invalid(fieldErrors, {
    employee_id: employeeId,
    leave_type_id: leaveTypeId,
    start_date: startDate,
    end_date: endDate,
    duration_mode: durationMode,
  });
  return { data: { employeeId, leaveTypeId, startDate, endDate, durationMode, employeeNote, replacesRequestGroupId } };
}

export function validateLeaveReview(formData: FormData): { data?: LeaveReviewInput; state?: LeaveActionState } {
  const requestGroupId = text(formData, "request_group_id");
  const expectedRequestRevisionId = text(formData, "expected_request_revision_id");
  const expectedStatus = text(formData, "expected_status");
  const expectedDayFingerprint = text(formData, "expected_day_fingerprint");
  const unitsText = text(formData, "expected_chargeable_units");
  const expectedChargeableUnits = Number(unitsText);
  const decision = text(formData, "decision");
  const reviewText = text(formData, "review_text") || null;
  const fieldErrors: Record<string, string> = {};

  if (!uuidPattern.test(requestGroupId)) fieldErrors.request_group_id = "Invalid leave request.";
  if (!uuidPattern.test(expectedRequestRevisionId)) fieldErrors.expected_request_revision_id = "Invalid request revision.";
  if (expectedStatus !== "pending") fieldErrors.expected_status = "This request is no longer pending.";
  if (!expectedDayFingerprint) fieldErrors.expected_day_fingerprint = "Reload the current request details.";
  if (!halfIncrement(expectedChargeableUnits) || expectedChargeableUnits <= 0) fieldErrors.expected_chargeable_units = "Reload the current request totals.";
  if (decision !== "approve" && decision !== "reject") fieldErrors.decision = "Choose approve or reject.";
  if (decision === "reject" && !reviewText) fieldErrors.review_text = "A rejection reason is required.";
  if (reviewText && reviewText.length > 1000) fieldErrors.review_text = "Review text must be 1,000 characters or fewer.";

  if (Object.keys(fieldErrors).length) return invalid(fieldErrors);
  return { data: {
    requestGroupId,
    expectedRequestRevisionId,
    expectedStatus: "pending",
    expectedDayFingerprint,
    expectedChargeableUnits,
    decision: decision as "approve" | "reject",
    reviewText,
  } };
}

export function validateLeaveCancellation(formData: FormData) {
  const requestGroupId = text(formData, "request_group_id");
  const expectedStatus = text(formData, "expected_status");
  const reason = text(formData, "reason");
  const fieldErrors: Record<string, string> = {};
  if (!uuidPattern.test(requestGroupId)) fieldErrors.request_group_id = "Invalid leave request.";
  if (expectedStatus !== "approved") fieldErrors.expected_status = "Only approved leave can be cancelled.";
  if (!reason) fieldErrors.reason = "A cancellation reason is required.";
  else if (reason.length > 1000) fieldErrors.reason = "Reason must be 1,000 characters or fewer.";
  if (Object.keys(fieldErrors).length) return invalid(fieldErrors);
  return { data: { requestGroupId, expectedStatus: "approved" as const, reason } };
}

export function validateLeaveAdjustment(formData: FormData, currentYear: number) {
  const employeeId = text(formData, "employee_id");
  const leaveTypeId = text(formData, "leave_type_id");
  const leaveYear = Number(text(formData, "leave_year"));
  const units = Number(text(formData, "units"));
  const reason = text(formData, "reason");
  const fieldErrors: Record<string, string> = {};
  if (!uuidPattern.test(employeeId)) fieldErrors.employee_id = "Select a valid employee.";
  if (!uuidPattern.test(leaveTypeId)) fieldErrors.leave_type_id = "Select a valid leave type.";
  if (!Number.isInteger(leaveYear) || leaveYear < currentYear - 1 || leaveYear > currentYear + 1) fieldErrors.leave_year = "Choose the prior, current, or next leave year.";
  if (!Number.isFinite(units) || units === 0 || !Number.isInteger(units * 2)) fieldErrors.units = "Units must use 0.5-day increments.";
  if (!reason) fieldErrors.reason = "An adjustment reason is required.";
  else if (reason.length > 1000) fieldErrors.reason = "Reason must be 1,000 characters or fewer.";
  if (Object.keys(fieldErrors).length) return invalid(fieldErrors, { employee_id: employeeId, leave_type_id: leaveTypeId, leave_year: String(leaveYear), units: String(units) });
  return { data: { employeeId, leaveTypeId, leaveYear, units, reason } };
}

export function validateLeaveYearOpening(formData: FormData, currentYear: number) {
  const leaveYear = Number(text(formData, "leave_year"));
  const fieldErrors: Record<string, string> = {};
  if (!Number.isInteger(leaveYear) || ![currentYear, currentYear + 1].includes(leaveYear)) fieldErrors.leave_year = "Choose the current or next leave year.";
  if (Object.keys(fieldErrors).length) return invalid(fieldErrors, { leave_year: String(leaveYear) });
  return { data: { leaveYear } };
}
```

- [ ] **Step 6: Implement presentation helpers**

Create `src/features/leave/presentation.ts`:

```ts
import type {
  LeaveConflictType,
  LeaveDurationMode,
  LeaveRequestStatus,
} from "./types.ts";

const statusLabels: Record<LeaveRequestStatus, string> = {
  draft: "Draft",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  cancelled: "Cancelled",
  superseded: "Superseded",
};
const durationLabels: Record<LeaveDurationMode, string> = {
  full_day: "Full day",
  first_half: "First half",
  second_half: "Second half",
};
const conflictLabels: Record<LeaveConflictType, string> = {
  full_day_completed_attendance: "Completed attendance during full-day leave",
  full_day_incomplete_attendance: "Incomplete attendance during full-day leave",
  half_day_covered_time_overlap: "Attendance overlapped the leave-covered half",
  schedule_recalculation_failed: "Schedule recalculation failed",
  holiday_recalculation_failed: "Holiday recalculation failed",
  insufficient_balance_after_recalculation: "Insufficient balance after recalculation",
};

export function formatLeaveUnits(units: number) {
  const value = Number.isInteger(units) ? String(units) : units.toFixed(1);
  return `${value} ${units === 0.5 || units === 1 ? "day" : "days"}`;
}
export function leaveStatusLabel(status: LeaveRequestStatus) { return statusLabels[status]; }
export function leaveDurationLabel(mode: LeaveDurationMode) { return durationLabels[mode]; }
export function leaveConflictLabel(type: LeaveConflictType) { return conflictLabels[type]; }
```

- [ ] **Step 7: Run focused and full tests**

Run:

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/leave/validation.test.ts \
  src/features/leave/presentation.test.ts
npm test
```

Expected: the focused tests pass, then all 399 existing tests plus the new leave tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/features/leave/constants.ts src/features/leave/types.ts \
  src/features/leave/errors.ts src/features/leave/validation.ts \
  src/features/leave/validation.test.ts src/features/leave/presentation.ts \
  src/features/leave/presentation.test.ts
git commit -m "feat: define leave domain contracts"
```

## Task 2: Leave migration foundation, tables, constraints, indexes, bucket, and base RLS

**Files:**
- Create: `supabase/migrations/202607160001_leave_management.sql`
- Create: `src/features/leave/migration.test.ts`
- Create: `src/features/leave/security.test.ts`

**Interfaces:**
- Consumes: `profiles`, `employees`, `departments`, schedule tables, holiday version tables, attendance calculation revisions, `employee_audit_logs`, `public.current_employee_id()`, `public.is_hr_admin()`, and `public.write_employee_audit(...)`.
- Produces: all Phase 6 base tables, `leave_pending_reservations`, `leave_current_day_state`, the private `leave-documents` bucket, indexes, immutability triggers, and base RLS policy boundaries used by later RPC tasks.

- [ ] **Step 1: Write migration structure and security tests**

Create `src/features/leave/migration.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL("../../../supabase/migrations/202607160001_leave_management.sql", import.meta.url),
  "utf8",
);

const tables = [
  "leave_types",
  "leave_type_versions",
  "employee_leave_year_settings",
  "leave_request_groups",
  "leave_request_revisions",
  "leave_request_days",
  "leave_request_day_revisions",
  "leave_request_actions",
  "leave_request_attachments",
  "leave_balance_accounts",
  "leave_balance_ledger",
  "leave_attendance_conflicts",
];

test("migration creates every approved leave table", () => {
  for (const table of tables) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, "i"));
  }
});

test("migration preserves stable identities and active pointers", () => {
  assert.match(sql, /leave_types_code_unique/i);
  assert.match(sql, /leave_type_versions_revision_unique/i);
  assert.match(sql, /leave_request_groups_active_revision_fkey/i);
  assert.match(sql, /leave_request_days_active_revision_fkey/i);
  assert.match(sql, /employee_leave_year_setting_unique/i);
  assert.match(sql, /leave_balance_account_unique/i);
});

test("approved lifecycle, duration, units, classifications, ledger entries, and conflicts are constrained", () => {
  for (const value of [
    "draft", "pending", "approved", "rejected", "withdrawn", "cancelled", "superseded",
    "full_day", "first_half", "second_half",
    "paid_leave", "unpaid_leave", "non_chargeable_holiday", "non_chargeable_rest_day",
    "non_chargeable_no_schedule", "attendance_precedence",
    "annual_allocation", "carryover", "hr_adjustment_credit", "hr_adjustment_debit",
    "approved_leave_charge", "cancellation_restoration", "attendance_conflict_release",
    "recalculation_charge", "recalculation_release",
    "full_day_completed_attendance", "full_day_incomplete_attendance",
    "half_day_covered_time_overlap", "schedule_recalculation_failed",
    "holiday_recalculation_failed", "insufficient_balance_after_recalculation",
  ]) assert.match(sql, new RegExp(`'${value}'`, "i"));
  assert.match(sql, /units \* 2 = trunc\(units \* 2\)/i);
  assert.match(sql, /chargeable_units in \(0, 0\.5, 1\)/i);
});

test("submitted and accounting history use append-only guards", () => {
  assert.match(sql, /create or replace function public\.prevent_leave_immutable_mutation/i);
  for (const table of [
    "leave_type_versions",
    "leave_request_day_revisions",
    "leave_request_actions",
    "leave_balance_ledger",
  ]) assert.match(sql, new RegExp(`before update or delete on public\\.${table}`, "i"));
});

test("request-day identities are immutable while the active revision pointer may advance", () => {
  assert.match(sql, /create or replace function public\.prevent_leave_request_day_identity_mutation/i);
  assert.match(sql, /before update or delete on public\.leave_request_days/i);
  assert.match(sql, /new\.request_revision_id is distinct from old\.request_revision_id/i);
  assert.match(sql, /new\.leave_date is distinct from old\.leave_date/i);
  assert.match(sql, /new\.active_revision_id is not null/i);
  assert.match(sql, /day_revision\.request_day_id = old\.id/i);
  assert.match(sql, /return new;/i);
});

test("pending reservations and active day state are derived views", () => {
  assert.match(sql, /create or replace view public\.leave_pending_reservations/i);
  assert.match(sql, /current_status = 'pending'/i);
  assert.match(sql, /create or replace view public\.leave_current_day_state/i);
  assert.match(sql, /active_revision_id/i);
});

test("leave storage bucket is private and constrained", () => {
  assert.match(sql, /insert into storage\.buckets/i);
  assert.match(sql, /'leave-documents'/i);
  assert.match(sql, /10 \* 1024 \* 1024/i);
  assert.match(sql, /application\/pdf/i);
  assert.match(sql, /image\/jpeg/i);
  assert.match(sql, /image\/png/i);
});

test("migration is one transaction and refreshes PostgREST once", () => {
  const normalized = sql.toLowerCase();
  assert.equal((normalized.match(/^begin;/gm) ?? []).length, 1);
  assert.equal((normalized.match(/^commit;/gm) ?? []).length, 1);
  assert.equal((normalized.match(/notify pgrst, 'reload schema';/g) ?? []).length, 1);
});
```

Create `src/features/leave/security.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL("../../../supabase/migrations/202607160001_leave_management.sql", import.meta.url),
  "utf8",
);

const baseTables = [
  "leave_types", "leave_type_versions", "employee_leave_year_settings",
  "leave_request_groups", "leave_request_revisions", "leave_request_days",
  "leave_request_day_revisions", "leave_request_actions", "leave_request_attachments",
  "leave_balance_accounts", "leave_balance_ledger", "leave_attendance_conflicts",
];

test("RLS is enabled on every leave base table", () => {
  for (const table of baseTables) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
});

test("ledger and immutable submitted history have no direct write policies", () => {
  for (const table of [
    "leave_type_versions", "leave_request_days", "leave_request_day_revisions",
    "leave_request_actions", "leave_balance_accounts", "leave_balance_ledger",
  ]) {
    assert.doesNotMatch(
      sql,
      new RegExp(`create policy[^;]+${table}[^;]+for (insert|update|delete)`, "i"),
    );
  }
});

test("employee reads are scoped by current employee and HR reads use role checks", () => {
  assert.match(sql, /public\.current_employee_id\(\)/i);
  assert.match(sql, /public\.is_hr_admin\(\)/i);
  assert.doesNotMatch(sql, /using \(true\)/i);
});

test("private storage policies scope objects to request ownership or HR", () => {
  assert.match(sql, /on storage\.objects/i);
  assert.match(sql, /bucket_id = 'leave-documents'/i);
  assert.match(sql, /public\.can_access_leave_storage_object/i);
  assert.doesNotMatch(sql, /create policy[^;]+storage\.objects[^;]+using \(true\)/i);
});
```

- [ ] **Step 2: Run migration tests and verify they fail**

Run:

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/leave/migration.test.ts \
  src/features/leave/security.test.ts
```

Expected: failure because the migration does not exist.

- [ ] **Step 3: Create the migration transaction and exact tables**

Create `supabase/migrations/202607160001_leave_management.sql` starting with:

```sql
begin;

create extension if not exists pgcrypto;

create table if not exists public.leave_types (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint leave_types_code_unique unique (code),
  constraint leave_types_code_check check (code ~ '^[A-Z][A-Z0-9-]{1,49}$')
);

create table if not exists public.leave_type_versions (
  id uuid primary key default gen_random_uuid(),
  leave_type_id uuid not null references public.leave_types(id) on delete restrict,
  revision_number integer not null,
  effective_from date not null,
  name text not null,
  description text,
  is_active boolean not null default true,
  is_paid boolean not null,
  is_balance_tracked boolean not null,
  default_annual_units numeric(6,1) not null default 0,
  carryover_enabled boolean not null default false,
  carryover_cap_units numeric(6,1),
  employee_note_required boolean not null default false,
  document_required boolean not null default false,
  document_required_min_units numeric(6,1),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  change_reason text,
  constraint leave_type_versions_revision_unique unique (leave_type_id, revision_number),
  constraint leave_type_versions_effective_unique unique (leave_type_id, effective_from),
  constraint leave_type_versions_name_check check (char_length(btrim(name)) between 1 and 100),
  constraint leave_type_versions_description_check check (description is null or char_length(description) <= 1000),
  constraint leave_type_versions_paid_check check (not is_paid or is_balance_tracked),
  constraint leave_type_versions_default_units_check check (
    default_annual_units >= 0
    and default_annual_units * 2 = trunc(default_annual_units * 2)
    and (is_balance_tracked or default_annual_units = 0)
  ),
  constraint leave_type_versions_carryover_check check (
    (is_balance_tracked or (not carryover_enabled and carryover_cap_units is null))
    and (carryover_enabled or carryover_cap_units is null)
    and (carryover_cap_units is null or (
      carryover_cap_units > 0
      and carryover_cap_units * 2 = trunc(carryover_cap_units * 2)
    ))
  ),
  constraint leave_type_versions_document_check check (
    document_required
    or document_required_min_units is null
  ),
  constraint leave_type_versions_document_units_check check (
    document_required_min_units is null
    or (
      document_required_min_units > 0
      and document_required_min_units * 2 = trunc(document_required_min_units * 2)
    )
  ),
  constraint leave_type_versions_reason_check check (change_reason is null or char_length(change_reason) <= 1000)
);

create table if not exists public.employee_leave_year_settings (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  leave_type_id uuid not null references public.leave_types(id) on delete restrict,
  leave_year integer not null,
  is_excluded boolean not null default false,
  annual_allocation_override_units numeric(6,1),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz,
  private_reason text,
  constraint employee_leave_year_setting_unique unique (employee_id, leave_type_id, leave_year),
  constraint employee_leave_year_setting_year_check check (leave_year between 2000 and 2200),
  constraint employee_leave_year_setting_units_check check (
    annual_allocation_override_units is null
    or (
      annual_allocation_override_units >= 0
      and annual_allocation_override_units * 2 = trunc(annual_allocation_override_units * 2)
    )
  ),
  constraint employee_leave_year_setting_reason_check check (private_reason is null or char_length(private_reason) <= 1000)
);

create table if not exists public.leave_request_groups (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_source text not null,
  active_revision_id uuid,
  current_status text not null default 'draft',
  replaces_request_group_id uuid references public.leave_request_groups(id) on delete restrict,
  superseded_by_request_group_id uuid references public.leave_request_groups(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_request_groups_source_check check (created_source in ('employee', 'hr')),
  constraint leave_request_groups_status_check check (current_status in (
    'draft','pending','approved','rejected','withdrawn','cancelled','superseded'
  )),
  constraint leave_request_groups_replacement_check check (
    replaces_request_group_id is null or replaces_request_group_id <> id
  )
);

create table if not exists public.leave_request_revisions (
  id uuid primary key default gen_random_uuid(),
  request_group_id uuid not null references public.leave_request_groups(id) on delete cascade,
  revision_number integer not null,
  leave_type_version_id uuid not null references public.leave_type_versions(id) on delete restrict,
  leave_year integer not null,
  start_date date not null,
  end_date date not null,
  duration_mode text not null,
  employee_note text,
  requested_units numeric(6,1) not null,
  submitted_chargeable_units numeric(6,1) not null default 0,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  submitted_at timestamptz,
  frozen_at timestamptz,
  constraint leave_request_revisions_revision_unique unique (request_group_id, revision_number),
  constraint leave_request_revisions_dates_check check (
    start_date <= end_date
    and extract(year from start_date)::integer = leave_year
    and extract(year from end_date)::integer = leave_year
  ),
  constraint leave_request_revisions_duration_check check (
    duration_mode in ('full_day','first_half','second_half')
    and (duration_mode = 'full_day' or start_date = end_date)
  ),
  constraint leave_request_revisions_note_check check (employee_note is null or char_length(employee_note) <= 1000),
  constraint leave_request_revisions_units_check check (
    requested_units > 0
    and requested_units * 2 = trunc(requested_units * 2)
    and submitted_chargeable_units >= 0
    and submitted_chargeable_units * 2 = trunc(submitted_chargeable_units * 2)
  )
);

alter table public.leave_request_groups
  add constraint leave_request_groups_active_revision_fkey
  foreign key (active_revision_id)
  references public.leave_request_revisions(id)
  on delete restrict
  deferrable initially deferred;

create table if not exists public.leave_request_days (
  id uuid primary key default gen_random_uuid(),
  request_revision_id uuid not null references public.leave_request_revisions(id) on delete restrict,
  leave_date date not null,
  active_revision_id uuid,
  created_at timestamptz not null default now(),
  constraint leave_request_days_unique unique (request_revision_id, leave_date)
);

create table if not exists public.leave_request_day_revisions (
  id uuid primary key default gen_random_uuid(),
  request_day_id uuid not null references public.leave_request_days(id) on delete restrict,
  revision_number integer not null,
  schedule_assignment_id uuid references public.employee_schedule_assignments(id) on delete restrict,
  schedule_version_id uuid references public.work_schedule_versions(id) on delete restrict,
  holiday_version_id uuid references public.holiday_calendar_versions(id) on delete restrict,
  attendance_calculation_revision_id uuid references public.attendance_calculation_revisions(id) on delete restrict,
  is_scheduled_workday boolean not null,
  is_rest_day boolean not null,
  is_holiday boolean not null,
  is_chargeable boolean not null,
  chargeable_units numeric(2,1) not null,
  leave_classification text not null,
  half_day_boundary_at timestamptz,
  conflict_state text,
  calculation_source text not null,
  calculated_by uuid references public.profiles(id) on delete set null,
  calculated_at timestamptz not null default now(),
  recalculation_reason text,
  constraint leave_request_day_revisions_unique unique (request_day_id, revision_number),
  constraint leave_request_day_units_check check (
    chargeable_units in (0, 0.5, 1)
    and is_chargeable = (chargeable_units > 0)
  ),
  constraint leave_request_day_classification_check check (leave_classification in (
    'paid_leave','unpaid_leave','non_chargeable_holiday','non_chargeable_rest_day',
    'non_chargeable_no_schedule','attendance_precedence'
  )),
  constraint leave_request_day_source_check check (calculation_source in (
    'submission','approval_refresh','attendance_recalculation','schedule_recalculation','holiday_recalculation','cancellation'
  )),
  constraint leave_request_day_reason_check check (recalculation_reason is null or char_length(recalculation_reason) <= 1000)
);

alter table public.leave_request_days
  add constraint leave_request_days_active_revision_fkey
  foreign key (active_revision_id)
  references public.leave_request_day_revisions(id)
  on delete restrict
  deferrable initially deferred;

create table if not exists public.leave_request_actions (
  id uuid primary key default gen_random_uuid(),
  request_group_id uuid not null references public.leave_request_groups(id) on delete restrict,
  request_revision_id uuid not null references public.leave_request_revisions(id) on delete restrict,
  action_type text not null,
  from_status text,
  to_status text not null,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  actor_role text not null,
  action_reason text,
  review_note text,
  created_at timestamptz not null default now(),
  constraint leave_request_actions_type_check check (action_type in (
    'created','submitted','approved','rejected','withdrawn','cancelled','superseded'
  )),
  constraint leave_request_actions_status_check check (
    (from_status is null or from_status in ('draft','pending','approved','rejected','withdrawn','cancelled','superseded'))
    and to_status in ('draft','pending','approved','rejected','withdrawn','cancelled','superseded')
  ),
  constraint leave_request_actions_private_text_check check (
    (action_reason is null or char_length(action_reason) <= 1000)
    and (review_note is null or char_length(review_note) <= 1000)
  )
);

create table if not exists public.leave_request_attachments (
  id uuid primary key default gen_random_uuid(),
  request_group_id uuid not null references public.leave_request_groups(id) on delete cascade,
  request_revision_id uuid not null references public.leave_request_revisions(id) on delete cascade,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  uploaded_at timestamptz not null default now(),
  frozen_at timestamptz,
  constraint leave_request_attachment_filename_check check (char_length(original_filename) between 1 and 255),
  constraint leave_request_attachment_mime_check check (mime_type in ('application/pdf','image/jpeg','image/png')),
  constraint leave_request_attachment_size_check check (size_bytes between 1 and 10485760)
);

create table if not exists public.leave_balance_accounts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  leave_type_id uuid not null references public.leave_types(id) on delete restrict,
  leave_year integer not null,
  created_at timestamptz not null default now(),
  constraint leave_balance_account_unique unique (employee_id, leave_type_id, leave_year),
  constraint leave_balance_account_year_check check (leave_year between 2000 and 2200)
);

create table if not exists public.leave_balance_ledger (
  id uuid primary key default gen_random_uuid(),
  balance_account_id uuid not null references public.leave_balance_accounts(id) on delete restrict,
  entry_type text not null,
  units numeric(6,1) not null,
  effective_date date not null,
  expires_on date,
  source_entry_id uuid references public.leave_balance_ledger(id) on delete restrict,
  reversal_of_entry_id uuid references public.leave_balance_ledger(id) on delete restrict,
  request_group_id uuid references public.leave_request_groups(id) on delete restrict,
  request_day_revision_id uuid references public.leave_request_day_revisions(id) on delete restrict,
  generation_key text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  private_reason text,
  metadata jsonb not null default '{}'::jsonb,
  constraint leave_balance_ledger_generation_unique unique (generation_key),
  constraint leave_balance_ledger_type_check check (entry_type in (
    'annual_allocation','carryover','hr_adjustment_credit','hr_adjustment_debit',
    'approved_leave_charge','cancellation_restoration','attendance_conflict_release',
    'recalculation_charge','recalculation_release'
  )),
  constraint leave_balance_ledger_units_check check (
    units <> 0 and units * 2 = trunc(units * 2)
  ),
  constraint leave_balance_ledger_sign_check check (
    (entry_type in ('annual_allocation','carryover','hr_adjustment_credit','cancellation_restoration','attendance_conflict_release','recalculation_release') and units > 0)
    or (entry_type in ('hr_adjustment_debit','approved_leave_charge','recalculation_charge') and units < 0)
  ),
  constraint leave_balance_ledger_reason_check check (private_reason is null or char_length(private_reason) <= 1000)
);

create table if not exists public.leave_attendance_conflicts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  request_group_id uuid not null references public.leave_request_groups(id) on delete restrict,
  request_day_id uuid not null references public.leave_request_days(id) on delete restrict,
  leave_day_revision_id uuid not null references public.leave_request_day_revisions(id) on delete restrict,
  attendance_calculation_revision_id uuid references public.attendance_calculation_revisions(id) on delete restrict,
  conflict_type text not null,
  status text not null default 'open',
  automatic_balance_action text,
  created_at timestamptz not null default now(),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  resolution_type text,
  private_resolution_note text,
  constraint leave_conflict_type_check check (conflict_type in (
    'full_day_completed_attendance','full_day_incomplete_attendance','half_day_covered_time_overlap',
    'schedule_recalculation_failed','holiday_recalculation_failed','insufficient_balance_after_recalculation'
  )),
  constraint leave_conflict_status_check check (status in ('open','resolved','superseded')),
  constraint leave_conflict_note_check check (private_resolution_note is null or char_length(private_resolution_note) <= 1000)
);
```

- [ ] **Step 4: Add indexes and derived views**

Append:

```sql
create index if not exists leave_type_versions_effective_idx
  on public.leave_type_versions(leave_type_id, effective_from desc, revision_number desc);
create index if not exists employee_leave_year_settings_year_idx
  on public.employee_leave_year_settings(leave_year, leave_type_id, employee_id);
create index if not exists leave_request_groups_employee_status_idx
  on public.leave_request_groups(employee_id, current_status, updated_at desc);
create index if not exists leave_request_revisions_dates_idx
  on public.leave_request_revisions(leave_year, start_date, end_date);
create index if not exists leave_request_days_date_idx
  on public.leave_request_days(leave_date, request_revision_id);
create index if not exists leave_request_day_revisions_active_context_idx
  on public.leave_request_day_revisions(request_day_id, revision_number desc);
create index if not exists leave_balance_ledger_account_expiration_idx
  on public.leave_balance_ledger(balance_account_id, expires_on, created_at, id);
create index if not exists leave_balance_ledger_request_idx
  on public.leave_balance_ledger(request_group_id, request_day_revision_id);
create index if not exists leave_conflicts_queue_idx
  on public.leave_attendance_conflicts(status, conflict_type, created_at desc);

create or replace view public.leave_current_day_state
with (security_invoker = true)
as
select
  day.id as request_day_id,
  day.request_revision_id,
  day.leave_date,
  revision.id as request_day_revision_id,
  revision.revision_number,
  revision.schedule_assignment_id,
  revision.schedule_version_id,
  revision.holiday_version_id,
  revision.attendance_calculation_revision_id,
  revision.is_scheduled_workday,
  revision.is_rest_day,
  revision.is_holiday,
  revision.is_chargeable,
  revision.chargeable_units,
  revision.leave_classification,
  revision.half_day_boundary_at,
  revision.conflict_state,
  revision.calculation_source,
  revision.calculated_by,
  revision.calculated_at,
  revision.recalculation_reason
from public.leave_request_days as day
join public.leave_request_day_revisions as revision
  on revision.id = day.active_revision_id;

create or replace view public.leave_pending_reservations
with (security_invoker = true)
as
select
  request_group.employee_id,
  version.leave_type_id,
  request_revision.leave_year,
  sum(day_revision.chargeable_units)::numeric(10,1) as reserved_units
from public.leave_request_groups as request_group
join public.leave_request_revisions as request_revision
  on request_revision.id = request_group.active_revision_id
join public.leave_type_versions as version
  on version.id = request_revision.leave_type_version_id
join public.leave_request_days as day
  on day.request_revision_id = request_revision.id
join public.leave_request_day_revisions as day_revision
  on day_revision.id = day.active_revision_id
where request_group.current_status = 'pending'
  and day_revision.is_chargeable
  and version.is_balance_tracked
group by request_group.employee_id, version.leave_type_id, request_revision.leave_year;
```

Add a leave-specific audit wrapper before the immutable guards so later tasks use one safe five-argument contract:

```sql
create or replace function public.write_leave_audit(
  p_employee_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_safe_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if jsonb_typeof(coalesce(p_safe_metadata, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = 'P0001', message = 'LEAVE_AUDIT_PAYLOAD_INVALID';
  end if;
  return public.write_employee_audit(
    p_employee_id,
    p_action,
    p_entity_type,
    p_entity_id,
    '[]'::jsonb,
    '{}'::jsonb,
    '{}'::jsonb,
    coalesce(p_safe_metadata, '{}'::jsonb),
    'application',
    auth.uid()
  );
end;
$$;

revoke all on function public.write_leave_audit(uuid,text,text,uuid,jsonb)
from public, anon, authenticated;
```

Only IDs, dates, numeric units, statuses, and non-confidential booleans may be passed in `p_safe_metadata`. Notes, reasons, filenames, paths, and document metadata remain excluded.

- [ ] **Step 5: Add immutable-history guards**

Append:

```sql
create or replace function public.prevent_leave_immutable_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception using errcode = 'P0001', message = 'LEAVE_IMMUTABLE_RECORD';
end;
$$;

create trigger prevent_leave_type_version_mutation
before update or delete on public.leave_type_versions
for each row execute function public.prevent_leave_immutable_mutation();

create or replace function public.prevent_leave_request_day_identity_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'LEAVE_IMMUTABLE_RECORD';
  end if;

  if new.id is distinct from old.id
     or new.request_revision_id is distinct from old.request_revision_id
     or new.leave_date is distinct from old.leave_date
     or new.created_at is distinct from old.created_at then
    raise exception using errcode = 'P0001', message = 'LEAVE_IMMUTABLE_RECORD';
  end if;

  if new.active_revision_id is not null
     and not exists (
       select 1
       from public.leave_request_day_revisions as day_revision
       where day_revision.id = new.active_revision_id
         and day_revision.request_day_id = old.id
     ) then
    raise exception using errcode = 'P0001', message = 'LEAVE_ACTIVE_REVISION_MISMATCH';
  end if;

  return new;
end;
$$;

create trigger protect_leave_request_day_identity
before update or delete on public.leave_request_days
for each row execute function public.prevent_leave_request_day_identity_mutation();
create trigger prevent_leave_request_day_revision_mutation
before update or delete on public.leave_request_day_revisions
for each row execute function public.prevent_leave_immutable_mutation();
create trigger prevent_leave_request_action_mutation
before update or delete on public.leave_request_actions
for each row execute function public.prevent_leave_immutable_mutation();
create trigger prevent_leave_balance_ledger_mutation
before update or delete on public.leave_balance_ledger
for each row execute function public.prevent_leave_immutable_mutation();

revoke all on function public.prevent_leave_immutable_mutation()
from public, anon, authenticated;
revoke all on function public.prevent_leave_request_day_identity_mutation()
from public, anon, authenticated;
```

`leave_request_days` protects its identity and deletion while allowing only `active_revision_id` to advance to a revision belonging to the same day. This preserves append-only day history while enabling Tasks 7, 9, and 10 to activate newly appended recalculation revisions. Do not place the generic immutable trigger on `leave_request_revisions`; Task 5 adds a targeted trigger that permits draft updates but rejects submitted updates and all submitted deletes.

- [ ] **Step 6: Add private bucket and ownership helper**

Append:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'leave-documents',
  'leave-documents',
  false,
  10 * 1024 * 1024,
  array['application/pdf','image/jpeg','image/png']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_access_leave_storage_object(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.is_hr_admin()
    or exists (
      select 1
      from public.leave_request_attachments as attachment
      join public.leave_request_groups as request_group
        on request_group.id = attachment.request_group_id
      where attachment.storage_path = p_object_name
        and request_group.employee_id = public.current_employee_id()
    )
    or exists (
      select 1
      from public.leave_request_groups as request_group
      join public.leave_request_revisions as request_revision
        on request_revision.id = request_group.active_revision_id
      where request_group.employee_id = public.current_employee_id()
        and request_group.current_status = 'draft'
        and p_object_name like request_group.employee_id::text || '/' || request_group.id::text || '/%'
    );
$$;

revoke all on function public.can_access_leave_storage_object(text)
from public, anon;
grant execute on function public.can_access_leave_storage_object(text)
to authenticated;

create policy "Authorized users read leave documents"
on storage.objects for select to authenticated
using (
  bucket_id = 'leave-documents'
  and public.can_access_leave_storage_object(name)
);
create policy "Authorized users upload draft leave documents"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'leave-documents'
  and public.can_access_leave_storage_object(name)
);
create policy "Authorized users delete draft leave documents"
on storage.objects for delete to authenticated
using (
  bucket_id = 'leave-documents'
  and public.can_access_leave_storage_object(name)
  and exists (
    select 1
    from public.leave_request_groups as request_group
    where request_group.current_status = 'draft'
      and name like request_group.employee_id::text || '/' || request_group.id::text || '/%'
  )
);
```

- [ ] **Step 7: Enable RLS and add read-only base policies**

Append:

```sql
alter table public.leave_types enable row level security;
alter table public.leave_type_versions enable row level security;
alter table public.employee_leave_year_settings enable row level security;
alter table public.leave_request_groups enable row level security;
alter table public.leave_request_revisions enable row level security;
alter table public.leave_request_days enable row level security;
alter table public.leave_request_day_revisions enable row level security;
alter table public.leave_request_actions enable row level security;
alter table public.leave_request_attachments enable row level security;
alter table public.leave_balance_accounts enable row level security;
alter table public.leave_balance_ledger enable row level security;
alter table public.leave_attendance_conflicts enable row level security;

create policy "HR views leave types"
on public.leave_types for select to authenticated
using (public.is_hr_admin());
create policy "HR views leave type versions"
on public.leave_type_versions for select to authenticated
using (public.is_hr_admin());
create policy "HR views employee leave year settings"
on public.employee_leave_year_settings for select to authenticated
using (public.is_hr_admin());

create policy "Authorized users view leave request groups"
on public.leave_request_groups for select to authenticated
using (public.is_hr_admin() or employee_id = public.current_employee_id());
create policy "Authorized users view leave request revisions"
on public.leave_request_revisions for select to authenticated
using (
  exists (
    select 1 from public.leave_request_groups as request_group
    where request_group.id = request_group_id
      and (public.is_hr_admin() or request_group.employee_id = public.current_employee_id())
  )
);
create policy "Authorized users view leave request days"
on public.leave_request_days for select to authenticated
using (
  exists (
    select 1
    from public.leave_request_revisions as request_revision
    join public.leave_request_groups as request_group
      on request_group.id = request_revision.request_group_id
    where request_revision.id = request_revision_id
      and (public.is_hr_admin() or request_group.employee_id = public.current_employee_id())
  )
);
create policy "Authorized users view leave request day revisions"
on public.leave_request_day_revisions for select to authenticated
using (
  exists (
    select 1
    from public.leave_request_days as request_day
    join public.leave_request_revisions as request_revision
      on request_revision.id = request_day.request_revision_id
    join public.leave_request_groups as request_group
      on request_group.id = request_revision.request_group_id
    where request_day.id = request_day_id
      and (public.is_hr_admin() or request_group.employee_id = public.current_employee_id())
  )
);
create policy "Authorized users view leave request actions"
on public.leave_request_actions for select to authenticated
using (
  exists (
    select 1 from public.leave_request_groups as request_group
    where request_group.id = request_group_id
      and (public.is_hr_admin() or request_group.employee_id = public.current_employee_id())
  )
);
create policy "Authorized users view leave attachments"
on public.leave_request_attachments for select to authenticated
using (
  exists (
    select 1 from public.leave_request_groups as request_group
    where request_group.id = request_group_id
      and (public.is_hr_admin() or request_group.employee_id = public.current_employee_id())
  )
);
create policy "HR views leave balance accounts"
on public.leave_balance_accounts for select to authenticated
using (public.is_hr_admin());
create policy "HR views leave ledger"
on public.leave_balance_ledger for select to authenticated
using (public.is_hr_admin());
create policy "HR views leave conflicts"
on public.leave_attendance_conflicts for select to authenticated
using (public.is_hr_admin());

revoke all on public.leave_current_day_state from public, anon;
revoke all on public.leave_pending_reservations from public, anon;
grant select on public.leave_current_day_state to authenticated;
grant select on public.leave_pending_reservations to authenticated;
```

No direct insert, update, or delete policies are created. Later public RPCs perform every mutation.

- [ ] **Step 8: Finish transaction and run tests**

Append once at the end of the migration:

```sql
notify pgrst, 'reload schema';
commit;
```

Run:

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/leave/migration.test.ts \
  src/features/leave/security.test.ts
npm test
```

Expected: migration/security tests pass and the full suite has no failures.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/202607160001_leave_management.sql \
  src/features/leave/migration.test.ts src/features/leave/security.test.ts
git commit -m "feat: add leave data model and security foundation"
```

## Task 3: Effective-dated leave-type policy workflows

**Files:**
- Modify: `supabase/migrations/202607160001_leave_management.sql`
- Create: `src/features/leave/policy/actions.test.ts`
- Create: `src/features/leave/policy/queries.test.ts`
- Create: `src/features/leave/policy/queries.ts`
- Create: `src/features/leave/auth.ts`

**Interfaces:**
- Consumes: Task 2 leave policy tables and `public.write_employee_audit`.
- Produces: `resolve_leave_type_version(leave_type_id, date)`, `create_leave_type(...)`, `create_leave_type_version(...)`, `archive_leave_type(...)`, `getLeaveTypes()`, `getLeaveType(id)`, `getActiveLeaveTypeOptions(date)`, and `requireLeaveAdmin()`.

- [ ] **Step 1: Write policy workflow tests**

Create `src/features/leave/policy/actions.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL("../../../../supabase/migrations/202607160001_leave_management.sql", import.meta.url),
  "utf8",
);

test("policy migration exposes exactly the approved public policy workflows", () => {
  for (const name of [
    "create_leave_type",
    "create_leave_type_version",
    "archive_leave_type",
    "resolve_leave_type_version",
  ]) assert.match(sql, new RegExp(`create or replace function public\\.${name}`, "i"));
});

test("leave codes normalize to uppercase hyphenated values", () => {
  assert.match(sql, /create or replace function public\.normalize_leave_code/i);
  assert.match(sql, /regexp_replace\(upper/i);
  assert.match(sql, /'\[\^A-Z0-9\]\+'/i);
});

test("versions resolve by newest effective date and remain immutable", () => {
  const resolver = sql.match(
    /create or replace function public\.resolve_leave_type_version[\s\S]*?\$\$;/i,
  )?.[0] ?? "";
  assert.match(resolver, /effective_from <= p_effective_date/i);
  assert.match(resolver, /order by version\.effective_from desc, version\.revision_number desc/i);
  assert.match(sql, /prevent_leave_type_version_mutation/i);
});

test("paid and balance-exempt invariants are enforced in the protected writer", () => {
  const writer = sql.match(
    /create or replace function public\.create_leave_type_version[\s\S]*?\$\$;/i,
  )?.[0] ?? "";
  assert.match(writer, /p_is_paid and not p_is_balance_tracked/i);
  assert.match(writer, /not p_is_balance_tracked[\s\S]+p_default_annual_units <> 0/i);
  assert.match(writer, /LEAVE_POLICY_INVALID/i);
});

test("current or backdated replacement requires a private reason", () => {
  const writer = sql.match(
    /create or replace function public\.create_leave_type_version[\s\S]*?\$\$;/i,
  )?.[0] ?? "";
  assert.match(writer, /p_effective_from <= public\.company_attendance_date\(now\(\)\)/i);
  assert.match(writer, /LEAVE_CHANGE_REASON_REQUIRED/i);
  assert.doesNotMatch(writer, /'change_reason',\s*v_reason/i);
});

test("archiving appends an inactive version instead of mutating stable identity", () => {
  const archive = sql.match(
    /create or replace function public\.archive_leave_type[\s\S]*?\$\$;/i,
  )?.[0] ?? "";
  assert.match(archive, /public\.create_leave_type_version/i);
  assert.match(archive, /false,/i);
  assert.doesNotMatch(archive, /delete from public\.leave_types/i);
});

test("policy functions use fixed search paths and explicit HR checks", () => {
  for (const name of ["create_leave_type", "create_leave_type_version", "archive_leave_type"]) {
    const body = sql.match(new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\$\\$;`, "i"))?.[0] ?? "";
    assert.match(body, /security definer/i);
    assert.match(body, /set search_path = pg_catalog, public/i);
    assert.match(body, /public\.is_hr_admin\(\)/i);
  }
});
```

Create `src/features/leave/policy/queries.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./queries.ts", import.meta.url), "utf8");

test("policy queries remain server-only and use explicit relationships", () => {
  assert.match(source, /import "server-only"/);
  assert.match(source, /leave_type_versions/);
  assert.match(source, /leave_type_id/);
  assert.doesNotMatch(source, /select\("\*"\)/);
});

test("active options exclude inactive resolved versions", () => {
  assert.match(source, /getActiveLeaveTypeOptions/);
  assert.match(source, /is_active/);
  assert.match(source, /effective_from/);
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/leave/policy/actions.test.ts \
  src/features/leave/policy/queries.test.ts
```

Expected: failure because protected policy functions and query modules are missing.

- [ ] **Step 3: Add policy normalization and resolution helpers before public writers**

Insert in the migration before public policy writers:

```sql
create or replace function public.normalize_leave_code(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select trim(both '-' from regexp_replace(upper(btrim(coalesce(p_value, ''))), '[^A-Z0-9]+', '-', 'g'));
$$;

create or replace function public.normalize_leave_private_text(
  p_value text,
  p_required boolean default false
)
returns text
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  v_value text := nullif(btrim(coalesce(p_value, '')), '');
begin
  if p_required and v_value is null then
    raise exception using errcode = 'P0001', message = 'LEAVE_PRIVATE_TEXT_REQUIRED';
  end if;
  if v_value is not null and char_length(v_value) > 1000 then
    raise exception using errcode = 'P0001', message = 'LEAVE_PRIVATE_TEXT_TOO_LONG';
  end if;
  return v_value;
end;
$$;

create or replace function public.resolve_leave_type_version(
  p_leave_type_id uuid,
  p_effective_date date
)
returns table (
  leave_type_version_id uuid,
  leave_type_id uuid,
  revision_number integer,
  effective_from date,
  name text,
  description text,
  is_active boolean,
  is_paid boolean,
  is_balance_tracked boolean,
  default_annual_units numeric,
  carryover_enabled boolean,
  carryover_cap_units numeric,
  employee_note_required boolean,
  document_required boolean,
  document_required_min_units numeric
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    version.id,
    version.leave_type_id,
    version.revision_number,
    version.effective_from,
    version.name,
    version.description,
    version.is_active,
    version.is_paid,
    version.is_balance_tracked,
    version.default_annual_units,
    version.carryover_enabled,
    version.carryover_cap_units,
    version.employee_note_required,
    version.document_required,
    version.document_required_min_units
  from public.leave_type_versions as version
  where version.leave_type_id = p_leave_type_id
    and version.effective_from <= p_effective_date
  order by version.effective_from desc, version.revision_number desc
  limit 1;
$$;

revoke all on function public.normalize_leave_code(text) from public, anon, authenticated;
revoke all on function public.normalize_leave_private_text(text, boolean) from public, anon, authenticated;
revoke all on function public.resolve_leave_type_version(uuid, date) from public, anon;
grant execute on function public.resolve_leave_type_version(uuid, date) to authenticated;
```

- [ ] **Step 4: Add the initial leave-type writer**

Append:

```sql
create or replace function public.create_leave_type(
  p_code text,
  p_effective_from date,
  p_name text,
  p_description text,
  p_is_active boolean,
  p_is_paid boolean,
  p_is_balance_tracked boolean,
  p_default_annual_units numeric,
  p_carryover_enabled boolean,
  p_carryover_cap_units numeric,
  p_employee_note_required boolean,
  p_document_required boolean,
  p_document_required_min_units numeric
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_code text := public.normalize_leave_code(p_code);
  v_leave_type_id uuid;
  v_version_id uuid;
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  if char_length(v_code) < 2 or char_length(v_code) > 50 then
    raise exception using errcode = 'P0001', message = 'LEAVE_POLICY_INVALID';
  end if;

  insert into public.leave_types (code, created_by)
  values (v_code, v_actor)
  returning id into v_leave_type_id;

  v_version_id := public.create_leave_type_version(
    v_leave_type_id,
    p_effective_from,
    p_name,
    p_description,
    p_is_active,
    p_is_paid,
    p_is_balance_tracked,
    p_default_annual_units,
    p_carryover_enabled,
    p_carryover_cap_units,
    p_employee_note_required,
    p_document_required,
    p_document_required_min_units,
    null
  );

  perform public.write_leave_audit(
    null,
    'leave_type.created',
    'leave_type',
    v_leave_type_id,
    jsonb_build_object(
      'leave_type_id', v_leave_type_id,
      'leave_type_version_id', v_version_id,
      'code', v_code
    )
  );
  return v_leave_type_id;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'LEAVE_CODE_EXISTS';
end;
$$;
```

Because PostgreSQL resolves functions at execution time, place `create_leave_type_version` before `create_leave_type` in the final migration ordering even though this plan presents the initial creator first conceptually.

- [ ] **Step 5: Add the immutable version writer**

Insert before `create_leave_type`:

```sql
create or replace function public.create_leave_type_version(
  p_leave_type_id uuid,
  p_effective_from date,
  p_name text,
  p_description text,
  p_is_active boolean,
  p_is_paid boolean,
  p_is_balance_tracked boolean,
  p_default_annual_units numeric,
  p_carryover_enabled boolean,
  p_carryover_cap_units numeric,
  p_employee_note_required boolean,
  p_document_required boolean,
  p_document_required_min_units numeric,
  p_change_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_reason text := public.normalize_leave_private_text(p_change_reason, false);
  v_revision_number integer;
  v_version_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  if p_leave_type_id is null or p_effective_from is null or char_length(v_name) not between 1 and 100 then
    raise exception using errcode = 'P0001', message = 'LEAVE_POLICY_INVALID';
  end if;
  if p_is_paid and not p_is_balance_tracked then
    raise exception using errcode = 'P0001', message = 'LEAVE_POLICY_INVALID';
  end if;
  if p_default_annual_units is null
     or p_default_annual_units < 0
     or p_default_annual_units * 2 <> trunc(p_default_annual_units * 2) then
    raise exception using errcode = 'P0001', message = 'LEAVE_POLICY_INVALID';
  end if;
  if not p_is_balance_tracked and (
    p_default_annual_units <> 0
    or p_carryover_enabled
    or p_carryover_cap_units is not null
  ) then
    raise exception using errcode = 'P0001', message = 'LEAVE_POLICY_INVALID';
  end if;
  if not p_carryover_enabled and p_carryover_cap_units is not null then
    raise exception using errcode = 'P0001', message = 'LEAVE_POLICY_INVALID';
  end if;
  if p_carryover_cap_units is not null and (
    p_carryover_cap_units <= 0
    or p_carryover_cap_units * 2 <> trunc(p_carryover_cap_units * 2)
  ) then
    raise exception using errcode = 'P0001', message = 'LEAVE_POLICY_INVALID';
  end if;
  if not p_document_required and p_document_required_min_units is not null then
    raise exception using errcode = 'P0001', message = 'LEAVE_POLICY_INVALID';
  end if;
  if p_document_required_min_units is not null and (
    p_document_required_min_units <= 0
    or p_document_required_min_units * 2 <> trunc(p_document_required_min_units * 2)
  ) then
    raise exception using errcode = 'P0001', message = 'LEAVE_POLICY_INVALID';
  end if;
  if p_effective_from <= public.company_attendance_date(now()) and v_reason is null
     and exists (select 1 from public.leave_type_versions where leave_type_id = p_leave_type_id) then
    raise exception using errcode = 'P0001', message = 'LEAVE_CHANGE_REASON_REQUIRED';
  end if;

  perform 1 from public.leave_types where id = p_leave_type_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'LEAVE_POLICY_NOT_FOUND';
  end if;

  select coalesce(max(revision_number), 0) + 1
    into v_revision_number
  from public.leave_type_versions
  where leave_type_id = p_leave_type_id;

  insert into public.leave_type_versions (
    leave_type_id, revision_number, effective_from, name, description,
    is_active, is_paid, is_balance_tracked, default_annual_units,
    carryover_enabled, carryover_cap_units, employee_note_required,
    document_required, document_required_min_units, created_by, change_reason
  ) values (
    p_leave_type_id, v_revision_number, p_effective_from, v_name,
    nullif(btrim(coalesce(p_description, '')), ''), p_is_active, p_is_paid,
    p_is_balance_tracked, p_default_annual_units, p_carryover_enabled,
    p_carryover_cap_units, p_employee_note_required, p_document_required,
    p_document_required_min_units, v_actor, v_reason
  ) returning id into v_version_id;

  perform public.write_leave_audit(
    null,
    'leave_type.version_created',
    'leave_type',
    p_leave_type_id,
    jsonb_build_object(
      'leave_type_id', p_leave_type_id,
      'leave_type_version_id', v_version_id,
      'revision_number', v_revision_number,
      'effective_from', p_effective_from,
      'is_active', p_is_active,
      'is_paid', p_is_paid,
      'is_balance_tracked', p_is_balance_tracked
    )
  );
  return v_version_id;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'LEAVE_POLICY_EFFECTIVE_DATE_EXISTS';
end;
$$;
```

- [ ] **Step 6: Add archive workflow and grants**

Append:

```sql
create or replace function public.archive_leave_type(
  p_leave_type_id uuid,
  p_effective_from date,
  p_change_reason text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_current record;
  v_version_id uuid;
begin
  if auth.uid() is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  select * into v_current
  from public.resolve_leave_type_version(p_leave_type_id, p_effective_from);
  if v_current.leave_type_version_id is null then
    raise exception using errcode = 'P0001', message = 'LEAVE_POLICY_NOT_FOUND';
  end if;
  v_version_id := public.create_leave_type_version(
    p_leave_type_id,
    p_effective_from,
    v_current.name,
    v_current.description,
    false,
    v_current.is_paid,
    v_current.is_balance_tracked,
    v_current.default_annual_units,
    v_current.carryover_enabled,
    v_current.carryover_cap_units,
    v_current.employee_note_required,
    v_current.document_required,
    v_current.document_required_min_units,
    public.normalize_leave_private_text(p_change_reason, true)
  );
  perform public.write_leave_audit(
    null,
    'leave_type.archived',
    'leave_type',
    p_leave_type_id,
    jsonb_build_object('leave_type_id', p_leave_type_id, 'leave_type_version_id', v_version_id)
  );
  return v_version_id;
end;
$$;

revoke all on function public.create_leave_type(
  text,date,text,text,boolean,boolean,boolean,numeric,boolean,numeric,boolean,boolean,numeric
) from public, anon;
revoke all on function public.create_leave_type_version(
  uuid,date,text,text,boolean,boolean,boolean,numeric,boolean,numeric,boolean,boolean,numeric,text
) from public, anon;
revoke all on function public.archive_leave_type(uuid,date,text) from public, anon;
grant execute on function public.create_leave_type(
  text,date,text,text,boolean,boolean,boolean,numeric,boolean,numeric,boolean,boolean,numeric
) to authenticated;
grant execute on function public.create_leave_type_version(
  uuid,date,text,text,boolean,boolean,boolean,numeric,boolean,numeric,boolean,boolean,numeric,text
) to authenticated;
grant execute on function public.archive_leave_type(uuid,date,text) to authenticated;
```

- [ ] **Step 7: Add server authorization and policy queries**

Create `src/features/leave/auth.ts`:

```ts
import { requireAttendanceEmployee } from "@/features/attendance/auth";
import { requireOrganizationAdmin } from "@/features/organization/auth";

export async function requireLeaveEmployee() {
  return requireAttendanceEmployee();
}
export async function requireLeaveAdmin() {
  return requireOrganizationAdmin();
}
```

Create `src/features/leave/policy/queries.ts`:

```ts
import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { LeaveTypeSummary, LeaveTypeVersion } from "../types";

const versionSelect = `
  id,leave_type_id,revision_number,effective_from,name,description,is_active,
  is_paid,is_balance_tracked,default_annual_units,carryover_enabled,
  carryover_cap_units,employee_note_required,document_required,
  document_required_min_units,created_by,created_at,change_reason
`;

export async function getLeaveTypes(companyDate: string): Promise<LeaveTypeSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leave_types")
    .select(`id,code,versions:leave_type_versions(${versionSelect})`)
    .order("code");
  if (error) throw new Error("Unable to load leave types.");
  return (data ?? []).map((row) => {
    const versions = [...((row.versions ?? []) as LeaveTypeVersion[])].sort(
      (a, b) => b.effective_from.localeCompare(a.effective_from) || b.revision_number - a.revision_number,
    );
    return {
      id: row.id,
      code: row.code,
      current: versions.find((version) => version.effective_from <= companyDate) ?? null,
      upcoming: versions.filter((version) => version.effective_from > companyDate),
      history: versions.filter((version) => version.effective_from <= companyDate),
    };
  });
}

export async function getLeaveType(leaveTypeId: string, companyDate: string) {
  const rows = await getLeaveTypes(companyDate);
  return rows.find((row) => row.id === leaveTypeId) ?? null;
}

export async function getActiveLeaveTypeOptions(effectiveDate: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_active_leave_type_options", {
    p_effective_date: effectiveDate,
  });
  if (error) throw new Error("Unable to load available leave types.");
  return (data ?? []) as Array<{
    leave_type_id: string;
    code: string;
    leave_type_version_id: string;
    name: string;
    is_paid: boolean;
    is_balance_tracked: boolean;
  }>;
}
```

Add this safe public selector to the migration:

```sql
create or replace function public.get_active_leave_type_options(p_effective_date date)
returns table (
  leave_type_id uuid,
  code text,
  leave_type_version_id uuid,
  name text,
  is_paid boolean,
  is_balance_tracked boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select stable.id, stable.code, resolved.leave_type_version_id, resolved.name,
         resolved.is_paid, resolved.is_balance_tracked
  from public.leave_types as stable
  cross join lateral public.resolve_leave_type_version(stable.id, p_effective_date) as resolved
  where resolved.is_active
  order by resolved.name, stable.code;
$$;
revoke all on function public.get_active_leave_type_options(date) from public, anon;
grant execute on function public.get_active_leave_type_options(date) to authenticated;
```

- [ ] **Step 8: Run focused and full tests**

Run:

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/leave/policy/actions.test.ts \
  src/features/leave/policy/queries.test.ts
npm test
npx tsc --noEmit
```

Expected: focused tests pass; full tests and TypeScript complete without failures.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/202607160001_leave_management.sql \
  src/features/leave/auth.ts src/features/leave/policy/queries.ts \
  src/features/leave/policy/actions.test.ts src/features/leave/policy/queries.test.ts
git commit -m "feat: add immutable leave type policies"
```

## Task 4: Balance accounts, append-only ledger helpers, employee settings, year opening, carryover, and adjustments

**Files:**
- Modify: `supabase/migrations/202607160001_leave_management.sql`
- Create: `src/features/leave/balances/queries.ts`
- Create: `src/features/leave/balances/queries.test.ts`
- Create: `src/features/leave/balances/actions.test.ts`

**Interfaces:**
- Consumes: policy resolution from Task 3 and balance tables from Task 2.
- Produces: `get_or_create_leave_balance_account`, `get_leave_balance`, `consume_leave_balance`, `restore_leave_charge`, `upsert_employee_leave_year_setting`, `preview_leave_year_opening`, `generate_leave_year_opening`, `generate_individual_leave_allocation`, `create_leave_balance_adjustment`, employee-safe balance projection RPCs, and TypeScript balance queries.

- [ ] **Step 1: Write failing balance and generation tests**

Create `src/features/leave/balances/actions.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL("../../../../supabase/migrations/202607160001_leave_management.sql", import.meta.url),
  "utf8",
);

function body(name: string) {
  return sql.match(new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\$\\$;`, "i"))?.[0] ?? "";
}

test("balance accounts are lock rows and totals derive from ledger", () => {
  assert.match(body("get_or_create_leave_balance_account"), /on conflict \(employee_id, leave_type_id, leave_year\)/i);
  assert.match(body("get_leave_balance"), /sum\(ledger\.units\)/i);
  assert.match(body("get_leave_balance"), /expires_on is null or expires_on >= p_as_of_date/i);
});

test("consumption orders expiring sources first then older sources", () => {
  const consume = body("consume_leave_balance");
  assert.match(consume, /order by source\.expires_on asc nulls last, source\.created_at asc, source\.id asc/i);
  assert.match(consume, /for update/i);
  assert.match(consume, /LEAVE_INSUFFICIENT_BALANCE/i);
  assert.match(consume, /source_entry_id/i);
});

test("restoration points back to original negative entries", () => {
  const restore = body("restore_leave_charge");
  assert.match(restore, /reversal_of_entry_id/i);
  assert.match(restore, /source_entry_id/i);
  assert.match(restore, /cancellation_restoration|attendance_conflict_release|recalculation_release/i);
});

test("year opening is previewable, deterministic, and idempotent", () => {
  assert.match(sql, /create or replace function public\.preview_leave_year_opening/i);
  const generate = body("generate_leave_year_opening");
  assert.match(generate, /generation_key/i);
  assert.match(generate, /annual:/i);
  assert.match(generate, /carryover:/i);
  assert.match(generate, /on conflict \(generation_key\) do nothing/i);
  assert.match(generate, /pg_advisory_xact_lock/i);
});

test("bulk generation excludes mid-year hires and inactive records", () => {
  const preview = body("preview_leave_year_opening");
  assert.match(preview, /employee\.hire_date <= make_date\(p_leave_year, 1, 1\)/i);
  assert.match(preview, /employee\.archived_at is null/i);
  assert.match(preview, /employment_status in \('active','probation','on_leave'\)/i);
});

test("carryover is one year only, capped, and expires at target year end", () => {
  const generate = body("generate_leave_year_opening");
  assert.match(generate, /least\(/i);
  assert.match(generate, /make_date\(p_leave_year, 12, 31\)/i);
  assert.match(generate, /entry_type <> 'carryover'/i);
});

test("negative adjustments consume sources and cannot create a negative balance", () => {
  const adjustment = body("create_leave_balance_adjustment");
  assert.match(adjustment, /LEAVE_ADJUSTMENT_REASON_REQUIRED/i);
  assert.match(adjustment, /public\.consume_leave_balance/i);
  assert.match(adjustment, /hr_adjustment_credit/i);
  assert.match(adjustment, /hr_adjustment_debit/i);
  assert.doesNotMatch(adjustment, /update public\.leave_balance_ledger/i);
});
```

Create `src/features/leave/balances/queries.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./queries.ts", import.meta.url), "utf8");

test("balance queries use safe RPC projections", () => {
  assert.match(source, /import "server-only"/);
  assert.match(source, /get_my_leave_balances/);
  assert.match(source, /get_admin_leave_balances/);
  assert.doesNotMatch(source, /from\("leave_balance_ledger"\)/);
});

test("year-opening preview remains separate from generation", () => {
  assert.match(source, /previewLeaveYearOpening/);
  assert.match(source, /preview_leave_year_opening/);
  assert.doesNotMatch(source, /generate_leave_year_opening/);
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/leave/balances/actions.test.ts \
  src/features/leave/balances/queries.test.ts
```

Expected: failure because balance helpers and query modules are missing.

- [ ] **Step 3: Add account, balance, source-availability, consumption, and restoration helpers**

**Accounting correction:** available balance must be derived from the remaining amount of each unexpired positive source, not by summing all positive and negative ledger entries. A restoration is linked to both its original negative entry and original positive source, adds back to that source's remaining units, and preserves the source expiration date. This prevents expired carryover consumption from producing a negative balance and prevents cancellation from converting expiring carryover into permanent balance.

Insert private helpers in the migration before public allocation workflows:

```sql
create or replace function public.get_or_create_leave_balance_account(
  p_employee_id uuid,
  p_leave_type_id uuid,
  p_leave_year integer
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_account_id uuid;
begin
  insert into public.leave_balance_accounts (employee_id, leave_type_id, leave_year)
  values (p_employee_id, p_leave_type_id, p_leave_year)
  on conflict (employee_id, leave_type_id, leave_year)
  do update set employee_id = excluded.employee_id
  returning id into v_account_id;
  perform 1 from public.leave_balance_accounts where id = v_account_id for update;
  return v_account_id;
end;
$$;

create or replace function public.get_leave_balance(
  p_balance_account_id uuid,
  p_as_of_date date
)
returns numeric
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(sum(ledger.units), 0)::numeric(10,1)
  from public.leave_balance_ledger as ledger
  where ledger.balance_account_id = p_balance_account_id
    and (ledger.units < 0 or ledger.expires_on is null or ledger.expires_on >= p_as_of_date);
$$;

create or replace function public.get_leave_source_remaining(
  p_source_entry_id uuid,
  p_as_of_date date
)
returns numeric
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select greatest(
    0,
    source.units
      + coalesce((
          select sum(consumer.units)
          from public.leave_balance_ledger as consumer
          where consumer.source_entry_id = source.id
        ), 0)
      - coalesce((
          select sum(restoration.units)
          from public.leave_balance_ledger as restoration
          where restoration.reversal_of_entry_id in (
            select consumer.id
            from public.leave_balance_ledger as consumer
            where consumer.source_entry_id = source.id
          )
        ), 0)
  )::numeric(10,1)
  from public.leave_balance_ledger as source
  where source.id = p_source_entry_id
    and source.units > 0
    and (source.expires_on is null or source.expires_on >= p_as_of_date);
$$;

create or replace function public.consume_leave_balance(
  p_balance_account_id uuid,
  p_units numeric,
  p_entry_type text,
  p_effective_date date,
  p_request_group_id uuid,
  p_request_day_revision_id uuid,
  p_created_by uuid,
  p_private_reason text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid[]
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_remaining numeric := p_units;
  v_available numeric;
  v_take numeric;
  v_source record;
  v_created uuid[] := '{}'::uuid[];
  v_entry_id uuid;
begin
  if p_units <= 0 or p_units * 2 <> trunc(p_units * 2) then
    raise exception using errcode = 'P0001', message = 'LEAVE_UNITS_INVALID';
  end if;
  if p_entry_type not in ('approved_leave_charge','hr_adjustment_debit','recalculation_charge') then
    raise exception using errcode = 'P0001', message = 'LEAVE_LEDGER_ENTRY_INVALID';
  end if;

  perform 1 from public.leave_balance_accounts where id = p_balance_account_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'LEAVE_BALANCE_ACCOUNT_NOT_FOUND';
  end if;

  for v_source in
    select source.*
    from public.leave_balance_ledger as source
    where source.balance_account_id = p_balance_account_id
      and source.units > 0
      and source.entry_type in ('annual_allocation','carryover','hr_adjustment_credit')
      and (source.expires_on is null or source.expires_on >= p_effective_date)
      and public.get_leave_source_remaining(source.id, p_effective_date) > 0
    order by source.expires_on asc nulls last, source.created_at asc, source.id asc
    for update
  loop
    exit when v_remaining = 0;
    v_available := public.get_leave_source_remaining(v_source.id, p_effective_date);
    v_take := least(v_remaining, v_available);
    insert into public.leave_balance_ledger (
      balance_account_id, entry_type, units, effective_date, source_entry_id,
      request_group_id, request_day_revision_id, created_by, private_reason, metadata
    ) values (
      p_balance_account_id, p_entry_type, -v_take, p_effective_date, v_source.id,
      p_request_group_id, p_request_day_revision_id, p_created_by,
      public.normalize_leave_private_text(p_private_reason, false), coalesce(p_metadata, '{}'::jsonb)
    ) returning id into v_entry_id;
    v_created := array_append(v_created, v_entry_id);
    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    raise exception using errcode = 'P0001', message = 'LEAVE_INSUFFICIENT_BALANCE';
  end if;
  return v_created;
end;
$$;

create or replace function public.restore_leave_charge(
  p_negative_entry_id uuid,
  p_entry_type text,
  p_created_by uuid,
  p_private_reason text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_charge public.leave_balance_ledger%rowtype;
  v_restoration_id uuid;
  v_already_restored numeric;
  v_units numeric;
begin
  if p_entry_type not in ('cancellation_restoration','attendance_conflict_release','recalculation_release') then
    raise exception using errcode = 'P0001', message = 'LEAVE_LEDGER_ENTRY_INVALID';
  end if;
  select * into v_charge
  from public.leave_balance_ledger
  where id = p_negative_entry_id and units < 0
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'LEAVE_LEDGER_ENTRY_NOT_FOUND';
  end if;
  select coalesce(sum(units), 0) into v_already_restored
  from public.leave_balance_ledger
  where reversal_of_entry_id = v_charge.id;
  v_units := least(abs(v_charge.units), greatest(0, abs(v_charge.units) - v_already_restored));
  if v_units = 0 then return null; end if;
  insert into public.leave_balance_ledger (
    balance_account_id, entry_type, units, effective_date, expires_on,
    source_entry_id, reversal_of_entry_id, request_group_id,
    request_day_revision_id, created_by, private_reason, metadata
  ) values (
    v_charge.balance_account_id, p_entry_type, v_units,
    public.company_attendance_date(now()), null, v_charge.source_entry_id,
    v_charge.id, v_charge.request_group_id, v_charge.request_day_revision_id,
    p_created_by, public.normalize_leave_private_text(p_private_reason, false),
    coalesce(p_metadata, '{}'::jsonb)
  ) returning id into v_restoration_id;
  return v_restoration_id;
end;
$$;

revoke all on function public.get_or_create_leave_balance_account(uuid,uuid,integer) from public, anon, authenticated;
revoke all on function public.get_leave_balance(uuid,date) from public, anon, authenticated;
revoke all on function public.get_leave_source_remaining(uuid,date) from public, anon, authenticated;
revoke all on function public.consume_leave_balance(uuid,numeric,text,date,uuid,uuid,uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.restore_leave_charge(uuid,text,uuid,text,jsonb) from public, anon, authenticated;
```

- [ ] **Step 4: Add audited employee-year setting workflow**

Append:

```sql
create or replace function public.upsert_employee_leave_year_setting(
  p_employee_id uuid,
  p_leave_type_id uuid,
  p_leave_year integer,
  p_is_excluded boolean,
  p_annual_allocation_override_units numeric,
  p_private_reason text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_reason text := public.normalize_leave_private_text(p_private_reason, true);
  v_id uuid;
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  if p_leave_year not between 2000 and 2200
     or (p_annual_allocation_override_units is not null and (
       p_annual_allocation_override_units < 0
       or p_annual_allocation_override_units * 2 <> trunc(p_annual_allocation_override_units * 2)
     )) then
    raise exception using errcode = 'P0001', message = 'LEAVE_SETTING_INVALID';
  end if;
  if exists (
    select 1
    from public.leave_balance_accounts as account
    join public.leave_balance_ledger as ledger on ledger.balance_account_id = account.id
    where account.employee_id = p_employee_id
      and account.leave_type_id = p_leave_type_id
      and account.leave_year = p_leave_year
      and ledger.entry_type = 'annual_allocation'
  ) then
    raise exception using errcode = 'P0001', message = 'LEAVE_ALLOCATION_ALREADY_GENERATED';
  end if;
  insert into public.employee_leave_year_settings (
    employee_id, leave_type_id, leave_year, is_excluded,
    annual_allocation_override_units, created_by, private_reason
  ) values (
    p_employee_id, p_leave_type_id, p_leave_year, p_is_excluded,
    p_annual_allocation_override_units, v_actor, v_reason
  )
  on conflict (employee_id, leave_type_id, leave_year) do update
  set is_excluded = excluded.is_excluded,
      annual_allocation_override_units = excluded.annual_allocation_override_units,
      updated_by = v_actor,
      updated_at = now(),
      private_reason = v_reason
  returning id into v_id;
  perform public.write_leave_audit(
    p_employee_id,
    'leave_balance.setting_changed',
    'leave_allocation',
    v_id,
    jsonb_build_object(
      'employee_id', p_employee_id,
      'leave_type_id', p_leave_type_id,
      'leave_year', p_leave_year,
      'is_excluded', p_is_excluded,
      'has_override', p_annual_allocation_override_units is not null
    )
  );
  return v_id;
end;
$$;
revoke all on function public.upsert_employee_leave_year_setting(uuid,uuid,integer,boolean,numeric,text) from public, anon;
grant execute on function public.upsert_employee_leave_year_setting(uuid,uuid,integer,boolean,numeric,text) to authenticated;
```

- [ ] **Step 5: Add year-opening preview**

Append a stable preview RPC that does not write:

```sql
create or replace function public.preview_leave_year_opening(p_leave_year integer)
returns table (
  employee_id uuid,
  employee_number text,
  employee_name text,
  leave_type_id uuid,
  leave_type_code text,
  leave_type_version_id uuid,
  leave_type_name text,
  result_type text,
  allocation_units numeric,
  carryover_units numeric,
  carryover_cap_applied boolean,
  exception_code text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with eligible as (
    select
      employee.id as employee_id,
      employee.employee_number,
      concat_ws(' ', employee.first_name, employee.last_name) as employee_name,
      stable.id as leave_type_id,
      stable.code as leave_type_code,
      policy.leave_type_version_id,
      policy.name as leave_type_name,
      setting.is_excluded,
      setting.annual_allocation_override_units,
      policy.default_annual_units,
      policy.carryover_enabled,
      policy.carryover_cap_units
    from public.employees as employee
    cross join public.leave_types as stable
    cross join lateral public.resolve_leave_type_version(stable.id, make_date(p_leave_year, 1, 1)) as policy
    left join public.employee_leave_year_settings as setting
      on setting.employee_id = employee.id
     and setting.leave_type_id = stable.id
     and setting.leave_year = p_leave_year
    where employee.hire_date <= make_date(p_leave_year, 1, 1)
      and employee.archived_at is null
      and employee.employment_status in ('active','probation','on_leave')
      and policy.is_active
      and policy.is_balance_tracked
  ), carry as (
    select
      eligible.employee_id,
      eligible.leave_type_id,
      greatest(0, coalesce(sum(ledger.units), 0))::numeric(10,1) as origin_remaining
    from eligible
    left join public.leave_balance_accounts as account
      on account.employee_id = eligible.employee_id
     and account.leave_type_id = eligible.leave_type_id
     and account.leave_year = p_leave_year - 1
    left join public.leave_balance_ledger as ledger
      on ledger.balance_account_id = account.id
     and ledger.entry_type <> 'carryover'
    group by eligible.employee_id, eligible.leave_type_id
  )
  select
    eligible.employee_id,
    eligible.employee_number,
    eligible.employee_name,
    eligible.leave_type_id,
    eligible.leave_type_code,
    eligible.leave_type_version_id,
    eligible.leave_type_name,
    case when coalesce(eligible.is_excluded, false) then 'excluded'
         when eligible.annual_allocation_override_units is not null then 'override'
         else 'default' end,
    case when coalesce(eligible.is_excluded, false) then 0
         else coalesce(eligible.annual_allocation_override_units, eligible.default_annual_units) end,
    case when coalesce(eligible.is_excluded, false) or not eligible.carryover_enabled then 0
         when eligible.carryover_cap_units is null then carry.origin_remaining
         else least(carry.origin_remaining, eligible.carryover_cap_units) end,
    eligible.carryover_cap_units is not null
      and carry.origin_remaining > eligible.carryover_cap_units,
    null::text
  from eligible
  join carry using (employee_id, leave_type_id)
  order by eligible.employee_name, eligible.leave_type_name;
$$;
```

The public function must begin with a role gate. Because SQL-language functions cannot branch before the query, add `public.require_leave_admin()` as a private stable helper and include `cross join lateral (select public.require_leave_admin()) gate` in the CTE, or convert this exact query to PL/pgSQL and `return query` after checking `public.is_hr_admin()`. Use the PL/pgSQL form in the migration so unauthorized calls return `LEAVE_PERMISSION_DENIED`.

- [ ] **Step 6: Add idempotent year-opening generation and individual allocation**

Append `generate_leave_year_opening` with this exact control flow and keys:

```sql
create or replace function public.generate_leave_year_opening(p_leave_year integer)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_row record;
  v_account_id uuid;
  v_created_allocations integer := 0;
  v_created_carryovers integer := 0;
  v_existing integer := 0;
  v_key text;
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  if p_leave_year not between 2000 and 2200 then
    raise exception using errcode = 'P0001', message = 'LEAVE_GENERATION_CONFLICT';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('leave-year:' || p_leave_year::text, 0));

  for v_row in select * from public.preview_leave_year_opening(p_leave_year)
  loop
    if v_row.result_type = 'excluded' then continue; end if;
    v_account_id := public.get_or_create_leave_balance_account(
      v_row.employee_id, v_row.leave_type_id, p_leave_year
    );
    if v_row.allocation_units > 0 then
      v_key := format('annual:%s:%s:%s', p_leave_year, v_row.employee_id, v_row.leave_type_id);
      insert into public.leave_balance_ledger (
        balance_account_id, entry_type, units, effective_date,
        generation_key, created_by, metadata
      ) values (
        v_account_id, 'annual_allocation', v_row.allocation_units,
        make_date(p_leave_year, 1, 1), v_key, v_actor,
        jsonb_build_object(
          'leave_type_version_id', v_row.leave_type_version_id,
          'allocation_source', v_row.result_type
        )
      ) on conflict (generation_key) do nothing;
      if found then v_created_allocations := v_created_allocations + 1;
      else v_existing := v_existing + 1; end if;
    end if;
    if v_row.carryover_units > 0 then
      v_key := format('carryover:%s:%s:%s', p_leave_year, v_row.employee_id, v_row.leave_type_id);
      insert into public.leave_balance_ledger (
        balance_account_id, entry_type, units, effective_date, expires_on,
        generation_key, created_by, metadata
      ) values (
        v_account_id, 'carryover', v_row.carryover_units,
        make_date(p_leave_year, 1, 1), make_date(p_leave_year, 12, 31),
        v_key, v_actor,
        jsonb_build_object(
          'leave_type_version_id', v_row.leave_type_version_id,
          'origin_year', p_leave_year - 1,
          'cap_applied', v_row.carryover_cap_applied
        )
      ) on conflict (generation_key) do nothing;
      if found then v_created_carryovers := v_created_carryovers + 1;
      else v_existing := v_existing + 1; end if;
    end if;
  end loop;

  perform public.write_leave_audit(
    null,
    'leave_balance.year_opening_generated',
    'leave_allocation',
    null,
    jsonb_build_object(
      'leave_year', p_leave_year,
      'created_allocations', v_created_allocations,
      'created_carryovers', v_created_carryovers,
      'already_generated', v_existing
    )
  );
  return jsonb_build_object(
    'created_allocations', v_created_allocations,
    'created_carryovers', v_created_carryovers,
    'already_generated', v_existing
  );
exception
  when serialization_failure or deadlock_detected then
    raise exception using errcode = 'P0001', message = 'LEAVE_GENERATION_CONFLICT';
end;
$$;
```

Add individual generation:

```sql
create or replace function public.generate_individual_leave_allocation(
  p_employee_id uuid,
  p_leave_type_id uuid,
  p_leave_year integer,
  p_effective_date date
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_setting public.employee_leave_year_settings%rowtype;
  v_policy record;
  v_account_id uuid;
  v_entry_id uuid;
  v_key text;
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  select * into v_setting
  from public.employee_leave_year_settings
  where employee_id = p_employee_id
    and leave_type_id = p_leave_type_id
    and leave_year = p_leave_year
  for update;
  if not found or v_setting.is_excluded or v_setting.annual_allocation_override_units is null then
    raise exception using errcode = 'P0001', message = 'LEAVE_OVERRIDE_REQUIRED';
  end if;
  select * into v_policy from public.resolve_leave_type_version(p_leave_type_id, p_effective_date);
  if v_policy.leave_type_version_id is null or not v_policy.is_active or not v_policy.is_balance_tracked then
    raise exception using errcode = 'P0001', message = 'LEAVE_POLICY_INACTIVE';
  end if;
  v_account_id := public.get_or_create_leave_balance_account(p_employee_id, p_leave_type_id, p_leave_year);
  v_key := format('individual:%s:%s:%s', p_leave_year, p_employee_id, p_leave_type_id);
  insert into public.leave_balance_ledger (
    balance_account_id, entry_type, units, effective_date,
    generation_key, created_by, metadata
  ) values (
    v_account_id, 'annual_allocation', v_setting.annual_allocation_override_units,
    p_effective_date, v_key, v_actor,
    jsonb_build_object(
      'leave_type_version_id', v_policy.leave_type_version_id,
      'allocation_source', 'manual_override'
    )
  ) on conflict (generation_key) do nothing
  returning id into v_entry_id;
  if v_entry_id is null then
    select id into v_entry_id from public.leave_balance_ledger where generation_key = v_key;
  end if;
  return v_entry_id;
end;
$$;
```

- [ ] **Step 7: Add positive and negative HR adjustments**

Append:

```sql
create or replace function public.create_leave_balance_adjustment(
  p_employee_id uuid,
  p_leave_type_id uuid,
  p_leave_year integer,
  p_units numeric,
  p_reason text
)
returns uuid[]
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_reason text := public.normalize_leave_private_text(p_reason, false);
  v_account_id uuid;
  v_entry_id uuid;
  v_entries uuid[];
  v_policy record;
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  if v_reason is null then
    raise exception using errcode = 'P0001', message = 'LEAVE_ADJUSTMENT_REASON_REQUIRED';
  end if;
  if p_units = 0 or p_units * 2 <> trunc(p_units * 2) then
    raise exception using errcode = 'P0001', message = 'LEAVE_UNITS_INVALID';
  end if;
  select * into v_policy
  from public.resolve_leave_type_version(p_leave_type_id, make_date(p_leave_year, 1, 1));
  if v_policy.leave_type_version_id is null or not v_policy.is_balance_tracked then
    raise exception using errcode = 'P0001', message = 'LEAVE_NOT_ELIGIBLE';
  end if;
  v_account_id := public.get_or_create_leave_balance_account(p_employee_id, p_leave_type_id, p_leave_year);
  if p_units > 0 then
    insert into public.leave_balance_ledger (
      balance_account_id, entry_type, units, effective_date,
      created_by, private_reason, metadata
    ) values (
      v_account_id, 'hr_adjustment_credit', p_units,
      public.company_attendance_date(now()), v_actor, v_reason,
      jsonb_build_object('leave_year', p_leave_year)
    ) returning id into v_entry_id;
    v_entries := array[v_entry_id];
  else
    v_entries := public.consume_leave_balance(
      v_account_id, abs(p_units), 'hr_adjustment_debit',
      public.company_attendance_date(now()), null, null, v_actor, v_reason,
      jsonb_build_object('leave_year', p_leave_year)
    );
  end if;
  perform public.write_leave_audit(
    p_employee_id,
    'leave_balance.adjusted',
    'leave_balance',
    v_account_id,
    jsonb_build_object(
      'employee_id', p_employee_id,
      'leave_type_id', p_leave_type_id,
      'leave_year', p_leave_year,
      'units', p_units
    )
  );
  return v_entries;
end;
$$;
```

- [ ] **Step 8: Add safe employee and HR balance projections**

Append:

```sql
create or replace function public.get_my_leave_balances(p_leave_year integer)
returns table (
  employee_id uuid,
  leave_type_id uuid,
  leave_type_code text,
  leave_type_name text,
  leave_year integer,
  is_paid boolean,
  is_balance_tracked boolean,
  allocated_units numeric,
  carryover_units numeric,
  adjustment_units numeric,
  approved_used_units numeric,
  pending_reserved_units numeric,
  available_units numeric,
  expiring_units numeric,
  expires_on date
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_employee_id uuid := public.current_employee_id();
begin
  if v_employee_id is null then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  return query
  select * from public.get_leave_balance_projection(v_employee_id, p_leave_year);
end;
$$;

create or replace function public.get_admin_leave_balances(
  p_leave_year integer,
  p_employee_id uuid default null,
  p_leave_type_id uuid default null
)
returns setof public.leave_balance_projection_row
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  return query
  select projection.*
  from public.get_leave_balance_projection(p_employee_id, p_leave_year) as projection
  where p_leave_type_id is null or projection.leave_type_id = p_leave_type_id;
end;
$$;
```

Implement `leave_balance_projection_row` as a composite type and `get_leave_balance_projection(p_employee_id uuid, p_leave_year integer)` as a revoked internal SQL helper. Its query must aggregate entry types separately, subtract other pending reservations, exclude expired positive sources from available units, and return `available_units = null` for balance-exempt leave. Do not return ledger `private_reason` or `metadata`.

Grant only the two safe public RPCs and the three public HR workflows; revoke every internal helper.

- [ ] **Step 9: Add TypeScript balance query adapters**

Create `src/features/leave/balances/queries.ts`:

```ts
import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { LeaveBalanceSummary } from "../types";

export interface LeaveBalanceProjectionRow {
  employee_id: string;
  leave_type_id: string;
  leave_type_code: string;
  leave_type_name: string;
  leave_year: number;
  is_paid: boolean;
  is_balance_tracked: boolean;
  allocated_units: string | number;
  carryover_units: string | number;
  adjustment_units: string | number;
  approved_used_units: string | number;
  pending_reserved_units: string | number;
  available_units: string | number | null;
  expiring_units: string | number;
  expires_on: string | null;
}

export function mapLeaveBalance(row: LeaveBalanceProjectionRow): LeaveBalanceSummary {
  return {
    employeeId: row.employee_id,
    leaveTypeId: row.leave_type_id,
    leaveTypeCode: row.leave_type_code,
    leaveTypeName: row.leave_type_name,
    leaveYear: Number(row.leave_year),
    isPaid: row.is_paid,
    isBalanceTracked: row.is_balance_tracked,
    allocatedUnits: Number(row.allocated_units),
    carryoverUnits: Number(row.carryover_units),
    adjustmentUnits: Number(row.adjustment_units),
    usedUnits: Number(row.approved_used_units),
    pendingUnits: Number(row.pending_reserved_units),
    availableUnits: row.available_units === null ? null : Number(row.available_units),
    expiringUnits: Number(row.expiring_units),
    expiresOn: row.expires_on,
  };
}

export async function getMyLeaveBalances(leaveYear: number): Promise<LeaveBalanceSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_leave_balances", { p_leave_year: leaveYear });
  if (error) throw new Error("Unable to load leave balances.");
  return ((data ?? []) as LeaveBalanceProjectionRow[]).map(mapLeaveBalance);
}

export async function getAdminLeaveBalances(input: {
  leaveYear: number;
  employeeId?: string | null;
  leaveTypeId?: string | null;
}): Promise<LeaveBalanceSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_admin_leave_balances", {
    p_leave_year: input.leaveYear,
    p_employee_id: input.employeeId ?? null,
    p_leave_type_id: input.leaveTypeId ?? null,
  });
  if (error) throw new Error("Unable to load employee leave balances.");
  return ((data ?? []) as LeaveBalanceProjectionRow[]).map(mapLeaveBalance);
}

export async function previewLeaveYearOpening(leaveYear: number) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("preview_leave_year_opening", { p_leave_year: leaveYear });
  if (error) throw new Error("Unable to preview leave-year generation.");
  return data ?? [];
}
```

- [ ] **Step 10: Run focused and full verification**

Run:

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/leave/balances/actions.test.ts \
  src/features/leave/balances/queries.test.ts
npm test
npx tsc --noEmit
```

Expected: all focused tests pass, then the complete suite and TypeScript pass.

- [ ] **Step 11: Commit**

```bash
git add supabase/migrations/202607160001_leave_management.sql \
  src/features/leave/balances/queries.ts \
  src/features/leave/balances/queries.test.ts \
  src/features/leave/balances/actions.test.ts
git commit -m "feat: add leave allocations and ledger accounting"
```

## Task 5: Draft request persistence and advisory per-date preview

**Files:**
- Modify: `supabase/migrations/202607160001_leave_management.sql`
- Modify: `src/features/leave/requests/queries.ts`
- Modify: `src/features/leave/requests/queries.test.ts`
- Create: `src/features/leave/requests/actions.test.ts`

**Interfaces:**
- Consumes: policy resolution, schedule assignments/versions, holiday resolution, balance projection, and Task 1 draft validation.
- Produces: `resolve_leave_day_context`, `preview_leave_request`, `create_leave_draft`, `update_leave_draft`, `delete_leave_draft`, `get_my_leave_requests`, `get_leave_request_detail`, and TypeScript request query adapters.

- [ ] **Step 1: Write failing draft, preview, and query tests**

Create `src/features/leave/requests/actions.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL("../../../../supabase/migrations/202607160001_leave_management.sql", import.meta.url),
  "utf8",
);
function body(name: string) {
  return sql.match(new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\$\\$;`, "i"))?.[0] ?? "";
}

test("draft creation restricts employees to themselves and permits HR on behalf", () => {
  const create = body("create_leave_draft");
  assert.match(create, /public\.current_employee_id\(\)/i);
  assert.match(create, /public\.is_hr_admin\(\)/i);
  assert.match(create, /created_source/i);
  assert.match(create, /'employee'|'hr'/i);
});

test("draft update locks group and checks expected revision", () => {
  const update = body("update_leave_draft");
  assert.match(update, /from public\.leave_request_groups[\s\S]+for update/i);
  assert.match(update, /p_expected_revision_id/i);
  assert.match(update, /current_status <> 'draft'/i);
  assert.match(update, /LEAVE_REQUEST_STALE/i);
});

test("submitted revisions cannot be changed or deleted", () => {
  assert.match(sql, /create or replace function public\.prevent_submitted_leave_revision_mutation/i);
  assert.match(sql, /old\.frozen_at is not null/i);
  assert.match(sql, /before update or delete on public\.leave_request_revisions/i);
});

test("preview resolves policy, schedule, holiday, rest day, and half-day boundary", () => {
  const resolver = body("resolve_leave_day_context");
  assert.match(resolver, /resolve_leave_type_version/i);
  assert.match(resolver, /employee_schedule_assignments/i);
  assert.match(resolver, /work_schedule_versions/i);
  assert.match(resolver, /resolve_active_holiday/i);
  assert.match(resolver, /scheduled_start_at \+ \(scheduled_end_at - scheduled_start_at\) \/ 2/i);
});

test("draft preview is advisory and creates no request-day or ledger rows", () => {
  const preview = body("preview_leave_request");
  assert.doesNotMatch(preview, /insert into public\.leave_request_days/i);
  assert.doesNotMatch(preview, /insert into public\.leave_balance_ledger/i);
  assert.match(preview, /generate_series/i);
});

test("draft deletion is the only permanent request deletion path", () => {
  const deletion = body("delete_leave_draft");
  assert.match(deletion, /current_status <> 'draft'/i);
  assert.match(deletion, /delete from public\.leave_request_groups/i);
  assert.doesNotMatch(sql, /delete from public\.leave_request_groups[\s\S]+current_status <> 'draft'/i);
});
```

Create `src/features/leave/requests/queries.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./queries.ts", import.meta.url), "utf8");

test("request queries are server-only and use safe projection RPCs", () => {
  assert.match(source, /import "server-only"/);
  assert.match(source, /get_my_leave_requests/);
  assert.match(source, /get_admin_leave_requests/);
  assert.match(source, /get_leave_request_detail/);
  assert.doesNotMatch(source, /select\("\*"\)/);
});

test("request detail exposes a day fingerprint for stale review", () => {
  assert.match(source, /day_fingerprint/);
  assert.match(source, /current_chargeable_units/);
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/leave/requests/actions.test.ts \
  src/features/leave/requests/queries.test.ts
```

Expected: failure because draft workflows and request query adapters are missing.

- [ ] **Step 3: Add targeted request-revision immutability**

Append:

```sql
create or replace function public.prevent_submitted_leave_revision_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.frozen_at is not null or old.submitted_at is not null then
    raise exception using errcode = 'P0001', message = 'LEAVE_IMMUTABLE_RECORD';
  end if;
  if tg_op = 'DELETE' and exists (
    select 1 from public.leave_request_groups as request_group
    where request_group.id = old.request_group_id
      and request_group.current_status <> 'draft'
  ) then
    raise exception using errcode = 'P0001', message = 'LEAVE_IMMUTABLE_RECORD';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger prevent_submitted_leave_revision_mutation
before update or delete on public.leave_request_revisions
for each row execute function public.prevent_submitted_leave_revision_mutation();
revoke all on function public.prevent_submitted_leave_revision_mutation()
from public, anon, authenticated;
```

- [ ] **Step 4: Add one-date context resolver**

Append a revoked internal function with this signature and return contract:

```sql
create or replace function public.resolve_leave_day_context(
  p_employee_id uuid,
  p_leave_type_version_id uuid,
  p_leave_date date,
  p_duration_mode text
)
returns table (
  schedule_assignment_id uuid,
  schedule_version_id uuid,
  holiday_version_id uuid,
  is_scheduled_workday boolean,
  is_rest_day boolean,
  is_holiday boolean,
  is_chargeable boolean,
  chargeable_units numeric,
  leave_classification text,
  half_day_boundary_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_policy public.leave_type_versions%rowtype;
  v_assignment public.employee_schedule_assignments%rowtype;
  v_schedule public.work_schedule_versions%rowtype;
  v_holiday record;
  v_weekday text;
  v_workday boolean := false;
  v_start timestamptz;
  v_end timestamptz;
  v_boundary timestamptz;
begin
  if p_duration_mode not in ('full_day','first_half','second_half') then
    raise exception using errcode = 'P0001', message = 'LEAVE_HALF_DAY_RANGE_INVALID';
  end if;
  select * into v_policy from public.leave_type_versions where id = p_leave_type_version_id;
  if not found then raise exception using errcode = 'P0001', message = 'LEAVE_POLICY_INACTIVE'; end if;

  select * into v_assignment
  from public.employee_schedule_assignments
  where employee_id = p_employee_id
    and not is_superseded
    and effective_start_date <= p_leave_date
    and (effective_end_date is null or effective_end_date >= p_leave_date)
  order by effective_start_date desc, id desc
  limit 1;

  if found then
    select * into v_schedule
    from public.work_schedule_versions
    where schedule_template_id = v_assignment.schedule_template_id
      and effective_date <= p_leave_date
    order by effective_date desc, id desc
    limit 1;
  end if;

  select * into v_holiday from public.resolve_active_holiday(p_leave_date);
  v_weekday := lower(trim(to_char(p_leave_date::timestamp, 'FMDay')));
  v_workday := v_schedule.id is not null and v_weekday = any(v_schedule.working_days);

  if v_schedule.id is not null and v_workday then
    v_start := (p_leave_date + v_schedule.start_time) at time zone 'Asia/Manila';
    v_end := (p_leave_date + v_schedule.end_time) at time zone 'Asia/Manila';
    if v_schedule.break_minutes > 0 then
      v_boundary := v_start + make_interval(mins => (
        floor(extract(epoch from (v_end - v_start)) / 120)::integer
      ));
    else
      v_boundary := v_start + (v_end - v_start) / 2;
    end if;
  end if;

  return query select
    case when v_assignment.id is null then null else v_assignment.id end,
    case when v_schedule.id is null then null else v_schedule.id end,
    v_holiday.holiday_version_id,
    v_workday,
    v_assignment.id is not null and not v_workday,
    v_holiday.holiday_version_id is not null,
    v_workday and v_holiday.holiday_version_id is null,
    case
      when not v_workday or v_holiday.holiday_version_id is not null then 0::numeric
      when p_duration_mode = 'full_day' then 1::numeric
      else 0.5::numeric
    end,
    case
      when v_holiday.holiday_version_id is not null then 'non_chargeable_holiday'
      when v_assignment.id is null then 'non_chargeable_no_schedule'
      when not v_workday then 'non_chargeable_rest_day'
      when v_policy.is_paid then 'paid_leave'
      else 'unpaid_leave'
    end,
    case when p_duration_mode = 'full_day' then null else v_boundary end;
end;
$$;
revoke all on function public.resolve_leave_day_context(uuid,uuid,date,text)
from public, anon, authenticated;
```

For schedules with a real unpaid break, the current schema stores only `break_minutes`, not a break start. Until a later schedule phase adds an explicit break timestamp, the implementation must use the midpoint of scheduled elapsed time as the boundary and preserve the resolved timestamp on the leave-day revision. This resolves the approved fallback deterministically without inventing a hidden break start.

- [ ] **Step 5: Add advisory preview RPC**

Append:

```sql
create or replace function public.preview_leave_request(
  p_employee_id uuid,
  p_leave_type_id uuid,
  p_start_date date,
  p_end_date date,
  p_duration_mode text,
  p_exclude_request_group_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_employee_id uuid := public.current_employee_id();
  v_policy record;
  v_day record;
  v_days jsonb := '[]'::jsonb;
  v_requested numeric;
  v_chargeable numeric := 0;
  v_account_id uuid;
  v_ledger_balance numeric := null;
  v_pending numeric := 0;
begin
  if auth.uid() is null
     or (not public.is_hr_admin() and v_actor_employee_id <> p_employee_id) then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception using errcode = 'P0001', message = 'LEAVE_DATE_RANGE_INVALID';
  end if;
  if extract(year from p_start_date) <> extract(year from p_end_date) then
    raise exception using errcode = 'P0001', message = 'LEAVE_CROSSES_YEAR';
  end if;
  if p_duration_mode <> 'full_day' and p_start_date <> p_end_date then
    raise exception using errcode = 'P0001', message = 'LEAVE_HALF_DAY_RANGE_INVALID';
  end if;
  select * into v_policy from public.resolve_leave_type_version(p_leave_type_id, p_start_date);
  if v_policy.leave_type_version_id is null or not v_policy.is_active then
    raise exception using errcode = 'P0001', message = 'LEAVE_POLICY_INACTIVE';
  end if;

  for v_day in
    select series.leave_date, context.*
    from generate_series(p_start_date, p_end_date, interval '1 day') as series(leave_date)
    cross join lateral public.resolve_leave_day_context(
      p_employee_id, v_policy.leave_type_version_id, series.leave_date::date, p_duration_mode
    ) as context
  loop
    v_chargeable := v_chargeable + v_day.chargeable_units;
    v_days := v_days || jsonb_build_array(jsonb_build_object(
      'leave_date', v_day.leave_date,
      'schedule_assignment_id', v_day.schedule_assignment_id,
      'schedule_version_id', v_day.schedule_version_id,
      'holiday_version_id', v_day.holiday_version_id,
      'is_scheduled_workday', v_day.is_scheduled_workday,
      'is_rest_day', v_day.is_rest_day,
      'is_holiday', v_day.is_holiday,
      'is_chargeable', v_day.is_chargeable,
      'chargeable_units', v_day.chargeable_units,
      'leave_classification', v_day.leave_classification,
      'half_day_boundary_at', v_day.half_day_boundary_at
    ));
  end loop;

  v_requested := ((p_end_date - p_start_date) + 1)
    * case when p_duration_mode = 'full_day' then 1 else 0.5 end;

  if v_policy.is_balance_tracked then
    select id into v_account_id
    from public.leave_balance_accounts
    where employee_id = p_employee_id
      and leave_type_id = p_leave_type_id
      and leave_year = extract(year from p_start_date)::integer;
    if v_account_id is not null then
      v_ledger_balance := public.get_leave_balance(v_account_id, p_start_date);
    else
      v_ledger_balance := 0;
    end if;
    select coalesce(sum(reservation.reserved_units), 0)
      into v_pending
    from public.leave_pending_reservations as reservation
    where reservation.employee_id = p_employee_id
      and reservation.leave_type_id = p_leave_type_id
      and reservation.leave_year = extract(year from p_start_date)::integer;
  end if;

  return jsonb_build_object(
    'policy_version', to_jsonb(v_policy),
    'days', v_days,
    'requested_units', v_requested,
    'chargeable_units', v_chargeable,
    'ledger_balance', v_ledger_balance,
    'pending_reserved_units', v_pending,
    'available_units', case when v_ledger_balance is null then null else v_ledger_balance - v_pending end,
    'requires_document', v_policy.document_required
      and (v_policy.document_required_min_units is null or v_chargeable >= v_policy.document_required_min_units)
  );
end;
$$;
revoke all on function public.preview_leave_request(uuid,uuid,date,date,text,uuid) from public, anon;
grant execute on function public.preview_leave_request(uuid,uuid,date,date,text,uuid) to authenticated;
```

- [ ] **Step 6: Add create, update, and delete draft workflows**

Append functions with these exact signatures:

```sql
create or replace function public.create_leave_draft(
  p_employee_id uuid,
  p_leave_type_id uuid,
  p_start_date date,
  p_end_date date,
  p_duration_mode text,
  p_employee_note text default null,
  p_replaces_request_group_id uuid default null,
  p_created_source text default 'employee'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public;

create or replace function public.update_leave_draft(
  p_request_group_id uuid,
  p_expected_revision_id uuid,
  p_leave_type_id uuid,
  p_start_date date,
  p_end_date date,
  p_duration_mode text,
  p_employee_note text default null,
  p_replaces_request_group_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public;

create or replace function public.delete_leave_draft(
  p_request_group_id uuid,
  p_expected_revision_id uuid
)
returns text[]
language plpgsql
security definer
set search_path = pg_catalog, public;
```

The function bodies must perform these exact transitions:

```text
create_leave_draft
1. Require auth.uid().
2. Accept p_created_source only as employee or hr.
3. For employee source, require p_employee_id = current_employee_id().
4. For hr source, require is_hr_admin().
5. Require the target employee to exist and not be archived.
6. Call preview_leave_request to resolve and validate the policy/date context.
7. If supplied, require the replacement target to belong to the same employee and be withdrawn or cancelled, then insert leave_request_groups with current_status draft and that replacement link.
8. Insert revision_number 1 using the preview's policy version, leave year, requested units, and 0 submitted chargeable units.
9. Set active_revision_id on the group.
10. Insert a created action from null to draft.
11. Write a safe audit entry containing IDs, dates, duration, and source only.
12. Return request_group_id.

update_leave_draft
1. Require auth.uid().
2. Lock the request group FOR UPDATE.
3. Require current_status draft and active_revision_id = p_expected_revision_id.
4. Require employee ownership or HR access.
5. Call preview_leave_request with p_request_group_id excluded from overlap checks.
6. Update only the current draft revision in place.
7. If supplied, require the replacement target to belong to the same employee and be withdrawn or cancelled; update replaces_request_group_id and updated_at on the group.
8. Return active_revision_id.

delete_leave_draft
1. Require auth.uid().
2. Lock the request group FOR UPDATE.
3. Require current_status draft and active_revision_id = p_expected_revision_id.
4. Require employee ownership or HR access.
5. Collect attachment storage paths ordered by attachment ID.
6. Delete the draft-only created action while the parent is still verifiably draft, clear the deferred active-revision pointer, and delete the draft request group; cascading foreign keys remove its revision and attachment metadata.
7. Return the collected paths so the authenticated server action can remove private objects.

**Implementation correction:** The base action table is immutable and uses restrictive foreign keys. Task 5 therefore replaces the generic action trigger with a targeted guard that permits deletion only for actions whose parent request is still draft. Submitted request actions remain immutable.
```

Use `LEAVE_PERMISSION_DENIED`, `LEAVE_INVALID_STATUS`, and `LEAVE_REQUEST_STALE` for permission, lifecycle, and expected-revision failures. Revoke all three functions from `public` and `anon`; grant execution to `authenticated`.

- [ ] **Step 7: Add safe request-list and detail RPCs**

Add these exact signatures:

```sql
create or replace function public.get_my_leave_requests(
  p_leave_year integer,
  p_status text default null,
  p_page integer default 1,
  p_page_size integer default 25
)
returns table (
  request_group_id uuid,
  employee_id uuid,
  employee_name text,
  employee_number text,
  department_name text,
  leave_type_name text,
  is_paid boolean,
  is_balance_tracked boolean,
  start_date date,
  end_date date,
  duration_mode text,
  status text,
  requested_units numeric,
  chargeable_units numeric,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  replaces_request_group_id uuid,
  superseded_by_request_group_id uuid,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public;

create or replace function public.get_admin_leave_requests(
  p_leave_year integer,
  p_status text default null,
  p_employee_id uuid default null,
  p_department_id uuid default null,
  p_leave_type_id uuid default null,
  p_start_date date default null,
  p_end_date date default null,
  p_page integer default 1,
  p_page_size integer default 25
)
returns table (
  request_group_id uuid,
  employee_id uuid,
  employee_name text,
  employee_number text,
  department_name text,
  leave_type_name text,
  is_paid boolean,
  is_balance_tracked boolean,
  start_date date,
  end_date date,
  duration_mode text,
  status text,
  requested_units numeric,
  chargeable_units numeric,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  replaces_request_group_id uuid,
  superseded_by_request_group_id uuid,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public;

create or replace function public.get_leave_request_detail(
  p_request_group_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public;
```

`get_my_leave_requests` must require `current_employee_id()` and return only that employee's requests. `get_admin_leave_requests` must require `is_hr_admin()` and apply every supplied filter. Both functions paginate with `greatest(p_page,1)` and `least(greatest(p_page_size,1),100)` and derive chargeable units from active request-day revisions.

The detail JSON must include:

```json
{
  "summary": {},
  "days": [],
  "actions": [],
  "attachments": [],
  "balance": {},
  "other_pending_reserved_units": 0,
  "current_chargeable_units": 0,
  "day_fingerprint": "sha256-of-active-day-revision-ids-and-units"
}
```

Compute the fingerprint with:

```sql
encode(
  digest(
    string_agg(
      request_day.active_revision_id::text || ':' || day_revision.chargeable_units::text,
      '|' order by request_day.leave_date
    ),
    'sha256'
  ),
  'hex'
)
```

Employees may receive private text only for their own request; HR may receive all request private text. Neither response may contain `storage_path`, ledger metadata, or private balance reasons. Revoke all three functions from `public` and `anon`; grant execution to `authenticated`.

- [ ] **Step 8: Create request query adapters**

Create `src/features/leave/requests/queries.ts`:

```ts
import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  LeaveClassification,
  LeaveDurationMode,
  LeavePreviewResult,
  LeaveRequestSummary,
} from "../types";

export async function getMyLeaveRequests(input: {
  leaveYear: number;
  status?: string | null;
  page?: number;
  pageSize?: number;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_leave_requests", {
    p_leave_year: input.leaveYear,
    p_status: input.status ?? null,
    p_page: input.page ?? 1,
    p_page_size: input.pageSize ?? 25,
  });
  if (error) throw new Error("Unable to load leave requests.");
  const rows = (data ?? []) as Array<LeaveRequestSummary & { total_count: number }>;
  return { items: rows, total: rows[0]?.total_count ?? 0 };
}

export async function getAdminLeaveRequests(input: {
  leaveYear: number;
  status?: string | null;
  employeeId?: string | null;
  departmentId?: string | null;
  leaveTypeId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  page?: number;
  pageSize?: number;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_admin_leave_requests", {
    p_leave_year: input.leaveYear,
    p_status: input.status ?? null,
    p_employee_id: input.employeeId ?? null,
    p_department_id: input.departmentId ?? null,
    p_leave_type_id: input.leaveTypeId ?? null,
    p_start_date: input.startDate ?? null,
    p_end_date: input.endDate ?? null,
    p_page: input.page ?? 1,
    p_page_size: input.pageSize ?? 25,
  });
  if (error) throw new Error("Unable to load organization leave requests.");
  const rows = (data ?? []) as Array<LeaveRequestSummary & { total_count: number }>;
  return { items: rows, total: rows[0]?.total_count ?? 0 };
}

export async function getLeaveRequestDetail(requestGroupId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_leave_request_detail", {
    p_request_group_id: requestGroupId,
  });
  if (error) throw new Error("Unable to load leave request details.");
  return data;
}

export async function previewLeaveRequest(input: {
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  durationMode: LeaveDurationMode;
  excludeRequestGroupId?: string | null;
}): Promise<LeavePreviewResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("preview_leave_request", {
    p_employee_id: input.employeeId,
    p_leave_type_id: input.leaveTypeId,
    p_start_date: input.startDate,
    p_end_date: input.endDate,
    p_duration_mode: input.durationMode,
    p_exclude_request_group_id: input.excludeRequestGroupId ?? null,
  });
  if (error || !data) throw new Error(error?.message ?? "Unable to preview leave dates.");
  const row = data as Record<string, unknown>;
  return {
    days: ((row.days ?? []) as Record<string, unknown>[]).map((day) => ({
      leaveDate: String(day.leave_date),
      scheduleName: day.schedule_name ? String(day.schedule_name) : null,
      classification: day.leave_classification as LeaveClassification,
      chargeableUnits: Number(day.chargeable_units) as 0 | 0.5 | 1,
      isHoliday: Boolean(day.is_holiday),
      isRestDay: Boolean(day.is_rest_day),
      halfDayBoundaryAt: day.half_day_boundary_at ? String(day.half_day_boundary_at) : null,
    })),
    requestedUnits: Number(row.requested_units),
    chargeableUnits: Number(row.chargeable_units),
    ledgerBalance: row.ledger_balance === null ? null : Number(row.ledger_balance),
    pendingReservedUnits: Number(row.pending_reserved_units),
    availableUnits: row.available_units === null ? null : Number(row.available_units),
    requiresDocument: Boolean(row.requires_document),
  };
}
```

- [ ] **Step 9: Run focused and full verification**

Run:

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/leave/requests/actions.test.ts \
  src/features/leave/requests/queries.test.ts
npm test
npx tsc --noEmit
```

Expected: focused tests pass, then the complete suite and TypeScript pass.

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/202607160001_leave_management.sql \
  src/features/leave/requests/queries.ts \
  src/features/leave/requests/queries.test.ts \
  src/features/leave/requests/actions.test.ts
git commit -m "feat: add leave drafts and request previews"
```

## Task 6: Private draft attachment upload, finalization, download, and deletion

**Files:**
- Modify: `supabase/migrations/202607160001_leave_management.sql`
- Create: `src/features/leave/requests/storage.ts`
- Create: `src/features/leave/requests/storage.test.ts`
- Create: `src/app/api/leave/attachments/prepare/route.ts`
- Create: `src/app/api/leave/attachments/finalize/route.ts`
- Create: `src/app/api/leave/attachments/[attachmentId]/download/route.ts`

**Interfaces:**
- Consumes: private bucket and draft ownership rules.
- Produces: `prepare_leave_attachment`, `finalize_leave_attachment`, `delete_leave_attachment`, `get_leave_attachment_download`, `prepareLeaveAttachmentUpload`, `finalizeLeaveAttachment`, `deleteLeaveAttachment`, and `getLeaveAttachmentDownloadUrl`.

- [ ] **Step 1: Write failing storage tests**

Create `src/features/leave/requests/storage.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL("../../../../supabase/migrations/202607160001_leave_management.sql", import.meta.url),
  "utf8",
);
const storage = await readFile(new URL("./storage.ts", import.meta.url), "utf8").catch(() => "");
const prepareRoute = await readFile(
  new URL("../../../app/api/leave/attachments/prepare/route.ts", import.meta.url),
  "utf8",
).catch(() => "");
const finalizeRoute = await readFile(
  new URL("../../../app/api/leave/attachments/finalize/route.ts", import.meta.url),
  "utf8",
).catch(() => "");

test("attachment RPCs permit draft-only writes", () => {
  for (const name of ["prepare_leave_attachment", "finalize_leave_attachment", "delete_leave_attachment"]) {
    assert.match(sql, new RegExp(`create or replace function public\\.${name}`, "i"));
  }
  assert.match(sql, /current_status <> 'draft'/i);
  assert.match(sql, /frozen_at is not null/i);
});

test("server storage helper enforces exact types, size, and count", () => {
  assert.match(storage, /LEAVE_ATTACHMENT_MAX_COUNT/);
  assert.match(storage, /LEAVE_ATTACHMENT_MAX_BYTES/);
  assert.match(storage, /LEAVE_ATTACHMENT_MIME_TYPES/);
  assert.match(storage, /LEAVE_ATTACHMENT_EXTENSIONS/);
});

test("prepare and finalize routes authorize through the authenticated Supabase client", () => {
  assert.match(prepareRoute, /createClient/);
  assert.match(prepareRoute, /prepare_leave_attachment/);
  assert.match(prepareRoute, /randomUUID\(\)/);
  assert.doesNotMatch(prepareRoute, /body\.storagePath/);
  assert.match(finalizeRoute, /createClient/);
  assert.match(finalizeRoute, /finalize_leave_attachment/);
  assert.doesNotMatch(finalizeRoute, /size_bytes:\s*body/i);
  assert.doesNotMatch(`${prepareRoute}
${finalizeRoute}`, /service_role|createAdminClient/);
});

test("download route creates a short-lived signed URL after database authorization", async () => {
  const source = await readFile(
    new URL("../../../app/api/leave/attachments/[attachmentId]/download/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /get_leave_attachment_download/);
  assert.match(source, /createSignedUrl/);
  assert.match(source, /60/);
  assert.match(source, /Cache-Control.*no-store/i);
});
```

- [ ] **Step 2: Run tests and verify they fail**

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/leave/requests/storage.test.ts
```

Expected: failure because attachment functions and routes do not exist.

- [ ] **Step 3: Add protected attachment metadata workflows**

Append these functions to the migration:

```sql
create or replace function public.prepare_leave_attachment(
  p_request_group_id uuid,
  p_expected_revision_id uuid,
  p_attachment_id uuid,
  p_original_filename text,
  p_mime_type text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_group public.leave_request_groups%rowtype;
  v_employee_id uuid := public.current_employee_id();
  v_extension text;
  v_path text;
  v_count integer;
begin
  select * into v_group from public.leave_request_groups
  where id = p_request_group_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_STALE'; end if;
  if v_group.current_status <> 'draft' or v_group.active_revision_id <> p_expected_revision_id then
    raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_STALE';
  end if;
  if not public.is_hr_admin() and v_group.employee_id <> v_employee_id then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  select count(*) into v_count from public.leave_request_attachments
  where request_group_id = p_request_group_id;
  if v_count >= 5 then raise exception using errcode = 'P0001', message = 'LEAVE_ATTACHMENT_INVALID'; end if;
  v_extension := lower(split_part(p_original_filename, '.', array_length(string_to_array(p_original_filename, '.'), 1)));
  if (p_mime_type = 'application/pdf' and v_extension <> 'pdf')
     or (p_mime_type = 'image/jpeg' and v_extension not in ('jpg','jpeg'))
     or (p_mime_type = 'image/png' and v_extension <> 'png')
     or p_mime_type not in ('application/pdf','image/jpeg','image/png') then
    raise exception using errcode = 'P0001', message = 'LEAVE_ATTACHMENT_INVALID';
  end if;
  v_path := v_group.employee_id::text || '/' || v_group.id::text || '/' || p_attachment_id::text || '.' || v_extension;
  return v_path;
end;
$$;

create or replace function public.finalize_leave_attachment(
  p_request_group_id uuid,
  p_expected_revision_id uuid,
  p_attachment_id uuid,
  p_storage_path text,
  p_original_filename text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_group public.leave_request_groups%rowtype;
  v_object record;
  v_employee_id uuid := public.current_employee_id();
begin
  select * into v_group from public.leave_request_groups
  where id = p_request_group_id for update;
  if not found or v_group.current_status <> 'draft' or v_group.active_revision_id <> p_expected_revision_id then
    raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_STALE';
  end if;
  if not public.is_hr_admin() and v_group.employee_id <> v_employee_id then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  if p_storage_path not like v_group.employee_id::text || '/' || v_group.id::text || '/' || p_attachment_id::text || '.%' then
    raise exception using errcode = 'P0001', message = 'LEAVE_ATTACHMENT_INVALID';
  end if;
  select metadata, name into v_object
  from storage.objects
  where bucket_id = 'leave-documents' and name = p_storage_path;
  if not found
     or coalesce((v_object.metadata ->> 'size')::bigint, 0) not between 1 and 10485760
     or coalesce(v_object.metadata ->> 'mimetype', '') not in ('application/pdf','image/jpeg','image/png') then
    raise exception using errcode = 'P0001', message = 'LEAVE_ATTACHMENT_INVALID';
  end if;
  insert into public.leave_request_attachments (
    id, request_group_id, request_revision_id, storage_path, original_filename,
    mime_type, size_bytes, uploaded_by
  ) values (
    p_attachment_id, p_request_group_id, p_expected_revision_id, p_storage_path,
    left(btrim(p_original_filename), 255), v_object.metadata ->> 'mimetype',
    (v_object.metadata ->> 'size')::bigint, auth.uid()
  );
  return p_attachment_id;
end;
$$;

create or replace function public.delete_leave_attachment(
  p_attachment_id uuid,
  p_expected_revision_id uuid
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_attachment public.leave_request_attachments%rowtype;
  v_group public.leave_request_groups%rowtype;
begin
  select * into v_attachment from public.leave_request_attachments
  where id = p_attachment_id for update;
  select * into v_group from public.leave_request_groups
  where id = v_attachment.request_group_id for update;
  if v_group.current_status <> 'draft'
     or v_group.active_revision_id <> p_expected_revision_id
     or v_attachment.frozen_at is not null then
    raise exception using errcode = 'P0001', message = 'LEAVE_INVALID_STATUS';
  end if;
  if not public.is_hr_admin() and v_group.employee_id <> public.current_employee_id() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  delete from public.leave_request_attachments where id = p_attachment_id;
  return v_attachment.storage_path;
end;
$$;

create or replace function public.get_leave_attachment_download(p_attachment_id uuid)
returns table (storage_path text, original_filename text, mime_type text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  return query
  select attachment.storage_path, attachment.original_filename, attachment.mime_type
  from public.leave_request_attachments as attachment
  join public.leave_request_groups as request_group on request_group.id = attachment.request_group_id
  where attachment.id = p_attachment_id
    and (public.is_hr_admin() or request_group.employee_id = public.current_employee_id());
  if not found then raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED'; end if;
end;
$$;
```

Revoke from `public` and `anon`; grant these four RPCs to `authenticated`.

- [ ] **Step 4: Implement server-only storage helpers**

Create `src/features/leave/requests/storage.ts`:

```ts
import "server-only";
import {
  LEAVE_ATTACHMENT_BUCKET,
  LEAVE_ATTACHMENT_EXTENSIONS,
  LEAVE_ATTACHMENT_MAX_BYTES,
  LEAVE_ATTACHMENT_MAX_COUNT,
  LEAVE_ATTACHMENT_MIME_TYPES,
} from "../constants";

export function validateLeaveAttachmentFile(file: { name: string; type: string; size: number }) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mimeAllowed = LEAVE_ATTACHMENT_MIME_TYPES.includes(
    file.type as (typeof LEAVE_ATTACHMENT_MIME_TYPES)[number],
  );
  const extensionAllowed = LEAVE_ATTACHMENT_EXTENSIONS.includes(
    extension as (typeof LEAVE_ATTACHMENT_EXTENSIONS)[number],
  );
  const pairAllowed =
    (file.type === "application/pdf" && extension === "pdf") ||
    (file.type === "image/jpeg" && ["jpg", "jpeg"].includes(extension)) ||
    (file.type === "image/png" && extension === "png");
  if (!mimeAllowed || !extensionAllowed || !pairAllowed || file.size < 1 || file.size > LEAVE_ATTACHMENT_MAX_BYTES) {
    throw new Error("LEAVE_ATTACHMENT_INVALID");
  }
  return { extension, bucket: LEAVE_ATTACHMENT_BUCKET };
}

export function validateAttachmentCount(count: number) {
  if (count < 0 || count >= LEAVE_ATTACHMENT_MAX_COUNT) throw new Error("LEAVE_ATTACHMENT_INVALID");
}
```

- [ ] **Step 5: Implement prepare/finalize/download route handlers**

`prepare/route.ts` must:

```ts
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mapLeaveError } from "@/features/leave/errors";
import { validateLeaveAttachmentFile } from "@/features/leave/requests/storage";

export async function POST(request: Request) {
  const body = await request.json() as {
    requestGroupId?: string;
    expectedRevisionId?: string;
    name?: string;
    type?: string;
    size?: number;
  };
  try {
    const file = { name: String(body.name ?? ""), type: String(body.type ?? ""), size: Number(body.size ?? 0) };
    validateLeaveAttachmentFile(file);
    const attachmentId = randomUUID();
    const supabase = await createClient();
    const { data: path, error } = await supabase.rpc("prepare_leave_attachment", {
      p_request_group_id: body.requestGroupId,
      p_expected_revision_id: body.expectedRevisionId,
      p_attachment_id: attachmentId,
      p_original_filename: file.name,
      p_mime_type: file.type,
    });
    if (error || !path) throw new Error(error?.message ?? "LEAVE_ATTACHMENT_INVALID");
    const { data: signed, error: signedError } = await supabase.storage
      .from("leave-documents")
      .createSignedUploadUrl(path);
    if (signedError) throw new Error("LEAVE_ATTACHMENT_INVALID");
    return NextResponse.json({ attachmentId, path, token: signed.token });
  } catch (error) {
    return NextResponse.json(
      { error: mapLeaveError(error instanceof Error ? error.message : "") },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
```

`finalize/route.ts` must call only `finalize_leave_attachment` with the server-issued IDs/path and return the attachment ID. It must never accept or forward client-provided MIME type or size.

`download/route.ts` must:

```ts
const { data, error } = await supabase.rpc("get_leave_attachment_download", {
  p_attachment_id: params.attachmentId,
});
const item = data?.[0];
if (error || !item) return new Response("Not found", { status: 404 });
const { data: signed, error: signedError } = await supabase.storage
  .from("leave-documents")
  .createSignedUrl(item.storage_path, 60, { download: item.original_filename });
if (signedError || !signed?.signedUrl) return new Response("Unavailable", { status: 503 });
const response = NextResponse.redirect(signed.signedUrl, 302);
response.headers.set("Cache-Control", "no-store");
return response;
```

Use the actual Next.js 16 `params: Promise<{ attachmentId: string }>` route signature.

- [ ] **Step 6: Run focused and full verification**

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/leave/requests/storage.test.ts
npm test
npx tsc --noEmit
```

Expected: all tests and TypeScript pass.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/202607160001_leave_management.sql \
  src/features/leave/requests/storage.ts \
  src/features/leave/requests/storage.test.ts \
  src/app/api/leave/attachments
git commit -m "feat: add private leave attachments"
```

## Task 7: Atomic submission, overlap detection, immutable snapshots, and logical reservations

**Files:**
- Modify: `supabase/migrations/202607160001_leave_management.sql`
- Modify: `src/features/leave/requests/actions.test.ts`
- Create: `src/features/leave/concurrency.test.ts`

**Interfaces:**
- Consumes: drafts, attachments, day resolver, balance helpers, and pending reservation view.
- Produces: `leave_duration_overlaps`, `validate_leave_eligibility`, `submit_leave_request`, and `create_hr_leave_request`.

- [ ] **Step 1: Extend tests for submission rules and concurrency locks**

Append to `src/features/leave/requests/actions.test.ts`:

```ts
test("submission freezes one policy version and immutable day snapshots", () => {
  const submit = body("submit_leave_request");
  assert.match(submit, /resolve_leave_type_version/i);
  assert.match(submit, /insert into public\.leave_request_days/i);
  assert.match(submit, /insert into public\.leave_request_day_revisions/i);
  assert.match(submit, /frozen_at = now\(\)/i);
  assert.match(submit, /frozen_at = now\(\)[\s\S]+leave_request_attachments/i);
  assert.match(submit, /current_status = 'pending'/i);
  assert.doesNotMatch(submit, /insert into public\.leave_balance_ledger/i);
});

test("submission enforces employee window, one year, half-day, and chargeable-day rules", () => {
  const submit = body("submit_leave_request");
  assert.match(submit, /- 30/i);
  assert.match(submit, /\+ 365/i);
  assert.match(submit, /LEAVE_OUTSIDE_DATE_WINDOW/i);
  assert.match(submit, /LEAVE_CROSSES_YEAR/i);
  assert.match(submit, /LEAVE_HALF_DAY_RANGE_INVALID/i);
  assert.match(submit, /LEAVE_NO_CHARGEABLE_DAYS/i);
});

test("submission validates notes and documents against frozen policy", () => {
  const submit = body("submit_leave_request");
  assert.match(submit, /employee_note_required/i);
  assert.match(submit, /document_required_min_units/i);
  assert.match(submit, /LEAVE_DOCUMENT_REQUIRED/i);
  assert.match(submit, /count\(\*\)[\s\S]+leave_request_attachments/i);
});

test("overlap rules allow opposite halves but block full and matching halves", () => {
  const overlap = body("leave_duration_overlaps");
  assert.match(overlap, /p_left = 'full_day' or p_right = 'full_day'/i);
  assert.match(overlap, /p_left = p_right/i);
  assert.doesNotMatch(overlap, /first_half'.*second_half'.*true/is);
});
```

Create `src/features/leave/concurrency.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL("../../../supabase/migrations/202607160001_leave_management.sql", import.meta.url),
  "utf8",
);
function body(name: string) {
  return sql.match(new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\$\\$;`, "i"))?.[0] ?? "";
}

test("submission locks employee and tracked balance account before reservation checks", () => {
  const submit = body("submit_leave_request");
  const employeeLock = submit.search(/from public\.employees[\s\S]+for update/i);
  const accountLock = submit.search(/get_or_create_leave_balance_account/i);
  const reservationCheck = submit.search(/leave_pending_reservations/i);
  assert.ok(employeeLock >= 0);
  assert.ok(accountLock > employeeLock);
  assert.ok(reservationCheck > accountLock);
});

test("submission overlap query locks blocking request groups", () => {
  const submit = body("submit_leave_request");
  assert.match(submit, /current_status in \('pending','approved'\)/i);
  assert.match(submit, /for update/i);
  assert.match(submit, /LEAVE_OVERLAP/i);
});

test("pending reservations exclude the current request during revalidation", () => {
  const submit = body("submit_leave_request");
  assert.match(submit, /request_group\.id <> p_request_group_id/i);
});
```

- [ ] **Step 2: Run tests and verify they fail**

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/leave/requests/actions.test.ts \
  src/features/leave/concurrency.test.ts
```

Expected: failure because submission functions are missing.

- [ ] **Step 3: Add overlap and eligibility helpers**

Append:

```sql
create or replace function public.leave_duration_overlaps(p_left text, p_right text)
returns boolean
language sql
immutable
set search_path = pg_catalog, public
as $$
  select p_left = 'full_day' or p_right = 'full_day' or p_left = p_right;
$$;

create or replace function public.validate_leave_eligibility(
  p_employee_id uuid,
  p_leave_type_id uuid,
  p_leave_year integer,
  p_policy_version_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_employee public.employees%rowtype;
  v_setting public.employee_leave_year_settings%rowtype;
  v_policy public.leave_type_versions%rowtype;
begin
  select * into v_employee from public.employees where id = p_employee_id;
  if not found or v_employee.archived_at is not null
     or v_employee.employment_status in ('inactive','terminated') then
    raise exception using errcode = 'P0001', message = 'LEAVE_NOT_ELIGIBLE';
  end if;
  select * into v_policy from public.leave_type_versions where id = p_policy_version_id;
  if not found or v_policy.leave_type_id <> p_leave_type_id or not v_policy.is_active then
    raise exception using errcode = 'P0001', message = 'LEAVE_POLICY_INACTIVE';
  end if;
  select * into v_setting
  from public.employee_leave_year_settings
  where employee_id = p_employee_id
    and leave_type_id = p_leave_type_id
    and leave_year = p_leave_year;
  if found and v_setting.is_excluded then
    raise exception using errcode = 'P0001', message = 'LEAVE_NOT_ELIGIBLE';
  end if;
  if v_policy.is_balance_tracked and not exists (
    select 1 from public.leave_balance_accounts
    where employee_id = p_employee_id
      and leave_type_id = p_leave_type_id
      and leave_year = p_leave_year
  ) then
    raise exception using errcode = 'P0001', message = 'LEAVE_NOT_ELIGIBLE';
  end if;
end;
$$;

revoke all on function public.leave_duration_overlaps(text,text) from public, anon, authenticated;
revoke all on function public.validate_leave_eligibility(uuid,uuid,integer,uuid) from public, anon, authenticated;
```

- [ ] **Step 4: Implement one internal submission helper used by employee and HR entry points**

Add:

```sql
create or replace function public.submit_leave_request_internal(
  p_request_group_id uuid,
  p_expected_revision_id uuid,
  p_allow_date_override boolean
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_group public.leave_request_groups%rowtype;
  v_revision public.leave_request_revisions%rowtype;
  v_policy record;
  v_day record;
  v_request_day_id uuid;
  v_day_revision_id uuid;
  v_chargeable numeric := 0;
  v_requested numeric;
  v_company_date date := public.company_attendance_date(now());
  v_account_id uuid;
  v_ledger_balance numeric := 0;
  v_pending numeric := 0;
  v_attachment_count integer := 0;
  v_actor_role text := public.current_user_role()::text;
begin
  select * into v_group
  from public.leave_request_groups
  where id = p_request_group_id
  for update;
  if not found or v_group.current_status <> 'draft' or v_group.active_revision_id <> p_expected_revision_id then
    raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_STALE';
  end if;
  select * into v_revision
  from public.leave_request_revisions
  where id = v_group.active_revision_id
  for update;

  perform 1 from public.employees where id = v_group.employee_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'LEAVE_NOT_ELIGIBLE'; end if;
  if not p_allow_date_override and (
    v_revision.start_date < v_company_date - 30
    or v_revision.end_date > v_company_date + 365
  ) then
    raise exception using errcode = 'P0001', message = 'LEAVE_OUTSIDE_DATE_WINDOW';
  end if;
  if extract(year from v_revision.start_date) <> extract(year from v_revision.end_date) then
    raise exception using errcode = 'P0001', message = 'LEAVE_CROSSES_YEAR';
  end if;
  if v_revision.duration_mode <> 'full_day' and v_revision.start_date <> v_revision.end_date then
    raise exception using errcode = 'P0001', message = 'LEAVE_HALF_DAY_RANGE_INVALID';
  end if;

  select * into v_policy
  from public.resolve_leave_type_version(
    (select leave_type_id from public.leave_type_versions where id = v_revision.leave_type_version_id),
    v_revision.start_date
  );
  if v_policy.leave_type_version_id is null or not v_policy.is_active then
    raise exception using errcode = 'P0001', message = 'LEAVE_POLICY_INACTIVE';
  end if;
  perform public.validate_leave_eligibility(
    v_group.employee_id,
    v_policy.leave_type_id,
    v_revision.leave_year,
    v_policy.leave_type_version_id
  );

  if exists (
    select 1
    from public.leave_request_groups as request_group
    join public.leave_request_revisions as request_revision
      on request_revision.id = request_group.active_revision_id
    where request_group.employee_id = v_group.employee_id
      and request_group.id <> p_request_group_id
      and request_group.current_status in ('pending','approved')
      and daterange(request_revision.start_date, request_revision.end_date, '[]')
        && daterange(v_revision.start_date, v_revision.end_date, '[]')
      and exists (
        select 1
        from generate_series(
          greatest(request_revision.start_date, v_revision.start_date),
          least(request_revision.end_date, v_revision.end_date),
          interval '1 day'
        ) as overlap_date
        where public.leave_duration_overlaps(
          request_revision.duration_mode,
          v_revision.duration_mode
        )
      )
    for update of request_group
  ) then
    raise exception using errcode = 'P0001', message = 'LEAVE_OVERLAP';
  end if;

  delete from public.leave_request_days where request_revision_id = v_revision.id;
  for v_day in
    select series.leave_date::date, context.*
    from generate_series(v_revision.start_date, v_revision.end_date, interval '1 day') as series(leave_date)
    cross join lateral public.resolve_leave_day_context(
      v_group.employee_id,
      v_policy.leave_type_version_id,
      series.leave_date::date,
      v_revision.duration_mode
    ) as context
  loop
    insert into public.leave_request_days (request_revision_id, leave_date)
    values (v_revision.id, v_day.leave_date)
    returning id into v_request_day_id;
    insert into public.leave_request_day_revisions (
      request_day_id, revision_number, schedule_assignment_id, schedule_version_id,
      holiday_version_id, is_scheduled_workday, is_rest_day, is_holiday,
      is_chargeable, chargeable_units, leave_classification, half_day_boundary_at,
      calculation_source, calculated_by
    ) values (
      v_request_day_id, 1, v_day.schedule_assignment_id, v_day.schedule_version_id,
      v_day.holiday_version_id, v_day.is_scheduled_workday, v_day.is_rest_day,
      v_day.is_holiday, v_day.is_chargeable, v_day.chargeable_units,
      v_day.leave_classification, v_day.half_day_boundary_at,
      'submission', v_actor
    ) returning id into v_day_revision_id;
    update public.leave_request_days set active_revision_id = v_day_revision_id
    where id = v_request_day_id;
    v_chargeable := v_chargeable + v_day.chargeable_units;
  end loop;

  if v_chargeable = 0 then
    raise exception using errcode = 'P0001', message = 'LEAVE_NO_CHARGEABLE_DAYS';
  end if;
  if v_policy.employee_note_required and nullif(btrim(coalesce(v_revision.employee_note, '')), '') is null then
    raise exception using errcode = 'P0001', message = 'LEAVE_NOTE_REQUIRED';
  end if;
  select count(*) into v_attachment_count
  from public.leave_request_attachments
  where request_group_id = v_group.id and request_revision_id = v_revision.id;
  if v_attachment_count > 5 then
    raise exception using errcode = 'P0001', message = 'LEAVE_ATTACHMENT_INVALID';
  end if;
  if v_policy.document_required
     and (v_policy.document_required_min_units is null or v_chargeable >= v_policy.document_required_min_units)
     and v_attachment_count = 0 then
    raise exception using errcode = 'P0001', message = 'LEAVE_DOCUMENT_REQUIRED';
  end if;

  if v_policy.is_balance_tracked then
    v_account_id := public.get_or_create_leave_balance_account(
      v_group.employee_id, v_policy.leave_type_id, v_revision.leave_year
    );
    v_ledger_balance := public.get_leave_balance(v_account_id, v_revision.start_date);
    select coalesce(sum(day_revision.chargeable_units), 0)
      into v_pending
    from public.leave_request_groups as request_group
    join public.leave_request_revisions as request_revision
      on request_revision.id = request_group.active_revision_id
    join public.leave_request_days as request_day
      on request_day.request_revision_id = request_revision.id
    join public.leave_request_day_revisions as day_revision
      on day_revision.id = request_day.active_revision_id
    join public.leave_type_versions as policy
      on policy.id = request_revision.leave_type_version_id
    where request_group.employee_id = v_group.employee_id
      and request_group.id <> p_request_group_id
      and request_group.current_status = 'pending'
      and policy.leave_type_id = v_policy.leave_type_id
      and request_revision.leave_year = v_revision.leave_year
      and day_revision.is_chargeable;
    if v_ledger_balance - v_pending < v_chargeable then
      raise exception using errcode = 'P0001', message = 'LEAVE_INSUFFICIENT_BALANCE';
    end if;
  end if;

  v_requested := ((v_revision.end_date - v_revision.start_date) + 1)
    * case when v_revision.duration_mode = 'full_day' then 1 else 0.5 end;
  update public.leave_request_revisions
  set leave_type_version_id = v_policy.leave_type_version_id,
      requested_units = v_requested,
      submitted_chargeable_units = v_chargeable,
      submitted_at = now(),
      frozen_at = now(),
      updated_at = now()
  where id = v_revision.id;
  update public.leave_request_attachments set frozen_at = now()
  where request_group_id = v_group.id;
  update public.leave_request_groups
  set current_status = 'pending', updated_at = now()
  where id = v_group.id;
  insert into public.leave_request_actions (
    request_group_id, request_revision_id, action_type, from_status, to_status,
    actor_profile_id, actor_role
  ) values (
    v_group.id, v_revision.id, 'submitted', 'draft', 'pending', v_actor, v_actor_role
  );
  perform public.write_leave_audit(
    v_group.employee_id,
    'leave_request.submitted',
    'leave_request',
    v_group.id,
    jsonb_build_object(
      'request_group_id', v_group.id,
      'request_revision_id', v_revision.id,
      'leave_type_id', v_policy.leave_type_id,
      'leave_type_version_id', v_policy.leave_type_version_id,
      'leave_year', v_revision.leave_year,
      'start_date', v_revision.start_date,
      'end_date', v_revision.end_date,
      'requested_units', v_requested,
      'chargeable_units', v_chargeable,
      'status', 'pending'
    )
  );
  return v_group.id;
end;
$$;
```

The final SQL must avoid the draft-day delete conflicting with Task 2 immutability triggers. Drafts have no `leave_request_days` until submission, so remove the defensive `delete from public.leave_request_days` line from the final implementation. If a prior failed transaction attempted inserts, PostgreSQL rollback already removed them.

- [ ] **Step 5: Add employee and HR public submission entry points**

Append:

```sql
create or replace function public.submit_leave_request(
  p_request_group_id uuid,
  p_expected_revision_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_group public.leave_request_groups%rowtype;
begin
  select * into v_group from public.leave_request_groups where id = p_request_group_id;
  if not found or auth.uid() is null
     or v_group.employee_id <> public.current_employee_id() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  return public.submit_leave_request_internal(
    p_request_group_id, p_expected_revision_id, false
  );
end;
$$;

create or replace function public.create_hr_leave_request(
  p_request_group_id uuid,
  p_expected_revision_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  return public.submit_leave_request_internal(
    p_request_group_id, p_expected_revision_id, true
  );
end;
$$;

revoke all on function public.submit_leave_request_internal(uuid,uuid,boolean)
from public, anon, authenticated;
revoke all on function public.submit_leave_request(uuid,uuid) from public, anon;
revoke all on function public.create_hr_leave_request(uuid,uuid) from public, anon;
grant execute on function public.submit_leave_request(uuid,uuid) to authenticated;
grant execute on function public.create_hr_leave_request(uuid,uuid) to authenticated;
```

- [ ] **Step 6: Run focused and full verification**

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/leave/requests/actions.test.ts \
  src/features/leave/concurrency.test.ts
npm test
```

Expected: submission and concurrency tests pass; complete suite has no failures.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/202607160001_leave_management.sql \
  src/features/leave/requests/actions.test.ts \
  src/features/leave/concurrency.test.ts
git commit -m "feat: add atomic leave submission"
```


## Task 8: Immutable review, withdrawal, cancellation, and replacement lifecycle

**Files:**
- Modify: `supabase/migrations/202607160001_leave_management.sql`
- Modify: `src/features/leave/requests/actions.test.ts`
- Modify: `src/features/leave/concurrency.test.ts`
- Create: `src/features/leave/requests/queries.ts`
- Create: `src/features/leave/requests/queries.test.ts`

**Interfaces:**
- Consumes: `consume_leave_balance(uuid,numeric,text,date,uuid,uuid,uuid,text,jsonb)`, `restore_leave_charge(uuid,text,uuid,text,jsonb)`, frozen request revisions and active request-day revisions from Tasks 4 and 7.
- Produces: `withdraw_leave_request`, `review_leave_request`, `cancel_approved_leave_request`, `get_my_leave_requests`, `get_admin_leave_requests`, and `get_leave_request_detail` with stable stale-review protection.

- [ ] **Step 1: Extend lifecycle tests before writing the functions**

Append to `src/features/leave/requests/actions.test.ts`:

```ts
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../../../../supabase/migrations/202607160001_leave_management.sql", import.meta.url),
  "utf8",
);

function functionBody(name: string) {
  const pattern = new RegExp(
    `create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
    "i",
  );
  const body = migration.match(pattern)?.[0];
  assert.ok(body, `${name} must exist`);
  return body;
}

test("review locks the request and checks expected revision and status", () => {
  const source = functionBody("review_leave_request");
  assert.match(source, /for update/i);
  assert.match(source, /p_expected_revision_id/i);
  assert.match(source, /p_expected_status/i);
  assert.match(source, /p_expected_day_fingerprint/i);
  assert.match(source, /LEAVE_REQUEST_STALE/i);
  assert.match(source, /consume_leave_balance/i);
  assert.match(source, /approved_leave_charge/i);
  assert.match(source, /recalculate_attendance_for_leave_dates/i);
});

test("rejection requires a private reason and creates no ledger charge", () => {
  const source = functionBody("review_leave_request");
  assert.match(source, /p_decision = 'reject'/i);
  assert.match(source, /LEAVE_REASON_REQUIRED/i);
  const rejectionBranch = source.split(/p_decision = 'reject'/i)[1] ?? "";
  assert.doesNotMatch(rejectionBranch.split(/else/i)[0] ?? "", /consume_leave_balance/i);
});

test("employee withdrawal is pending-only and creates no ledger row", () => {
  const source = functionBody("withdraw_leave_request");
  assert.match(source, /current_status <> 'pending'/i);
  assert.match(source, /LEAVE_REQUEST_STALE/i);
  assert.match(source, /current_employee_id\(\)/i);
  assert.doesNotMatch(source, /insert into public\.leave_balance_ledger/i);
});

test("approved cancellation restores original sources and requires HR", () => {
  const source = functionBody("cancel_approved_leave_request");
  assert.match(source, /is_hr_admin\(\)/i);
  assert.match(source, /current_status <> 'approved'/i);
  assert.match(source, /restore_leave_charge/i);
  assert.match(source, /LEAVE_REASON_REQUIRED/i);
  assert.match(source, /recalculate_attendance_for_leave_dates/i);
});

test("replacement supersedes the old request only after approval", () => {
  const source = functionBody("review_leave_request");
  assert.match(source, /replaces_request_group_id/i);
  assert.match(source, /superseded_by_request_group_id/i);
  assert.match(source, /to_status[^\n]*superseded|superseded[^\n]*to_status/i);
});
```

Create `src/features/leave/requests/queries.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./queries.ts", import.meta.url), "utf8");

test("request queries use safe RPC projections", () => {
  assert.match(source, /get_my_leave_requests/);
  assert.match(source, /get_admin_leave_requests/);
  assert.match(source, /get_leave_request_detail/);
  assert.doesNotMatch(source, /from\("leave_request_revisions"\)/);
  assert.doesNotMatch(source, /from\("leave_request_actions"\)/);
});

test("request detail normalizes numeric units", () => {
  assert.match(source, /Number\(row\.requested_units\)/);
  assert.match(source, /Number\(row\.chargeable_units\)/);
});
```

- [ ] **Step 2: Run the focused tests and confirm failure**

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/leave/requests/actions.test.ts \
  src/features/leave/requests/queries.test.ts \
  src/features/leave/concurrency.test.ts
```

Expected: FAIL because the lifecycle functions and query adapter do not exist.

- [ ] **Step 3: Add a single internal attendance recalculation hook contract**

Append this temporary contract to the migration before the lifecycle functions. Task 9 replaces the body without changing the signature:

```sql
create or replace function public.recalculate_attendance_for_leave_dates(
  p_request_group_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_request_group_id is null then
    raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_NOT_FOUND';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception using errcode = 'P0001', message = 'LEAVE_RECALCULATION_FAILED';
  end if;
  -- Task 9 replaces this no-op after the attendance calculator becomes leave-aware.
  perform 1;
end;
$$;

revoke all on function public.recalculate_attendance_for_leave_dates(uuid,text)
from public, anon, authenticated;
```

The temporary no-op is acceptable only within Task 8's isolated commit. Task 9 must replace it before Phase 6 can be considered implemented.

- [ ] **Step 4: Add employee withdrawal**

Append:

```sql
create or replace function public.withdraw_leave_request(
  p_request_group_id uuid,
  p_expected_revision_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_group public.leave_request_groups%rowtype;
  v_profile_id uuid;
begin
  v_profile_id := auth.uid();
  if v_profile_id is null then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;

  select * into v_group
  from public.leave_request_groups
  where id = p_request_group_id
  for update;

  if not found or v_group.employee_id <> public.current_employee_id() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;

  if v_group.current_status <> 'pending'
     or v_group.active_revision_id <> p_expected_revision_id then
    raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_STALE';
  end if;

  update public.leave_request_groups
  set current_status = 'withdrawn', updated_at = now()
  where id = v_group.id;

  insert into public.leave_request_actions (
    request_group_id, request_revision_id, action_type,
    from_status, to_status, actor_profile_id, actor_role
  ) values (
    v_group.id, v_group.active_revision_id, 'withdrawn',
    'pending', 'withdrawn', v_profile_id, 'employee'
  );
end;
$$;

revoke all on function public.withdraw_leave_request(uuid,uuid) from public, anon;
grant execute on function public.withdraw_leave_request(uuid,uuid) to authenticated;
```

- [ ] **Step 5: Add atomic approval and rejection**

Append the complete review function:

```sql
create or replace function public.review_leave_request(
  p_request_group_id uuid,
  p_expected_revision_id uuid,
  p_expected_status text,
  p_expected_day_fingerprint text,
  p_expected_chargeable_units numeric,
  p_decision text,
  p_review_text text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_group public.leave_request_groups%rowtype;
  v_revision public.leave_request_revisions%rowtype;
  v_policy public.leave_type_versions%rowtype;
  v_profile_id uuid := auth.uid();
  v_review_text text := public.normalize_leave_private_text(p_review_text, false);
  v_chargeable_units numeric(6,1);
  v_day_fingerprint text;
  v_account_id uuid;
  v_day record;
  v_old_group public.leave_request_groups%rowtype;
begin
  if v_profile_id is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception using errcode = 'P0001', message = 'LEAVE_DECISION_INVALID';
  end if;

  select * into v_group
  from public.leave_request_groups
  where id = p_request_group_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_NOT_FOUND';
  end if;
  if p_expected_status <> 'pending'
     or v_group.current_status <> p_expected_status
     or v_group.active_revision_id <> p_expected_revision_id then
    raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_STALE';
  end if;

  select * into strict v_revision
  from public.leave_request_revisions
  where id = v_group.active_revision_id
  for update;

  select
    coalesce(sum(active_day.chargeable_units), 0),
    encode(
      digest(
        string_agg(
          request_day.active_revision_id::text || ':' || active_day.chargeable_units::text,
          '|' order by request_day.leave_date
        ),
        'sha256'
      ),
      'hex'
    )
  into v_chargeable_units, v_day_fingerprint
  from public.leave_request_days as request_day
  join public.leave_request_day_revisions as active_day
    on active_day.id = request_day.active_revision_id
  where request_day.request_revision_id = v_revision.id;

  if v_chargeable_units <> p_expected_chargeable_units
     or v_chargeable_units <> v_revision.submitted_chargeable_units
     or v_day_fingerprint is distinct from p_expected_day_fingerprint then
    raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_STALE';
  end if;

  if p_decision = 'reject' then
    if v_review_text is null then
      raise exception using errcode = 'P0001', message = 'LEAVE_REASON_REQUIRED';
    end if;

    update public.leave_request_groups
    set current_status = 'rejected', updated_at = now()
    where id = v_group.id;

    insert into public.leave_request_actions (
      request_group_id, request_revision_id, action_type,
      from_status, to_status, actor_profile_id, actor_role,
      action_reason, review_note
    ) values (
      v_group.id, v_revision.id, 'rejected',
      'pending', 'rejected', v_profile_id, 'hr_admin',
      v_review_text, null
    );
    return;
  end if;

  select * into strict v_policy
  from public.leave_type_versions
  where id = v_revision.leave_type_version_id;

  -- Revalidate the current date context under row locks. Any drift requires
  -- reviewer reload instead of silently changing the submitted request.
  for v_day in
    select request_day.id, request_day.leave_date,
           active_day.chargeable_units, active_day.id as active_day_revision_id
    from public.leave_request_days as request_day
    join public.leave_request_day_revisions as active_day
      on active_day.id = request_day.active_revision_id
    where request_day.request_revision_id = v_revision.id
    order by request_day.leave_date
  loop
    if (
      select context.chargeable_units
      from public.resolve_leave_day_context(
        v_group.employee_id,
        v_revision.leave_type_version_id,
        v_day.leave_date,
        v_revision.duration_mode
      ) as context
    ) <> v_day.chargeable_units then
      raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_STALE';
    end if;
  end loop;

  if v_policy.is_balance_tracked then
    perform pg_advisory_xact_lock(
      hashtextextended(
        v_group.employee_id::text || ':' ||
        (select leave_type_id::text from public.leave_type_versions where id = v_policy.id) || ':' ||
        v_revision.leave_year::text,
        0
      )
    );

    v_account_id := public.get_or_create_leave_balance_account(
      v_group.employee_id,
      v_policy.leave_type_id,
      v_revision.leave_year
    );

    if public.get_leave_balance(
      v_account_id,
      v_revision.start_date
    ) < v_chargeable_units then
      raise exception using errcode = 'P0001', message = 'LEAVE_INSUFFICIENT_BALANCE';
    end if;

    for v_day in
      select request_day.id, active_day.id as active_day_revision_id,
             request_day.leave_date, active_day.chargeable_units
      from public.leave_request_days as request_day
      join public.leave_request_day_revisions as active_day
        on active_day.id = request_day.active_revision_id
      where request_day.request_revision_id = v_revision.id
        and active_day.chargeable_units > 0
      order by request_day.leave_date
    loop
      perform public.consume_leave_balance(
        v_account_id,
        v_day.chargeable_units,
        'approved_leave_charge',
        v_day.leave_date,
        v_group.id,
        v_day.active_day_revision_id,
        v_profile_id,
        null,
        jsonb_build_object('source', 'leave_approval')
      );
    end loop;
  end if;

  update public.leave_request_groups
  set current_status = 'approved', updated_at = now()
  where id = v_group.id;

  insert into public.leave_request_actions (
    request_group_id, request_revision_id, action_type,
    from_status, to_status, actor_profile_id, actor_role, review_note
  ) values (
    v_group.id, v_revision.id, 'approved',
    'pending', 'approved', v_profile_id, 'hr_admin', v_review_text
  );

  if v_group.replaces_request_group_id is not null then
    select * into v_old_group
    from public.leave_request_groups
    where id = v_group.replaces_request_group_id
    for update;

    if found and v_old_group.current_status in ('withdrawn', 'cancelled') then
      update public.leave_request_groups
      set current_status = 'superseded',
          superseded_by_request_group_id = v_group.id,
          updated_at = now()
      where id = v_old_group.id;

      insert into public.leave_request_actions (
        request_group_id, request_revision_id, action_type,
        from_status, to_status, actor_profile_id, actor_role
      ) values (
        v_old_group.id, v_old_group.active_revision_id, 'superseded',
        v_old_group.current_status, 'superseded', v_profile_id, 'hr_admin'
      );
    end if;
  end if;

  perform public.recalculate_attendance_for_leave_dates(
    v_group.id,
    'leave_request_approved'
  );
end;
$$;

revoke all on function public.review_leave_request(uuid,uuid,text,text,numeric,text,text)
from public, anon;
grant execute on function public.review_leave_request(uuid,uuid,text,text,numeric,text,text)
to authenticated;
```

Keep the exact `consume_leave_balance` argument order from Task 4. Adjust this call only if Task 4's compiled signature differs; do not introduce a second overload.

- [ ] **Step 6: Add approved-request cancellation**

Append:

```sql
create or replace function public.cancel_approved_leave_request(
  p_request_group_id uuid,
  p_expected_revision_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_group public.leave_request_groups%rowtype;
  v_profile_id uuid := auth.uid();
  v_reason text := public.normalize_leave_private_text(p_reason, false);
  v_charge record;
begin
  if v_profile_id is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  if v_reason is null then
    raise exception using errcode = 'P0001', message = 'LEAVE_REASON_REQUIRED';
  end if;

  select * into v_group
  from public.leave_request_groups
  where id = p_request_group_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_NOT_FOUND';
  end if;
  if v_group.current_status <> 'approved'
     or v_group.active_revision_id <> p_expected_revision_id then
    raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_STALE';
  end if;

  for v_charge in
    select ledger.id
    from public.leave_balance_ledger as ledger
    where ledger.request_group_id = v_group.id
      and ledger.entry_type in ('approved_leave_charge', 'recalculation_charge')
      and not exists (
        select 1
        from public.leave_balance_ledger as restoration
        where restoration.reversal_of_entry_id = ledger.id
      )
    order by ledger.created_at, ledger.id
    for update
  loop
    perform public.restore_leave_charge(
      v_charge.id,
      'cancellation_restoration',
      v_profile_id,
      v_reason
    );
  end loop;

  update public.leave_request_groups
  set current_status = 'cancelled', updated_at = now()
  where id = v_group.id;

  insert into public.leave_request_actions (
    request_group_id, request_revision_id, action_type,
    from_status, to_status, actor_profile_id, actor_role, action_reason
  ) values (
    v_group.id, v_group.active_revision_id, 'cancelled',
    'approved', 'cancelled', v_profile_id, 'hr_admin', v_reason
  );

  perform public.recalculate_attendance_for_leave_dates(
    v_group.id,
    'approved_leave_cancelled'
  );
end;
$$;

revoke all on function public.cancel_approved_leave_request(uuid,uuid,text)
from public, anon;
grant execute on function public.cancel_approved_leave_request(uuid,uuid,text)
to authenticated;
```

- [ ] **Step 7: Harden the existing request query adapter**

Modify `src/features/leave/requests/queries.ts` to replace the Task 5 direct casts with explicit row mapping. Add these imports alongside `createClient`:

```ts
import { mapLeaveBalance, type LeaveBalanceProjectionRow } from "../balances/queries";
import type {
  LeaveClassification,
  LeaveDurationMode,
  LeaveRequestDetail,
  LeaveRequestListItem,
  LeaveRequestStatus,
} from "../types";
```

Then add:

```ts
interface RequestListRow {
  request_group_id: string;
  employee_id: string;
  employee_name: string;
  employee_number: string | null;
  department_name: string | null;
  leave_type_name: string;
  is_paid: boolean;
  is_balance_tracked: boolean;
  start_date: string;
  end_date: string;
  duration_mode: LeaveDurationMode;
  status: LeaveRequestStatus;
  requested_units: string | number;
  chargeable_units: string | number;
  submitted_at: string | null;
  reviewed_at: string | null;
  replaces_request_group_id: string | null;
  superseded_by_request_group_id: string | null;
  total_count: number;
}

function mapRequestListRow(row: RequestListRow): LeaveRequestListItem {
  return {
    requestGroupId: row.request_group_id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    employeeNumber: row.employee_number,
    departmentName: row.department_name,
    leaveTypeName: row.leave_type_name,
    isPaid: row.is_paid,
    isBalanceTracked: row.is_balance_tracked,
    startDate: row.start_date,
    endDate: row.end_date,
    durationMode: row.duration_mode,
    status: row.status,
    requestedUnits: Number(row.requested_units),
    chargeableUnits: Number(row.chargeable_units),
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    replacesRequestGroupId: row.replaces_request_group_id,
    supersededByRequestGroupId: row.superseded_by_request_group_id,
  };
}
```

Update `getMyLeaveRequests` and `getAdminLeaveRequests` to map every row through `mapRequestListRow` and derive total from the raw first row before mapping.

Add an explicit detail mapper:

```ts
export function mapLeaveRequestDetail(row: Record<string, unknown>): LeaveRequestDetail {
  const summary = row.summary as Record<string, unknown>;
  return {
    requestGroupId: String(summary.request_group_id),
    activeRevisionId: String(summary.active_revision_id),
    employeeId: String(summary.employee_id),
    employeeName: String(summary.employee_name),
    employeeNumber: summary.employee_number ? String(summary.employee_number) : null,
    departmentName: summary.department_name ? String(summary.department_name) : null,
    leaveTypeId: String(summary.leave_type_id),
    leaveTypeVersionId: String(summary.leave_type_version_id),
    leaveTypeName: String(summary.leave_type_name),
    isPaid: Boolean(summary.is_paid),
    isBalanceTracked: Boolean(summary.is_balance_tracked),
    leaveYear: Number(summary.leave_year),
    startDate: String(summary.start_date),
    endDate: String(summary.end_date),
    durationMode: summary.duration_mode as LeaveDurationMode,
    status: summary.status as LeaveRequestStatus,
    employeeNote: summary.employee_note ? String(summary.employee_note) : null,
    requestedUnits: Number(summary.requested_units),
    chargeableUnits: Number(row.current_chargeable_units),
    submittedAt: summary.submitted_at ? String(summary.submitted_at) : null,
    reviewedAt: summary.reviewed_at ? String(summary.reviewed_at) : null,
    otherPendingReservedUnits: Number(row.other_pending_reserved_units),
    dayFingerprint: String(row.day_fingerprint),
    days: ((row.days ?? []) as Record<string, unknown>[]).map((day) => ({
      requestDayId: String(day.request_day_id),
      activeDayRevisionId: String(day.active_day_revision_id),
      leaveDate: String(day.leave_date),
      scheduleName: day.schedule_name ? String(day.schedule_name) : null,
      classification: day.leave_classification as LeaveClassification,
      chargeableUnits: Number(day.chargeable_units),
      isHoliday: Boolean(day.is_holiday),
      isRestDay: Boolean(day.is_rest_day),
      conflictState: day.conflict_state ? String(day.conflict_state) : null,
    })),
    actions: ((row.actions ?? []) as Record<string, unknown>[]).map((action) => ({
      id: String(action.id),
      actionType: String(action.action_type),
      fromStatus: action.from_status ? action.from_status as LeaveRequestStatus : null,
      toStatus: action.to_status as LeaveRequestStatus,
      actorName: action.actor_name ? String(action.actor_name) : null,
      createdAt: String(action.created_at),
      privateText: action.private_text ? String(action.private_text) : null,
    })),
    attachments: ((row.attachments ?? []) as Record<string, unknown>[]).map((attachment) => ({
      id: String(attachment.id),
      requestGroupId: String(attachment.request_group_id),
      requestRevisionId: String(attachment.request_revision_id),
      originalFilename: String(attachment.original_filename),
      mimeType: String(attachment.mime_type),
      sizeBytes: Number(attachment.size_bytes),
      uploadedAt: String(attachment.uploaded_at),
      frozenAt: attachment.frozen_at ? String(attachment.frozen_at) : null,
    })),
    balance: row.balance
      ? mapLeaveBalance(row.balance as LeaveBalanceProjectionRow)
      : null,
    replacesRequestGroupId: summary.replaces_request_group_id
      ? String(summary.replaces_request_group_id)
      : null,
    supersededByRequestGroupId: summary.superseded_by_request_group_id
      ? String(summary.superseded_by_request_group_id)
      : null,
  };
}
```

Update `getLeaveRequestDetail` to return `mapLeaveRequestDetail(data as Record<string, unknown>)`. Keep the existing `createClient()` ownership and the Task 5 RPC parameter names; do not introduce a second query API that accepts a Supabase client.

- [ ] **Step 8: Run focused tests and the complete suite**

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/leave/requests/actions.test.ts \
  src/features/leave/requests/queries.test.ts \
  src/features/leave/concurrency.test.ts
npm test
```

Expected: all focused tests pass and the complete suite has zero failures.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/202607160001_leave_management.sql \
  src/features/leave/requests/actions.test.ts \
  src/features/leave/requests/queries.ts \
  src/features/leave/requests/queries.test.ts \
  src/features/leave/concurrency.test.ts
git commit -m "feat: add leave request review lifecycle"
```

## Task 9: Leave-aware attendance classification and automatic conflict handling

**Files:**
- Modify: `supabase/migrations/202607160001_leave_management.sql`
- Modify: `src/features/attendance/calculations/types.ts`
- Modify: `src/features/attendance/calculations/presentation.ts`
- Modify: `src/features/attendance/calculations/presentation.test.ts`
- Create: `src/features/leave/attendance-integration.test.ts`
- Create: `src/features/leave/conflicts/queries.ts`
- Create: `src/features/leave/conflicts/queries.test.ts`

**Interfaces:**
- Consumes: existing `calculate_attendance_day_internal`, attendance calculation revision tables, approved active leave-day revisions, `restore_leave_charge`, and immutable conflict records.
- Produces: `paid_leave` and `unpaid_leave` attendance statuses, leave-adjusted late/undertime windows, `recalculate_attendance_for_leave_dates`, conflict generation, automatic full-day release on completed attendance, and `get_leave_attendance_conflicts`.

- [ ] **Step 1: Write attendance integration tests**

Create `src/features/leave/attendance-integration.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../../../supabase/migrations/202607160001_leave_management.sql", import.meta.url),
  "utf8",
);

function body(name: string) {
  const match = migration.match(
    new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`, "i"),
  );
  assert.ok(match, `${name} must exist`);
  return match[0];
}

test("attendance calculator resolves approved active leave", () => {
  const source = body("calculate_attendance_day_internal");
  assert.match(source, /leave_request_groups/i);
  assert.match(source, /current_status = 'approved'/i);
  assert.match(source, /paid_leave/i);
  assert.match(source, /unpaid_leave/i);
});

test("holiday and rest-day precedence remains before leave classification", () => {
  const source = body("calculate_attendance_day_internal");
  const holiday = source.indexOf("holiday");
  const paidLeave = source.indexOf("paid_leave");
  assert.ok(holiday >= 0 && paidLeave >= 0 && holiday < paidLeave);
});

test("completed full-day attendance creates conflict and releases the charge", () => {
  const source = body("apply_leave_attendance_effects");
  assert.match(source, /full_day_completed_attendance/i);
  assert.match(source, /attendance_conflict_release/i);
  assert.match(source, /restore_leave_charge/i);
});

test("incomplete full-day attendance keeps the charge", () => {
  const source = body("apply_leave_attendance_effects");
  const branch = source.split(/full_day_incomplete_attendance/i)[1] ?? "";
  assert.doesNotMatch(branch.split(/half_day_covered_time_overlap/i)[0] ?? "", /restore_leave_charge/i);
});

test("half-day overlap creates a conflict without automatic release", () => {
  const source = body("apply_leave_attendance_effects");
  const branch = source.split(/half_day_covered_time_overlap/i)[1] ?? "";
  assert.doesNotMatch(branch, /attendance_conflict_release/i);
});

test("leave date recalculation calls attendance calculation for every date", () => {
  const source = body("recalculate_attendance_for_leave_dates");
  assert.match(source, /calculate_attendance_day_internal/i);
  assert.match(source, /apply_leave_attendance_effects/i);
});
```

Append to `src/features/attendance/calculations/presentation.test.ts`:

```ts
test("presents paid and unpaid leave statuses", () => {
  assert.equal(attendanceStatusLabel("paid_leave"), "Paid leave");
  assert.equal(attendanceStatusLabel("unpaid_leave"), "Unpaid leave");
});
```

Create `src/features/leave/conflicts/queries.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./queries.ts", import.meta.url), "utf8");

test("conflict query uses HR-only projection RPC", () => {
  assert.match(source, /get_leave_attendance_conflicts/);
  assert.doesNotMatch(source, /from\("leave_attendance_conflicts"\)/);
});
```

- [ ] **Step 2: Run focused tests and verify failure**

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/leave/attendance-integration.test.ts \
  src/features/leave/conflicts/queries.test.ts \
  src/features/attendance/calculations/presentation.test.ts
```

Expected: FAIL because the attendance calculator is not leave-aware and the query module is absent.

- [ ] **Step 3: Extend the TypeScript status contract and presentation**

Modify `src/features/attendance/calculations/types.ts` so the authoritative union includes:

```ts
export type AttendanceBaseStatus =
  | "present"
  | "absent"
  | "missing_clock_out"
  | "rest_day"
  | "rest_day_worked"
  | "unscheduled_attendance"
  | "holiday"
  | "paid_leave"
  | "unpaid_leave";
```

Modify `src/features/attendance/calculations/presentation.ts`:

```ts
const attendanceStatusLabels: Record<AttendanceBaseStatus, string> = {
  present: "Present",
  absent: "Absent",
  missing_clock_out: "Missing clock-out",
  rest_day: "Rest day",
  rest_day_worked: "Rest-day work",
  unscheduled_attendance: "Unscheduled attendance",
  holiday: "Holiday",
  paid_leave: "Paid leave",
  unpaid_leave: "Unpaid leave",
};

export function attendanceStatusLabel(status: AttendanceBaseStatus) {
  return attendanceStatusLabels[status];
}
```

Preserve any existing exported helpers and existing labels exactly.

- [ ] **Step 4: Add approved-leave resolver and conflict upsert**

Append to the migration:

```sql
create or replace function public.get_approved_leave_day(
  p_employee_id uuid,
  p_work_date date
)
returns table (
  request_group_id uuid,
  request_revision_id uuid,
  request_day_id uuid,
  leave_day_revision_id uuid,
  duration_mode text,
  is_paid boolean,
  is_balance_tracked boolean,
  chargeable_units numeric,
  half_day_boundary_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    request_group.id,
    request_revision.id,
    request_day.id,
    day_revision.id,
    request_revision.duration_mode,
    policy.is_paid,
    policy.is_balance_tracked,
    day_revision.chargeable_units,
    day_revision.half_day_boundary_at
  from public.leave_request_groups as request_group
  join public.leave_request_revisions as request_revision
    on request_revision.id = request_group.active_revision_id
  join public.leave_type_versions as policy
    on policy.id = request_revision.leave_type_version_id
  join public.leave_request_days as request_day
    on request_day.request_revision_id = request_revision.id
   and request_day.leave_date = p_work_date
  join public.leave_request_day_revisions as day_revision
    on day_revision.id = request_day.active_revision_id
  where request_group.employee_id = p_employee_id
    and request_group.current_status = 'approved'
    and day_revision.chargeable_units > 0
  order by request_group.created_at desc
  limit 1
$$;

revoke all on function public.get_approved_leave_day(uuid,date)
from public, anon, authenticated;

create or replace function public.upsert_leave_attendance_conflict(
  p_employee_id uuid,
  p_request_group_id uuid,
  p_request_day_id uuid,
  p_leave_day_revision_id uuid,
  p_attendance_calculation_revision_id uuid,
  p_conflict_type text,
  p_automatic_balance_action text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
begin
  update public.leave_attendance_conflicts
  set status = 'superseded'
  where request_day_id = p_request_day_id
    and status = 'open'
    and conflict_type <> p_conflict_type;

  select id into v_id
  from public.leave_attendance_conflicts
  where request_day_id = p_request_day_id
    and leave_day_revision_id = p_leave_day_revision_id
    and attendance_calculation_revision_id is not distinct from p_attendance_calculation_revision_id
    and conflict_type = p_conflict_type
    and status = 'open';

  if v_id is null then
    insert into public.leave_attendance_conflicts (
      employee_id, request_group_id, request_day_id,
      leave_day_revision_id, attendance_calculation_revision_id,
      conflict_type, automatic_balance_action
    ) values (
      p_employee_id, p_request_group_id, p_request_day_id,
      p_leave_day_revision_id, p_attendance_calculation_revision_id,
      p_conflict_type, p_automatic_balance_action
    ) returning id into v_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.upsert_leave_attendance_conflict(uuid,uuid,uuid,uuid,uuid,text,text)
from public, anon, authenticated;
```

Add a unique partial index to prevent duplicate open conflicts:

```sql
create unique index if not exists leave_conflicts_open_identity_idx
on public.leave_attendance_conflicts (
  request_day_id,
  leave_day_revision_id,
  coalesce(attendance_calculation_revision_id, '00000000-0000-0000-0000-000000000000'::uuid),
  conflict_type
)
where status = 'open';
```

- [ ] **Step 5: Replace the attendance calculation function with a leave-aware version**

Use `create or replace function public.calculate_attendance_day_internal(...)` with the exact current Phase 5C signature. Copy the complete existing body from `202607150005_fix_employee_attendance_summary_ambiguity.sql`, then make only these changes:

```sql
-- Declare:
v_leave record;
v_effective_scheduled_start timestamptz;
v_effective_scheduled_end timestamptz;

-- Resolve after holiday/rest-day context and before absence/late/undertime:
select * into v_leave
from public.get_approved_leave_day(p_employee_id, p_work_date);

-- Preserve holiday and rest-day precedence.
if v_is_holiday then
  -- Keep the existing holiday/holiday-work branch unchanged.
elsif v_is_rest_day then
  -- Keep the existing rest-day/rest-day-worked branch unchanged.
elsif v_leave.request_group_id is not null
      and v_leave.duration_mode = 'full_day'
      and v_first_clock_in is null then
  v_base_status := case when v_leave.is_paid then 'paid_leave' else 'unpaid_leave' end;
  v_late_minutes := 0;
  v_undertime_minutes := 0;
  v_overtime_minutes := 0;
elsif v_leave.request_group_id is not null
      and v_leave.duration_mode = 'first_half' then
  v_effective_scheduled_start := v_leave.half_day_boundary_at;
  v_effective_scheduled_end := v_scheduled_end;
  -- Run existing late/undertime calculations against these effective bounds.
elsif v_leave.request_group_id is not null
      and v_leave.duration_mode = 'second_half' then
  v_effective_scheduled_start := v_scheduled_start;
  v_effective_scheduled_end := v_leave.half_day_boundary_at;
  -- Run existing late/undertime calculations against these effective bounds.
else
  -- Existing Phase 5C classification.
end if;
```

Overtime remains based on the original schedule boundaries, not the half-day effective bounds. The SQL must preserve all current inputs, return columns, holiday behavior, overtime-policy logic, and attendance revision insertion. Add `paid_leave` and `unpaid_leave` to every database status check constraint that validates `base_status`.

- [ ] **Step 6: Add post-calculation conflict and balance behavior**

Append:

```sql
create or replace function public.apply_leave_attendance_effects(
  p_employee_id uuid,
  p_work_date date,
  p_attendance_calculation_revision_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_leave record;
  v_revision public.attendance_calculation_revisions%rowtype;
  v_attendance public.attendance_days%rowtype;
  v_charge record;
  v_overlap boolean := false;
begin
  select * into v_leave
  from public.get_approved_leave_day(p_employee_id, p_work_date);
  if v_leave.request_group_id is null then
    return;
  end if;

  select * into strict v_revision
  from public.attendance_calculation_revisions
  where id = p_attendance_calculation_revision_id;

  select * into v_attendance
  from public.attendance_days
  where employee_id = p_employee_id and work_date = p_work_date;

  if v_leave.duration_mode = 'full_day'
     and v_attendance.clock_in_at is not null
     and v_attendance.clock_out_at is not null then
    perform public.upsert_leave_attendance_conflict(
      p_employee_id, v_leave.request_group_id, v_leave.request_day_id,
      v_leave.leave_day_revision_id, p_attendance_calculation_revision_id,
      'full_day_completed_attendance', 'released_full_day_charge'
    );

    for v_charge in
      select ledger.id
      from public.leave_balance_ledger as ledger
      where ledger.request_group_id = v_leave.request_group_id
        and ledger.request_day_revision_id = v_leave.leave_day_revision_id
        and ledger.entry_type in ('approved_leave_charge', 'recalculation_charge')
        and not exists (
          select 1 from public.leave_balance_ledger as release
          where release.reversal_of_entry_id = ledger.id
            and release.entry_type in ('attendance_conflict_release','recalculation_release','cancellation_restoration')
        )
      for update
    loop
      perform public.restore_leave_charge(
        v_charge.id,
        'attendance_conflict_release',
        auth.uid(),
        null
      );
    end loop;

  elsif v_leave.duration_mode = 'full_day'
        and v_attendance.clock_in_at is not null
        and v_attendance.clock_out_at is null then
    perform public.upsert_leave_attendance_conflict(
      p_employee_id, v_leave.request_group_id, v_leave.request_day_id,
      v_leave.leave_day_revision_id, p_attendance_calculation_revision_id,
      'full_day_incomplete_attendance', 'charge_retained'
    );

  elsif v_leave.duration_mode in ('first_half','second_half')
        and v_attendance.clock_in_at is not null then
    v_overlap := case
      when v_leave.duration_mode = 'first_half'
        then v_attendance.clock_in_at < v_leave.half_day_boundary_at
      when v_attendance.clock_out_at is null
        then false
      else v_attendance.clock_out_at > v_leave.half_day_boundary_at
    end;

    if v_overlap then
      perform public.upsert_leave_attendance_conflict(
        p_employee_id, v_leave.request_group_id, v_leave.request_day_id,
        v_leave.leave_day_revision_id, p_attendance_calculation_revision_id,
        'half_day_covered_time_overlap', 'charge_retained'
      );
    end if;
  end if;
end;
$$;

revoke all on function public.apply_leave_attendance_effects(uuid,date,uuid)
from public, anon, authenticated;
```

Use the actual attendance table field names from the Phase 5C schema. Do not guess `clock_in_at` or `clock_out_at`; map the branch to the existing `first_clock_in_at` and `last_clock_out_at` columns if those are the current names.

- [ ] **Step 7: Replace the Task 8 no-op recalculation hook**

Replace `recalculate_attendance_for_leave_dates` with:

```sql
create or replace function public.recalculate_attendance_for_leave_dates(
  p_request_group_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_group public.leave_request_groups%rowtype;
  v_day record;
  v_calculation_revision_id uuid;
begin
  select * into v_group
  from public.leave_request_groups
  where id = p_request_group_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_NOT_FOUND';
  end if;

  for v_day in
    select request_day.leave_date
    from public.leave_request_days as request_day
    where request_day.request_revision_id = v_group.active_revision_id
    order by request_day.leave_date
  loop
    select public.calculate_attendance_day_internal(
      v_group.employee_id,
      v_day.leave_date,
      null,
      coalesce(nullif(btrim(p_reason), ''), 'leave_recalculation')
    ) into v_calculation_revision_id;

    perform public.apply_leave_attendance_effects(
      v_group.employee_id,
      v_day.leave_date,
      v_calculation_revision_id
    );
  end loop;
exception
  when others then
    raise exception using
      errcode = 'P0001',
      message = case
        when sqlerrm like 'LEAVE_%' then sqlerrm
        else 'LEAVE_RECALCULATION_FAILED'
      end;
end;
$$;

revoke all on function public.recalculate_attendance_for_leave_dates(uuid,text)
from public, anon, authenticated;
```

Call `calculate_attendance_day_internal` with the exact Phase 5C signature. The final migration must compile with exactly one matching overload for this signature.

- [ ] **Step 8: Add the HR conflict projection and query adapter**

Append the protected SQL projection:

```sql
create or replace function public.get_leave_attendance_conflicts(
  p_status text default 'open',
  p_conflict_type text default null,
  p_employee_id uuid default null,
  p_offset integer default 0,
  p_limit integer default 50
)
returns table (
  conflict_id uuid,
  conflict_type text,
  conflict_status text,
  employee_id uuid,
  employee_name text,
  employee_number text,
  leave_type_name text,
  leave_date date,
  duration_mode text,
  chargeable_units numeric,
  attendance_base_status text,
  automatic_balance_action text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;

  return query
  select
    conflict.id,
    conflict.conflict_type,
    conflict.status,
    employee.id,
    concat_ws(' ', employee.first_name, employee.last_name),
    employee.employee_number,
    leave_type.name,
    request_day.leave_date,
    request_revision.duration_mode,
    leave_day.chargeable_units,
    attendance_revision.base_status,
    conflict.automatic_balance_action,
    conflict.created_at,
    count(*) over ()
  from public.leave_attendance_conflicts as conflict
  join public.employees as employee on employee.id = conflict.employee_id
  join public.leave_request_groups as request_group on request_group.id = conflict.request_group_id
  join public.leave_request_revisions as request_revision on request_revision.id = request_group.active_revision_id
  join public.leave_type_versions as leave_type on leave_type.id = request_revision.leave_type_version_id
  join public.leave_request_days as request_day on request_day.id = conflict.request_day_id
  join public.leave_request_day_revisions as leave_day on leave_day.id = conflict.leave_day_revision_id
  left join public.attendance_calculation_revisions as attendance_revision
    on attendance_revision.id = conflict.attendance_calculation_revision_id
  where (p_status is null or conflict.status = p_status)
    and (p_conflict_type is null or conflict.conflict_type = p_conflict_type)
    and (p_employee_id is null or conflict.employee_id = p_employee_id)
  order by conflict.created_at desc, conflict.id
  offset greatest(p_offset, 0)
  limit least(greatest(p_limit, 1), 100);
end;
$$;

revoke all on function public.get_leave_attendance_conflicts(text,text,uuid,integer,integer)
from public, anon;
grant execute on function public.get_leave_attendance_conflicts(text,text,uuid,integer,integer)
to authenticated;
```

Create `src/features/leave/conflicts/queries.ts`:

```ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeaveAttendanceConflict, LeaveConflictType } from "../types";

export async function getLeaveAttendanceConflicts(
  client: SupabaseClient,
  filters: {
    status?: "open" | "resolved" | "superseded";
    conflictType?: LeaveConflictType;
    employeeId?: string;
    page: number;
    pageSize: number;
  },
): Promise<{ rows: LeaveAttendanceConflict[]; total: number }> {
  const { data, error } = await client.rpc("get_leave_attendance_conflicts", {
    p_status: filters.status ?? "open",
    p_conflict_type: filters.conflictType ?? null,
    p_employee_id: filters.employeeId ?? null,
    p_offset: (filters.page - 1) * filters.pageSize,
    p_limit: filters.pageSize,
  });
  if (error) throw error;
  const rows = data ?? [];
  return {
    rows: rows.map((row: Record<string, unknown>) => ({
      conflictId: String(row.conflict_id),
      conflictType: row.conflict_type as LeaveConflictType,
      status: row.conflict_status as LeaveAttendanceConflict["status"],
      employeeId: String(row.employee_id),
      employeeName: String(row.employee_name),
      employeeNumber: row.employee_number ? String(row.employee_number) : null,
      leaveTypeName: String(row.leave_type_name),
      leaveDate: String(row.leave_date),
      durationMode: row.duration_mode as LeaveAttendanceConflict["durationMode"],
      chargeableUnits: Number(row.chargeable_units),
      attendanceBaseStatus: row.attendance_base_status ? String(row.attendance_base_status) : null,
      automaticBalanceAction: row.automatic_balance_action ? String(row.automatic_balance_action) : null,
      createdAt: String(row.created_at),
    })),
    total: Number(rows[0]?.total_count ?? 0),
  };
}
```

- [ ] **Step 9: Add conflict-resolution metadata workflow**

Append:

```sql
create or replace function public.resolve_leave_attendance_conflict(
  p_conflict_id uuid,
  p_resolution_type text,
  p_private_resolution_note text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_conflict public.leave_attendance_conflicts%rowtype;
  v_note text := public.normalize_leave_private_text(p_private_resolution_note, false);
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  if p_resolution_type not in (
    'reviewed_no_change',
    'leave_cancelled',
    'attendance_corrected',
    'replacement_requested'
  ) then
    raise exception using errcode = 'P0001', message = 'LEAVE_CONFLICT_RESOLUTION_INVALID';
  end if;

  select * into v_conflict
  from public.leave_attendance_conflicts
  where id = p_conflict_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'LEAVE_CONFLICT_NOT_FOUND';
  end if;
  if v_conflict.status <> 'open' then
    raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_STALE';
  end if;

  update public.leave_attendance_conflicts
  set status = 'resolved',
      resolved_by = v_actor,
      resolved_at = now(),
      resolution_type = p_resolution_type,
      private_resolution_note = v_note
  where id = v_conflict.id;

  perform public.write_leave_audit(
    v_conflict.employee_id,
    'leave_conflict.resolved',
    'leave_attendance_conflict',
    v_conflict.id,
    jsonb_build_object(
      'conflict_type', v_conflict.conflict_type,
      'resolution_type', p_resolution_type,
      'request_group_id', v_conflict.request_group_id
    )
  );
end;
$$;

revoke all on function public.resolve_leave_attendance_conflict(uuid,text,text)
from public, anon;
grant execute on function public.resolve_leave_attendance_conflict(uuid,text,text)
to authenticated;
```

Resolution changes only conflict metadata. The dedicated attendance correction, approved-leave cancellation, or replacement workflow must perform operational changes before HR records the corresponding resolution.

- [ ] **Step 10: Run focused and full verification**

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/leave/attendance-integration.test.ts \
  src/features/leave/conflicts/queries.test.ts \
  src/features/attendance/calculations/presentation.test.ts
npm test
```

Expected: all focused tests pass and the full suite has zero failures.

- [ ] **Step 11: Commit**

```bash
git add supabase/migrations/202607160001_leave_management.sql \
  src/features/attendance/calculations/types.ts \
  src/features/attendance/calculations/presentation.ts \
  src/features/attendance/calculations/presentation.test.ts \
  src/features/leave/attendance-integration.test.ts \
  src/features/leave/conflicts/queries.ts \
  src/features/leave/conflicts/queries.test.ts
git commit -m "feat: integrate approved leave with attendance"
```

## Task 10: Schedule and holiday driven leave recalculation

**Files:**
- Modify: `supabase/migrations/202607160001_leave_management.sql`
- Create: `src/features/leave/recalculation.test.ts`
- Modify: `src/features/leave/concurrency.test.ts`

**Interfaces:**
- Consumes: `resolve_leave_day_context`, approved request-day revisions, `consume_leave_balance`, `restore_leave_charge`, `recalculate_attendance_for_leave_dates`, current schedule assignments, and active holiday versions.
- Produces: `recalculate_leave_request_dates`, employee/date-range recalculation helpers, and automatic schedule/holiday triggers that either commit the complete balance-and-attendance change or record an HR conflict.

- [ ] **Step 1: Write failing recalculation tests**

Create `src/features/leave/recalculation.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../../../supabase/migrations/202607160001_leave_management.sql", import.meta.url),
  "utf8",
);

function body(name: string) {
  const match = migration.match(
    new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`, "i"),
  );
  assert.ok(match, `${name} must exist`);
  return match[0];
}

test("approved leave date recalculation appends revisions", () => {
  const source = body("recalculate_leave_request_dates");
  assert.match(source, /insert into public\.leave_request_day_revisions/i);
  assert.match(source, /update public\.leave_request_days/i);
  assert.doesNotMatch(source, /update public\.leave_request_day_revisions/i);
});

test("nonchargeable replacement restores the original charge", () => {
  const source = body("recalculate_leave_request_dates");
  assert.match(source, /recalculation_release/i);
  assert.match(source, /restore_leave_charge/i);
});

test("new chargeable workday checks balance before charging", () => {
  const source = body("recalculate_leave_request_dates");
  assert.match(source, /get_leave_balance/i);
  assert.match(source, /insufficient_balance_after_recalculation/i);
  assert.match(source, /consume_leave_balance/i);
});

test("schedule assignment and holiday activation trigger leave recalculation", () => {
  assert.match(migration, /trigger_leave_recalculation_for_schedule/i);
  assert.match(migration, /trigger_leave_recalculation_for_holiday/i);
  assert.match(migration, /after insert or update on public\.employee_schedule_assignments/i);
  assert.match(migration, /after insert or update of active_version_id on public\.holiday_calendar_groups/i);
});

test("recalculation serializes by employee leave type and year", () => {
  const source = body("recalculate_leave_request_dates");
  assert.match(source, /pg_advisory_xact_lock/i);
  assert.match(source, /for update/i);
});
```

Append to `src/features/leave/concurrency.test.ts`:

```ts
test("schedule and holiday recalculation cannot race approval", () => {
  const review = functionBody("review_leave_request");
  const recalc = functionBody("recalculate_leave_request_dates");
  assert.match(review, /pg_advisory_xact_lock/i);
  assert.match(recalc, /pg_advisory_xact_lock/i);
  assert.match(review, /for update/i);
  assert.match(recalc, /for update/i);
});
```

- [ ] **Step 2: Run tests and verify failure**

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/leave/recalculation.test.ts \
  src/features/leave/concurrency.test.ts
```

Expected: FAIL because the recalculation RPC and triggers do not exist.

- [ ] **Step 3: Add request-date recalculation**

Append:

```sql
create or replace function public.recalculate_leave_request_dates(
  p_request_group_id uuid,
  p_source text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_group public.leave_request_groups%rowtype;
  v_revision public.leave_request_revisions%rowtype;
  v_policy public.leave_type_versions%rowtype;
  v_day public.leave_request_days%rowtype;
  v_old public.leave_request_day_revisions%rowtype;
  v_context record;
  v_new_revision_id uuid;
  v_revision_number integer;
  v_charge record;
  v_account_id uuid;
  v_available numeric(6,1);
  v_conflict_type text;
begin
  if p_source not in ('schedule_recalculation','holiday_recalculation','attendance_recalculation') then
    raise exception using errcode = 'P0001', message = 'LEAVE_RECALCULATION_FAILED';
  end if;

  select * into v_group
  from public.leave_request_groups
  where id = p_request_group_id
  for update;
  if not found or v_group.current_status <> 'approved' then
    return;
  end if;

  select * into strict v_revision
  from public.leave_request_revisions
  where id = v_group.active_revision_id;
  select * into strict v_policy
  from public.leave_type_versions
  where id = v_revision.leave_type_version_id;

  perform pg_advisory_xact_lock(
    hashtextextended(
      v_group.employee_id::text || ':' || v_policy.leave_type_id::text || ':' || v_revision.leave_year::text,
      0
    )
  );

  for v_day in
    select *
    from public.leave_request_days
    where request_revision_id = v_revision.id
    order by leave_date
    for update
  loop
    select * into strict v_old
    from public.leave_request_day_revisions
    where id = v_day.active_revision_id;

    select * into v_context
    from public.resolve_leave_day_context(
      v_group.employee_id,
      v_revision.leave_type_version_id,
      v_day.leave_date,
      v_revision.duration_mode
    );

    if v_context.chargeable_units = v_old.chargeable_units
       and v_context.leave_classification = v_old.leave_classification
       and v_context.schedule_assignment_id is not distinct from v_old.schedule_assignment_id
       and v_context.schedule_version_id is not distinct from v_old.schedule_version_id
       and v_context.holiday_version_id is not distinct from v_old.holiday_version_id then
      continue;
    end if;

    if v_context.chargeable_units > v_old.chargeable_units and v_policy.is_balance_tracked then
      v_account_id := public.get_or_create_leave_balance_account(
        v_group.employee_id,
        v_policy.leave_type_id,
        v_revision.leave_year
      );
      v_available := public.get_leave_balance(
        v_account_id,
        v_day.leave_date
      );
      if v_available < (v_context.chargeable_units - v_old.chargeable_units) then
        v_conflict_type := 'insufficient_balance_after_recalculation';
        perform public.upsert_leave_attendance_conflict(
          v_group.employee_id,
          v_group.id,
          v_day.id,
          v_old.id,
          v_old.attendance_calculation_revision_id,
          v_conflict_type,
          'charge_not_applied'
        );
        continue;
      end if;
    end if;

    select coalesce(max(revision_number), 0) + 1
    into v_revision_number
    from public.leave_request_day_revisions
    where request_day_id = v_day.id;

    insert into public.leave_request_day_revisions (
      request_day_id, revision_number,
      schedule_assignment_id, schedule_version_id, holiday_version_id,
      attendance_calculation_revision_id,
      is_scheduled_workday, is_rest_day, is_holiday, is_chargeable,
      chargeable_units, leave_classification, half_day_boundary_at,
      conflict_state, calculation_source, calculated_by,
      recalculation_reason
    ) values (
      v_day.id, v_revision_number,
      v_context.schedule_assignment_id, v_context.schedule_version_id, v_context.holiday_version_id,
      v_old.attendance_calculation_revision_id,
      v_context.is_scheduled_workday, v_context.is_rest_day, v_context.is_holiday,
      v_context.chargeable_units > 0,
      v_context.chargeable_units, v_context.leave_classification,
      v_context.half_day_boundary_at,
      null, p_source, auth.uid(),
      public.normalize_leave_private_text(p_reason, false)
    ) returning id into v_new_revision_id;

    update public.leave_request_days
    set active_revision_id = v_new_revision_id
    where id = v_day.id;

    if v_policy.is_balance_tracked and v_context.chargeable_units < v_old.chargeable_units then
      for v_charge in
        select ledger.id
        from public.leave_balance_ledger as ledger
        where ledger.request_group_id = v_group.id
          and ledger.request_day_revision_id = v_old.id
          and ledger.entry_type in ('approved_leave_charge','recalculation_charge')
          and not exists (
            select 1 from public.leave_balance_ledger as reversal
            where reversal.reversal_of_entry_id = ledger.id
          )
        for update
      loop
        perform public.restore_leave_charge(
          v_charge.id,
          'recalculation_release',
          auth.uid(),
          public.normalize_leave_private_text(p_reason, false)
        );
      end loop;
    elsif v_policy.is_balance_tracked and v_context.chargeable_units > v_old.chargeable_units then
      if v_account_id is null then
        v_account_id := public.get_or_create_leave_balance_account(
          v_group.employee_id,
          v_policy.leave_type_id,
          v_revision.leave_year
        );
      end if;
      perform public.consume_leave_balance(
        v_account_id,
        v_context.chargeable_units - v_old.chargeable_units,
        'recalculation_charge',
        v_day.leave_date,
        v_group.id,
        v_new_revision_id,
        auth.uid(),
        public.normalize_leave_private_text(p_reason, false),
        jsonb_build_object('source', p_source)
      );
    end if;
  end loop;

  perform public.recalculate_attendance_for_leave_dates(
    v_group.id,
    p_source
  );
exception
  when others then
    if sqlerrm like 'LEAVE_%' then
      raise;
    end if;
    raise exception using errcode = 'P0001', message = 'LEAVE_RECALCULATION_FAILED';
end;
$$;

revoke all on function public.recalculate_leave_request_dates(uuid,text,text)
from public, anon, authenticated;
```

- [ ] **Step 4: Add employee/date and holiday-date recalculation helpers**

Append:

```sql
create or replace function public.recalculate_approved_leave_for_employee_range(
  p_employee_id uuid,
  p_date_from date,
  p_date_to date,
  p_source text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request_group_id uuid;
begin
  for v_request_group_id in
    select distinct request_group.id
    from public.leave_request_groups as request_group
    join public.leave_request_revisions as request_revision
      on request_revision.id = request_group.active_revision_id
    where request_group.employee_id = p_employee_id
      and request_group.current_status = 'approved'
      and daterange(request_revision.start_date, request_revision.end_date, '[]')
          && daterange(p_date_from, coalesce(p_date_to, 'infinity'::date), '[]')
    order by request_group.id
  loop
    perform public.recalculate_leave_request_dates(
      v_request_group_id, p_source, p_reason
    );
  end loop;
end;
$$;

create or replace function public.recalculate_approved_leave_for_holiday_date(
  p_holiday_date date,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request_group_id uuid;
begin
  for v_request_group_id in
    select distinct request_group.id
    from public.leave_request_groups as request_group
    join public.leave_request_revisions as request_revision
      on request_revision.id = request_group.active_revision_id
    where request_group.current_status = 'approved'
      and p_holiday_date between request_revision.start_date and request_revision.end_date
    order by request_group.id
  loop
    perform public.recalculate_leave_request_dates(
      v_request_group_id, 'holiday_recalculation', p_reason
    );
  end loop;
end;
$$;

revoke all on function public.recalculate_approved_leave_for_employee_range(uuid,date,date,text,text)
from public, anon, authenticated;
revoke all on function public.recalculate_approved_leave_for_holiday_date(date,text)
from public, anon, authenticated;
```

- [ ] **Step 5: Add automatic schedule and holiday triggers**

Append:

```sql
create or replace function public.trigger_leave_recalculation_for_schedule()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' or (
    old.effective_start_date is distinct from new.effective_start_date
    or old.effective_end_date is distinct from new.effective_end_date
    or old.schedule_template_id is distinct from new.schedule_template_id
    or old.is_superseded is distinct from new.is_superseded
  ) then
    perform public.recalculate_approved_leave_for_employee_range(
      new.employee_id,
      least(new.effective_start_date, coalesce(old.effective_start_date, new.effective_start_date)),
      greatest(
        coalesce(new.effective_end_date, 'infinity'::date),
        coalesce(old.effective_end_date, new.effective_end_date, 'infinity'::date)
      ),
      'schedule_recalculation',
      'schedule_assignment_changed'
    );
  end if;
  return new;
end;
$$;

create trigger trigger_leave_recalculation_for_schedule
after insert or update on public.employee_schedule_assignments
for each row execute function public.trigger_leave_recalculation_for_schedule();

create or replace function public.trigger_leave_recalculation_for_holiday()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_old_date date;
  v_new_date date;
begin
  if old.active_version_id is not null then
    select holiday_date into v_old_date
    from public.holiday_calendar_versions
    where id = old.active_version_id;
  end if;
  if new.active_version_id is not null then
    select holiday_date into v_new_date
    from public.holiday_calendar_versions
    where id = new.active_version_id;
  end if;

  if v_old_date is not null then
    perform public.recalculate_approved_leave_for_holiday_date(
      v_old_date, 'holiday_version_replaced'
    );
  end if;
  if v_new_date is not null and v_new_date is distinct from v_old_date then
    perform public.recalculate_approved_leave_for_holiday_date(
      v_new_date, 'holiday_version_activated'
    );
  end if;
  return new;
end;
$$;

create trigger trigger_leave_recalculation_for_holiday
after insert or update of active_version_id on public.holiday_calendar_groups
for each row execute function public.trigger_leave_recalculation_for_holiday();
```

Because these are `AFTER` triggers, any leave recalculation failure rolls back the originating schedule or holiday operation. That preserves the approved atomicity requirement; it does not silently defer inconsistent balances.

- [ ] **Step 6: Run focused and full verification**

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/leave/recalculation.test.ts \
  src/features/leave/concurrency.test.ts
npm test
```

Expected: recalculation tests pass and the complete suite has zero failures.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/202607160001_leave_management.sql \
  src/features/leave/recalculation.test.ts \
  src/features/leave/concurrency.test.ts
git commit -m "feat: recalculate leave after schedule changes"
```

## Task 11: Leave authorization and server action boundary

**Files:**
- Create: `src/app/(dashboard)/employee/leave/actions.ts`
- Create: `src/app/(dashboard)/admin/leave/actions.ts`
- Create: `src/app/(dashboard)/settings/leave-types/actions.ts`
- Modify: `src/features/leave/requests/actions.test.ts`
- Modify: `src/features/leave/policy/actions.test.ts`
- Modify: `src/features/leave/balances/actions.test.ts`
- Modify: `src/features/leave/security.test.ts`

**Interfaces:**
- Consumes: `requireAttendanceEmployee`, `requireHrAdmin`, Task 1 validation functions and error mapper, and all protected leave RPCs.
- Produces: role-specific auth helpers and server actions for employee drafts/submission/withdrawal, HR review/cancellation/conflict resolution/balance operations, and leave-type policy administration.

- [ ] **Step 1: Write failing action-boundary tests**

Append to `src/features/leave/security.test.ts`:

```ts
import { readFileSync } from "node:fs";

const employeeActions = readFileSync(
  new URL("../../app/(dashboard)/employee/leave/actions.ts", import.meta.url),
  "utf8",
);
const adminActions = readFileSync(
  new URL("../../app/(dashboard)/admin/leave/actions.ts", import.meta.url),
  "utf8",
);
const settingsActions = readFileSync(
  new URL("../../app/(dashboard)/settings/leave-types/actions.ts", import.meta.url),
  "utf8",
);

test("employee leave actions use employee auth only", () => {
  assert.match(employeeActions, /requireLeaveEmployee/);
  assert.doesNotMatch(employeeActions, /service_role|createAdminClient/);
});

test("admin and settings actions require leave admin", () => {
  assert.match(adminActions, /requireLeaveAdmin/);
  assert.match(settingsActions, /requireLeaveAdmin/);
});

test("server actions call RPCs instead of writing protected tables", () => {
  for (const source of [employeeActions, adminActions, settingsActions]) {
    assert.doesNotMatch(source, /from\("leave_balance_ledger"\)/);
    assert.doesNotMatch(source, /from\("leave_request_actions"\)/);
    assert.doesNotMatch(source, /from\("leave_request_day_revisions"\)/);
  }
});
```

Append static assertions to each existing actions test for the RPC names it owns. For example in `src/features/leave/requests/actions.test.ts`:

```ts
test("employee actions expose draft submit and withdrawal RPCs", () => {
  assert.match(employeeActions, /create_leave_draft/);
  assert.match(employeeActions, /update_leave_draft/);
  assert.match(employeeActions, /delete_leave_draft/);
  assert.match(employeeActions, /submit_leave_request/);
  assert.match(employeeActions, /withdraw_leave_request/);
});
```

- [ ] **Step 2: Run action tests and verify failure**

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/leave/security.test.ts \
  src/features/leave/requests/actions.test.ts \
  src/features/leave/policy/actions.test.ts \
  src/features/leave/balances/actions.test.ts
```

Expected: FAIL because the auth and action files do not exist.

- [ ] **Step 3: Add employee server actions**

Create `src/app/(dashboard)/employee/leave/actions.ts` with these exports:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireLeaveEmployee } from "@/features/leave/auth";
import { mapLeaveError } from "@/features/leave/errors";
import type { LeaveActionState } from "@/features/leave/types";
import { validateLeaveDraft } from "@/features/leave/validation";

function revalidateEmployeeLeave(requestGroupId?: string) {
  revalidatePath("/leave");
  revalidatePath("/employee/leave");
  if (requestGroupId) revalidatePath(`/employee/leave/${requestGroupId}`);
  revalidatePath("/attendance");
}

export async function createLeaveDraft(
  _state: LeaveActionState,
  formData: FormData,
): Promise<LeaveActionState> {
  const { supabase, employee } = await requireLeaveEmployee();
  const validation = validateLeaveDraft(formData);
  if (!validation.data) return validation.state ?? { error: "Invalid leave request." };
  const { data, error } = await supabase.rpc("create_leave_draft", {
    p_employee_id: employee.id,
    p_leave_type_id: validation.data.leaveTypeId,
    p_start_date: validation.data.startDate,
    p_end_date: validation.data.endDate,
    p_duration_mode: validation.data.durationMode,
    p_employee_note: validation.data.employeeNote,
    p_replaces_request_group_id: validation.data.replacesRequestGroupId,
    p_created_source: "employee",
  });
  if (error) return { error: mapLeaveError(error.message), values: validation.values };
  revalidateEmployeeLeave(String(data));
  redirect(`/employee/leave/${data}/edit?success=draft-created`);
}

export async function updateLeaveDraft(
  requestGroupId: string,
  expectedRevisionId: string,
  _state: LeaveActionState,
  formData: FormData,
): Promise<LeaveActionState> {
  const { supabase, employee } = await requireLeaveEmployee();
  const validation = validateLeaveDraft(formData);
  if (!validation.data) return validation.state ?? { error: "Invalid leave request." };
  const { error } = await supabase.rpc("update_leave_draft", {
    p_request_group_id: requestGroupId,
    p_expected_revision_id: expectedRevisionId,
    p_leave_type_id: validation.data.leaveTypeId,
    p_start_date: validation.data.startDate,
    p_end_date: validation.data.endDate,
    p_duration_mode: validation.data.durationMode,
    p_employee_note: validation.data.employeeNote,
    p_replaces_request_group_id: validation.data.replacesRequestGroupId,
  });
  if (error) return { error: mapLeaveError(error.message), values: validation.values };
  revalidateEmployeeLeave(requestGroupId);
  return { success: "Draft saved." };
}

export async function deleteLeaveDraft(requestGroupId: string) {
  const { supabase } = await requireLeaveEmployee();
  const { error } = await supabase.rpc("delete_leave_draft", {
    p_request_group_id: requestGroupId,
  });
  if (error) redirect(`/employee/leave/${requestGroupId}/edit?error=${encodeURIComponent(mapLeaveError(error.message))}`);
  revalidateEmployeeLeave();
  redirect("/employee/leave?success=draft-deleted");
}

export async function submitLeaveRequest(
  requestGroupId: string,
  expectedRevisionId: string,
): Promise<void> {
  const { supabase } = await requireLeaveEmployee();
  const { error } = await supabase.rpc("submit_leave_request", {
    p_request_group_id: requestGroupId,
    p_expected_revision_id: expectedRevisionId,
  });
  if (error) redirect(`/employee/leave/${requestGroupId}/edit?error=${encodeURIComponent(mapLeaveError(error.message))}`);
  revalidateEmployeeLeave(requestGroupId);
  redirect(`/employee/leave/${requestGroupId}?success=submitted`);
}

export async function withdrawLeaveRequest(
  requestGroupId: string,
  expectedRevisionId: string,
): Promise<void> {
  const { supabase } = await requireLeaveEmployee();
  const { error } = await supabase.rpc("withdraw_leave_request", {
    p_request_group_id: requestGroupId,
    p_expected_revision_id: expectedRevisionId,
  });
  if (error) redirect(`/employee/leave/${requestGroupId}?error=${encodeURIComponent(mapLeaveError(error.message))}`);
  revalidateEmployeeLeave(requestGroupId);
  redirect(`/employee/leave/${requestGroupId}?success=withdrawn`);
}
```

Preserve user-entered values in validation and RPC failure states. Append this typed, non-persisting preview action:

```ts
import type { LeavePreviewResult } from "@/features/leave/types";
import { previewLeaveRequest } from "@/features/leave/requests/queries";

export async function previewLeaveDraft(formData: FormData): Promise<LeavePreviewResult> {
  const { employee } = await requireLeaveEmployee();
  const validation = validateLeaveDraft(formData);
  if (!validation.data) {
    throw new Error(validation.state?.error ?? "Invalid leave request.");
  }
  return previewLeaveRequest({
    employeeId: employee.id,
    leaveTypeId: validation.data.leaveTypeId,
    startDate: validation.data.startDate,
    endDate: validation.data.endDate,
    durationMode: validation.data.durationMode,
    excludeRequestGroupId: String(formData.get("request_group_id") ?? "") || null,
  });
}
```

- [ ] **Step 4: Add HR server actions**

Create `src/app/(dashboard)/admin/leave/actions.ts` with these exports and exact RPC ownership:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { companyDateAt } from "@/features/attendance/time";
import { requireLeaveAdmin } from "@/features/leave/auth";
import { mapLeaveError } from "@/features/leave/errors";
import type { LeaveActionState } from "@/features/leave/types";
import {
  validateLeaveAdjustment,
  validateLeaveCancellation,
  validateLeaveDraft,
  validateLeaveReview,
  validateLeaveYearOpening,
} from "@/features/leave/validation";

function revalidateAdminLeave(requestGroupId?: string) {
  revalidatePath("/admin/leave");
  revalidatePath("/admin/leave/conflicts");
  revalidatePath("/admin/leave/balances");
  revalidatePath("/employee/leave");
  revalidatePath("/attendance");
  revalidatePath("/admin/attendance");
  revalidatePath("/reports");
  if (requestGroupId) revalidatePath(`/admin/leave/${requestGroupId}`);
}
```

Implement the HR actions below. Every failure returns `mapLeaveError(error.message)` and every success calls `revalidateAdminLeave` before returning or redirecting.

```ts
export async function createHrLeaveDraft(
  _state: LeaveActionState,
  formData: FormData,
): Promise<LeaveActionState> {
  const { supabase } = await requireLeaveAdmin();
  const validation = validateLeaveDraft(formData);
  if (!validation.data) return validation.state ?? { error: "Invalid leave request." };
  const { data, error } = await supabase.rpc("create_leave_draft", {
    p_employee_id: validation.data.employeeId,
    p_leave_type_id: validation.data.leaveTypeId,
    p_start_date: validation.data.startDate,
    p_end_date: validation.data.endDate,
    p_duration_mode: validation.data.durationMode,
    p_employee_note: validation.data.employeeNote,
    p_replaces_request_group_id: validation.data.replacesRequestGroupId,
    p_created_source: "hr",
  });
  if (error) return { error: mapLeaveError(error.message), values: validation.values };
  revalidateAdminLeave(String(data));
  redirect(`/admin/leave/${data}?success=draft-created`);
}

export async function submitHrLeaveRequest(
  requestGroupId: string,
  expectedRevisionId: string,
): Promise<void> {
  const { supabase } = await requireLeaveAdmin();
  const { error } = await supabase.rpc("create_hr_leave_request", {
    p_request_group_id: requestGroupId,
    p_expected_revision_id: expectedRevisionId,
  });
  if (error) {
    redirect(`/admin/leave/${requestGroupId}?error=${encodeURIComponent(mapLeaveError(error.message))}`);
  }
  revalidateAdminLeave(requestGroupId);
  redirect(`/admin/leave/${requestGroupId}?success=submitted`);
}

export async function reviewLeaveRequest(
  requestGroupId: string,
  _state: LeaveActionState,
  formData: FormData,
): Promise<LeaveActionState> {
  const { supabase } = await requireLeaveAdmin();
  const validation = validateLeaveReview(formData);
  if (!validation.data) return validation.state ?? { error: "Invalid leave review." };
  const { error } = await supabase.rpc("review_leave_request", {
    p_request_group_id: requestGroupId,
    p_expected_revision_id: validation.data.expectedRequestRevisionId,
    p_expected_status: validation.data.expectedStatus,
    p_expected_day_fingerprint: validation.data.expectedDayFingerprint,
    p_expected_chargeable_units: validation.data.expectedChargeableUnits,
    p_decision: validation.data.decision,
    p_review_text: validation.data.reviewText,
  });
  if (error) return { error: mapLeaveError(error.message) };
  revalidateAdminLeave(requestGroupId);
  redirect(`/admin/leave/${requestGroupId}?success=${validation.data.decision}`);
}

export async function cancelApprovedLeaveRequest(
  requestGroupId: string,
  expectedRevisionId: string,
  _state: LeaveActionState,
  formData: FormData,
): Promise<LeaveActionState> {
  const { supabase } = await requireLeaveAdmin();
  const validation = validateLeaveCancellation(formData);
  if (!validation.data) return validation.state ?? { error: "Invalid cancellation." };
  const { error } = await supabase.rpc("cancel_approved_leave_request", {
    p_request_group_id: requestGroupId,
    p_expected_revision_id: expectedRevisionId,
    p_reason: validation.data.reason,
  });
  if (error) return { error: mapLeaveError(error.message) };
  revalidateAdminLeave(requestGroupId);
  redirect(`/admin/leave/${requestGroupId}?success=cancelled`);
}

export async function createLeaveBalanceAdjustment(
  _state: LeaveActionState,
  formData: FormData,
): Promise<LeaveActionState> {
  const { supabase } = await requireLeaveAdmin();
  const validation = validateLeaveAdjustment(formData, Number(companyDateAt().slice(0, 4)));
  if (!validation.data) return validation.state ?? { error: "Invalid balance adjustment." };
  const { error } = await supabase.rpc("create_leave_balance_adjustment", {
    p_employee_id: validation.data.employeeId,
    p_leave_type_id: validation.data.leaveTypeId,
    p_leave_year: validation.data.leaveYear,
    p_units: validation.data.units,
    p_reason: validation.data.reason,
  });
  if (error) return { error: mapLeaveError(error.message), values: validation.values };
  revalidateAdminLeave();
  return { success: "Leave balance adjusted." };
}

export async function previewLeaveYearOpening(
  _state: LeaveActionState,
  formData: FormData,
): Promise<LeaveActionState> {
  const validation = validateLeaveYearOpening(formData, Number(companyDateAt().slice(0, 4)));
  if (!validation.data) return validation.state ?? { error: "Invalid leave year." };
  const { supabase } = await requireLeaveAdmin();
  const { data, error } = await supabase.rpc("preview_leave_year_opening", {
    p_leave_year: validation.data.leaveYear,
  });
  if (error) return { error: mapLeaveError(error.message) };
  return { success: "Preview generated.", data: data ?? [] };
}

export async function generateLeaveYearOpening(
  _state: LeaveActionState,
  formData: FormData,
): Promise<LeaveActionState> {
  const validation = validateLeaveYearOpening(formData, Number(companyDateAt().slice(0, 4)));
  if (!validation.data) return validation.state ?? { error: "Invalid leave year." };
  if (formData.get("confirmed") !== "true") {
    return { error: "Confirm the year-opening generation before continuing." };
  }
  const { supabase } = await requireLeaveAdmin();
  const { data, error } = await supabase.rpc("generate_leave_year_opening", {
    p_leave_year: validation.data.leaveYear,
  });
  if (error) return { error: mapLeaveError(error.message) };
  revalidateAdminLeave();
  return { success: "Leave year generated.", data: data ?? [] };
}

export async function generateIndividualLeaveAllocation(
  _state: LeaveActionState,
  formData: FormData,
): Promise<LeaveActionState> {
  const { supabase } = await requireLeaveAdmin();
  const employeeId = String(formData.get("employee_id") ?? "");
  const leaveTypeId = String(formData.get("leave_type_id") ?? "");
  const leaveYear = Number(formData.get("leave_year"));
  const units = Number(formData.get("units"));
  const effectiveDate = String(formData.get("effective_date") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!employeeId || !leaveTypeId || !Number.isInteger(leaveYear) || units <= 0 || units * 2 !== Math.trunc(units * 2) || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) || !reason) {
    return { error: "Employee, leave type, year, effective date, half-day units, and reason are required." };
  }
  const { error: settingError } = await supabase.rpc("upsert_employee_leave_year_setting", {
    p_employee_id: employeeId,
    p_leave_type_id: leaveTypeId,
    p_leave_year: leaveYear,
    p_is_excluded: false,
    p_annual_allocation_override_units: units,
    p_private_reason: reason,
  });
  if (settingError) return { error: mapLeaveError(settingError.message) };
  const { error } = await supabase.rpc("generate_individual_leave_allocation", {
    p_employee_id: employeeId,
    p_leave_type_id: leaveTypeId,
    p_leave_year: leaveYear,
    p_effective_date: effectiveDate,
  });
  if (error) return { error: mapLeaveError(error.message) };
  revalidateAdminLeave();
  return { success: "Individual allocation generated." };
}

export async function resolveLeaveAttendanceConflict(
  conflictId: string,
  _state: LeaveActionState,
  formData: FormData,
): Promise<LeaveActionState> {
  const { supabase } = await requireLeaveAdmin();
  const resolutionType = String(formData.get("resolution_type") ?? "");
  const note = String(formData.get("private_resolution_note") ?? "").trim();
  const allowed = new Set([
    "reviewed_no_change",
    "leave_cancelled",
    "attendance_corrected",
    "replacement_requested",
  ]);
  if (!allowed.has(resolutionType) || note.length > 1000) {
    return { error: "Choose a valid resolution and keep the note within 1,000 characters." };
  }
  const { error } = await supabase.rpc("resolve_leave_attendance_conflict", {
    p_conflict_id: conflictId,
    p_resolution_type: resolutionType,
    p_private_resolution_note: note || null,
  });
  if (error) return { error: mapLeaveError(error.message) };
  revalidateAdminLeave();
  return { success: "Conflict marked as resolved." };
}
```

- [ ] **Step 5: Add leave-type settings actions**

Create `src/app/(dashboard)/settings/leave-types/actions.ts` with:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { companyDateAt } from "@/features/attendance/time";
import { requireLeaveAdmin } from "@/features/leave/auth";
import { mapLeaveError } from "@/features/leave/errors";
import type { LeaveActionState } from "@/features/leave/types";
import { validateLeaveTypeVersion } from "@/features/leave/validation";

function revalidateLeaveSettings(leaveTypeId?: string) {
  revalidatePath("/settings/leave-types");
  revalidatePath("/admin/leave");
  revalidatePath("/admin/leave/balances");
  revalidatePath("/employee/leave");
  if (leaveTypeId) revalidatePath(`/settings/leave-types/${leaveTypeId}`);
}

export async function createLeaveType(
  _state: LeaveActionState,
  formData: FormData,
): Promise<LeaveActionState> {
  const { supabase } = await requireLeaveAdmin();
  const validation = validateLeaveTypeVersion(formData, companyDateAt());
  if (!validation.data) return validation.state ?? { error: "Invalid leave type." };
  const { data, error } = await supabase.rpc("create_leave_type", {
    p_code: validation.data.code,
    p_name: validation.data.name,
    p_description: validation.data.description,
    p_effective_from: validation.data.effectiveFrom,
    p_is_active: validation.data.isActive,
    p_is_paid: validation.data.isPaid,
    p_is_balance_tracked: validation.data.isBalanceTracked,
    p_default_annual_units: validation.data.defaultAnnualUnits,
    p_carryover_enabled: validation.data.carryoverEnabled,
    p_carryover_cap_units: validation.data.carryoverCapUnits,
    p_employee_note_required: validation.data.employeeNoteRequired,
    p_document_required: validation.data.documentRequired,
    p_document_required_min_units: validation.data.documentRequiredMinUnits,
  });
  if (error) return { error: mapLeaveError(error.message), values: validation.values };
  revalidateLeaveSettings(String(data));
  redirect(`/settings/leave-types/${data}?success=created`);
}
```

Append the remaining settings actions with exact parameter mapping:

```ts
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export async function createLeaveTypeVersion(
  leaveTypeId: string,
  _state: LeaveActionState,
  formData: FormData,
): Promise<LeaveActionState> {
  const { supabase } = await requireLeaveAdmin();
  const validation = validateLeaveTypeVersion(formData, companyDateAt());
  if (!validation.data) return validation.state ?? { error: "Invalid leave policy version." };
  if (validation.data.leaveTypeId !== leaveTypeId) return { error: "The leave type changed. Reload and try again." };
  const { error } = await supabase.rpc("create_leave_type_version", {
    p_leave_type_id: leaveTypeId,
    p_effective_from: validation.data.effectiveFrom,
    p_name: validation.data.name,
    p_description: validation.data.description,
    p_is_active: validation.data.isActive,
    p_is_paid: validation.data.isPaid,
    p_is_balance_tracked: validation.data.isBalanceTracked,
    p_default_annual_units: validation.data.defaultAnnualUnits,
    p_carryover_enabled: validation.data.carryoverEnabled,
    p_carryover_cap_units: validation.data.carryoverCapUnits,
    p_employee_note_required: validation.data.employeeNoteRequired,
    p_document_required: validation.data.documentRequired,
    p_document_required_min_units: validation.data.documentRequiredMinUnits,
    p_change_reason: validation.data.changeReason,
  });
  if (error) return { error: mapLeaveError(error.message), values: validation.values };
  revalidateLeaveSettings(leaveTypeId);
  redirect(`/settings/leave-types/${leaveTypeId}?success=version-created`);
}

export async function archiveLeaveType(
  leaveTypeId: string,
  _state: LeaveActionState,
  formData: FormData,
): Promise<LeaveActionState> {
  const { supabase } = await requireLeaveAdmin();
  const effectiveFrom = String(formData.get("effective_from") ?? "");
  const reason = String(formData.get("change_reason") ?? "").trim();
  if (!uuidPattern.test(leaveTypeId) || !datePattern.test(effectiveFrom) || !reason || reason.length > 1000) {
    return { error: "Effective date and a change reason of up to 1,000 characters are required." };
  }
  const { error } = await supabase.rpc("archive_leave_type", {
    p_leave_type_id: leaveTypeId,
    p_effective_from: effectiveFrom,
    p_change_reason: reason,
  });
  if (error) return { error: mapLeaveError(error.message) };
  revalidateLeaveSettings(leaveTypeId);
  redirect(`/settings/leave-types/${leaveTypeId}?success=archived`);
}

export async function upsertEmployeeLeaveYearSetting(
  _state: LeaveActionState,
  formData: FormData,
): Promise<LeaveActionState> {
  const { supabase } = await requireLeaveAdmin();
  const employeeId = String(formData.get("employee_id") ?? "");
  const leaveTypeId = String(formData.get("leave_type_id") ?? "");
  const leaveYear = Number(formData.get("leave_year"));
  const isExcluded = ["true", "on", "1"].includes(String(formData.get("is_excluded") ?? ""));
  const overrideText = String(formData.get("annual_allocation_override_units") ?? "").trim();
  const overrideUnits = overrideText === "" ? null : Number(overrideText);
  const reason = String(formData.get("private_reason") ?? "").trim();
  const validOverride = overrideUnits === null || (
    Number.isFinite(overrideUnits) && overrideUnits >= 0 && Number.isInteger(overrideUnits * 2)
  );
  if (!uuidPattern.test(employeeId) || !uuidPattern.test(leaveTypeId)
      || !Number.isInteger(leaveYear) || leaveYear < 2000 || leaveYear > 2200
      || !validOverride || !reason || reason.length > 1000) {
    return { error: "Employee, leave type, year, valid half-day override, and reason are required." };
  }
  const { error } = await supabase.rpc("upsert_employee_leave_year_setting", {
    p_employee_id: employeeId,
    p_leave_type_id: leaveTypeId,
    p_leave_year: leaveYear,
    p_is_excluded: isExcluded,
    p_annual_allocation_override_units: overrideUnits,
    p_private_reason: reason,
  });
  if (error) return { error: mapLeaveError(error.message) };
  revalidateLeaveSettings(leaveTypeId);
  return { success: "Employee leave setting saved." };
}
```

- [ ] **Step 6: Run focused and full verification**

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/leave/security.test.ts \
  src/features/leave/requests/actions.test.ts \
  src/features/leave/policy/actions.test.ts \
  src/features/leave/balances/actions.test.ts
npm test
npx tsc --noEmit
```

Expected: focused and full tests pass; TypeScript exits `0`.

- [ ] **Step 7: Commit**

```bash
git add src/features/leave/auth.ts \
  src/app/'(dashboard)'/employee/leave/actions.ts \
  src/app/'(dashboard)'/admin/leave/actions.ts \
  src/app/'(dashboard)'/settings/leave-types/actions.ts \
  src/features/leave/requests/actions.test.ts \
  src/features/leave/policy/actions.test.ts \
  src/features/leave/balances/actions.test.ts \
  src/features/leave/security.test.ts
git commit -m "feat: add leave server action boundary"
```

## Task 12: Employee leave workspace and private attachment routes

**Files:**
- Create: `src/components/leave/leave-balance-cards.tsx`
- Create: `src/components/leave/leave-calendar.tsx`
- Create: `src/components/leave/leave-request-table.tsx`
- Create: `src/components/leave/leave-request-form.tsx`
- Create: `src/components/leave/leave-request-preview.tsx`
- Create: `src/components/leave/leave-attachment-uploader.tsx`
- Create: `src/components/leave/withdraw-leave-button.tsx`
- Create: `src/app/(dashboard)/employee/leave/page.tsx`
- Create: `src/app/(dashboard)/employee/leave/loading.tsx`
- Create: `src/app/(dashboard)/employee/leave/error.tsx`
- Create: `src/app/(dashboard)/employee/leave/new/page.tsx`
- Create: `src/app/(dashboard)/employee/leave/[requestGroupId]/page.tsx`
- Create: `src/app/(dashboard)/employee/leave/[requestGroupId]/edit/page.tsx`
- Modify: `src/app/(dashboard)/leave/page.tsx`
- Create: `src/features/leave/ui.test.ts`

**Interfaces:**
- Consumes: employee auth, balance/request/policy query adapters, employee actions, Task 6 storage helpers, and existing `PageHeader`/card/form CSS primitives.
- Produces: the complete employee leave experience; `/leave` becomes a role-aware redirect; attachment endpoints return no service-role credentials and no raw private bucket URLs.

- [ ] **Step 1: Write employee UI tests**

Create `src/features/leave/ui.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function file(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const employeePage = file("../../app/(dashboard)/employee/leave/page.tsx");
const newPage = file("../../app/(dashboard)/employee/leave/new/page.tsx");
const detailPage = file("../../app/(dashboard)/employee/leave/[requestGroupId]/page.tsx");
const editPage = file("../../app/(dashboard)/employee/leave/[requestGroupId]/edit/page.tsx");
const legacyPage = file("../../app/(dashboard)/leave/page.tsx");
const form = file("../../components/leave/leave-request-form.tsx");
const uploader = file("../../components/leave/leave-attachment-uploader.tsx");

test("legacy leave route redirects by HR role", () => {
  assert.match(legacyPage, /redirect\("\/admin\/leave"\)/);
  assert.match(legacyPage, /redirect\("\/employee\/leave"\)/);
});

test("employee leave page loads balances calendar and history", () => {
  assert.match(employeePage, /LeaveBalanceCards/);
  assert.match(employeePage, /LeaveCalendar/);
  assert.match(employeePage, /LeaveRequestTable/);
  assert.match(employeePage, /requireLeaveEmployee/);
});

test("request form exposes only whole and half-day options", () => {
  assert.match(form, /full_day/);
  assert.match(form, /first_half/);
  assert.match(form, /second_half/);
  assert.doesNotMatch(form, /hourly|quarter_day/);
});

test("edit and submit controls are draft-only", () => {
  assert.match(editPage, /status !== "draft"/);
  assert.match(detailPage, /WithdrawLeaveButton/);
});

test("attachment uploader accepts only approved types and limits count", () => {
  assert.match(uploader, /application\/pdf,image\/jpeg,image\/png/);
  assert.match(uploader, /MAX_LEAVE_ATTACHMENTS/);
  assert.match(uploader, /MAX_LEAVE_ATTACHMENT_BYTES/);
});

test("new page authenticates and uses live leave type options", () => {
  assert.match(newPage, /requireLeaveEmployee/);
  assert.match(newPage, /getActiveLeaveTypeOptions/);
});
```

- [ ] **Step 2: Run UI tests and verify failure**

```bash
node --no-warnings --test --experimental-strip-types src/features/leave/ui.test.ts
```

Expected: FAIL because the employee pages and components do not exist.

- [ ] **Step 3: Create the role-aware legacy redirect**

Replace `src/app/(dashboard)/leave/page.tsx` with:

```tsx
import { redirect } from "next/navigation";
import { getCurrentRole } from "@/features/employees/auth";

export default async function LeaveRedirectPage() {
  const role = await getCurrentRole();
  if (role === "hr_admin" || role === "super_admin") {
    redirect("/admin/leave");
  }
  redirect("/employee/leave");
}
```

- [ ] **Step 4: Create typed employee presentation components**

Create `src/components/leave/leave-balance-cards.tsx`:

```tsx
import type { LeaveBalanceSummary } from "@/features/leave/types";
import { formatLeaveUnits } from "@/features/leave/presentation";

export function LeaveBalanceCards({ balances }: { balances: LeaveBalanceSummary[] }) {
  if (balances.length === 0) {
    return <section className="card empty-state"><h2>No leave balances</h2><p>No leave type is currently available for your account.</p></section>;
  }
  return (
    <section className="leave-balance-grid" aria-label="Leave balances">
      {balances.map((balance) => (
        <article className="card leave-balance-card" key={balance.leaveTypeId}>
          <div className="split-row">
            <h2>{balance.leaveTypeName}</h2>
            <span className={`badge ${balance.isPaid ? "success" : "warning"}`}>
              {balance.isPaid ? "Paid" : "Unpaid"}
            </span>
          </div>
          {balance.isBalanceTracked ? (
            <>
              <strong className="metric-value">{formatLeaveUnits(balance.availableUnits)}</strong>
              <p className="muted">Available after {formatLeaveUnits(balance.pendingUnits)} pending</p>
              <dl className="compact-definition-list">
                <div><dt>Allocated</dt><dd>{formatLeaveUnits(balance.allocatedUnits)}</dd></div>
                <div><dt>Used</dt><dd>{formatLeaveUnits(balance.usedUnits)}</dd></div>
                <div><dt>Carryover</dt><dd>{formatLeaveUnits(balance.carryoverUnits)}</dd></div>
              </dl>
            </>
          ) : (
            <>
              <strong className="metric-value">Balance exempt</strong>
              <p className="muted">{formatLeaveUnits(balance.usedUnits)} approved in {balance.leaveYear}</p>
            </>
          )}
        </article>
      ))}
    </section>
  );
}
```

Create `leave-calendar.tsx` as a server-rendered month grid. Its public signature is:

```tsx
export function LeaveCalendar(props: {
  year: number;
  month: number;
  requests: LeaveRequestListItem[];
  baseHref: "/employee/leave" | "/admin/leave";
}): React.ReactNode;
```

Requirements for the complete implementation:

- Generate dates with UTC-safe helpers and no locale timezone conversion.
- Render status text in addition to status color.
- Link each event to `${baseHref}/${request.requestGroupId}`.
- Show only leave type, duration, and status; never render employee note or attachment metadata.
- Provide previous/next month links while preserving the selected leave year.

Create `leave-request-table.tsx` with columns for leave type, date range, duration, requested units, chargeable units, status, submitted date, and allowed action. Draft rows link to edit; pending rows include `WithdrawLeaveButton`; all other rows link to detail only.

Create `withdraw-leave-button.tsx` as a client confirmation form that posts `withdrawLeaveRequest` and uses `window.confirm("Withdraw this pending leave request?")` before submission.

- [ ] **Step 5: Build the request form, preview, and uploader**

Create `src/components/leave/leave-request-form.tsx` as a client component with this public contract:

```tsx
export type LeaveRequestFormProps = {
  mode: "create" | "edit";
  employeeId: string;
  leaveTypes: LeaveTypeOption[];
  initialValues?: LeaveDraftValues;
  requestGroupId?: string;
  expectedRevisionId?: string;
  attachments?: LeaveAttachment[];
  action: (state: LeaveActionState, formData: FormData) => Promise<LeaveActionState>;
  previewAction: (formData: FormData) => Promise<LeavePreviewResult>;
};
```

The complete component must:

- Use `useActionState` for persistence and a separate transition for preview.
- Disable half-day options whenever `start_date !== end_date`.
- Clear an invalid half-day selection to `full_day` when the end date changes.
- Show a 1,000-character counter for the private employee note.
- Call preview after leave type/date/duration changes and on an explicit “Refresh calculation” button.
- Show `LeaveRequestPreview` with each date's schedule, holiday/rest status, classification, and units.
- Show tracked available, pending, and post-request balances.
- Render `LeaveAttachmentUploader` only after the draft has a request group ID.
- Render “Save draft” and “Submit request” as separate controls; submit calls the server action only after the current draft save succeeds.

Create `src/components/leave/leave-request-preview.tsx`:

```tsx
import type { LeavePreviewResult } from "@/features/leave/types";
import { formatLeaveUnits, leaveClassificationLabel } from "@/features/leave/presentation";

export function LeaveRequestPreview({ preview }: { preview: LeavePreviewResult | null }) {
  if (!preview) return <div className="card subtle-card"><p className="muted">Select a leave type and dates to calculate chargeable units.</p></div>;
  return (
    <section className="card">
      <div className="split-row">
        <h2>Date calculation</h2>
        <strong>{formatLeaveUnits(preview.chargeableUnits)} chargeable</strong>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Schedule</th><th>Classification</th><th>Units</th></tr></thead>
          <tbody>
            {preview.days.map((day) => (
              <tr key={day.leaveDate}>
                <td>{day.leaveDate}</td>
                <td>{day.scheduleName ?? "No schedule"}</td>
                <td>{leaveClassificationLabel(day.classification)}</td>
                <td>{formatLeaveUnits(day.chargeableUnits)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {preview.chargeableUnits === 0 && <p className="form-error">This request has no chargeable workdays.</p>}
    </section>
  );
}
```

Create `leave-attachment-uploader.tsx` using the constants from Task 1. The upload sequence is exactly:

```text
POST /api/leave/attachments/prepare
→ upload file to returned signed upload URL
→ POST /api/leave/attachments/finalize
→ refresh current draft route
```

Do not place Supabase service-role keys, bucket names, or direct private object URLs in the component.

- [ ] **Step 6: Build employee pages**

Create `employee/leave/page.tsx` to load the current year/month from search params, then fetch in parallel:

```ts
const [balances, requestPage] = await Promise.all([
  getMyLeaveBalances(leaveYear),
  getMyLeaveRequests({ leaveYear, page: 1, pageSize: 100 }),
]);
const requests = requestPage.items;
```

Render `PageHeader`, “Request leave” action, `LeaveBalanceCards`, `LeaveCalendar`, and `LeaveRequestTable` in that order.

Create `new/page.tsx` to require employee access, load active leave types for today's company date, and render `LeaveRequestForm` in create mode.

Create `[requestGroupId]/edit/page.tsx` to load the detail through `getLeaveRequestDetail`, return `notFound()` when inaccessible, redirect to detail when `status !== "draft"`, and render the form with current attachments.

Create `[requestGroupId]/page.tsx` to render:

- status, leave type, date range, duration, requested/chargeable units,
- per-date snapshot table,
- action timeline without exposing notes the current user is not permitted to see,
- attachment download links,
- replacement/superseded links,
- withdraw action only for `pending`.

Create `loading.tsx` with deterministic skeleton cards and `error.tsx` as a client error boundary with retry and return links.

- [ ] **Step 7: Run employee UI and type verification**

```bash
node --no-warnings --test --experimental-strip-types src/features/leave/ui.test.ts
npx tsc --noEmit
npm test
npm run build
```

Expected: UI test passes, TypeScript exits `0`, full test suite has zero failures, and production build exits `0`.

- [ ] **Step 8: Commit**

```bash
git add src/components/leave \
  src/app/'(dashboard)'/employee/leave \
  src/app/'(dashboard)'/leave/page.tsx \
  src/app/api/leave \
  src/features/leave/ui.test.ts
git commit -m "feat: add employee leave workspace"
```

## Task 13: HR review, conflict, balance, year-opening, and policy administration UI

**Files:**
- Create: `src/components/leave/leave-review-form.tsx`
- Create: `src/components/leave/cancel-approved-leave-form.tsx`
- Create: `src/components/leave/leave-conflict-table.tsx`
- Create: `src/components/leave/resolve-leave-conflict-form.tsx`
- Create: `src/components/leave/leave-balance-adjustment-form.tsx`
- Create: `src/components/leave/leave-year-opening-form.tsx`
- Create: `src/components/leave/employee-leave-setting-form.tsx`
- Create: `src/components/leave/leave-type-form.tsx`
- Create: `src/components/leave/leave-type-version-list.tsx`
- Create: `src/app/(dashboard)/admin/leave/page.tsx`
- Create: `src/app/(dashboard)/admin/leave/loading.tsx`
- Create: `src/app/(dashboard)/admin/leave/error.tsx`
- Create: `src/app/(dashboard)/admin/leave/new/page.tsx`
- Create: `src/app/(dashboard)/admin/leave/[requestGroupId]/page.tsx`
- Create: `src/app/(dashboard)/admin/leave/conflicts/page.tsx`
- Create: `src/app/(dashboard)/admin/leave/balances/page.tsx`
- Create: `src/app/(dashboard)/admin/leave/year-opening/page.tsx`
- Create: `src/app/(dashboard)/settings/leave-types/page.tsx`
- Create: `src/app/(dashboard)/settings/leave-types/new/page.tsx`
- Create: `src/app/(dashboard)/settings/leave-types/[leaveTypeId]/page.tsx`
- Create: `src/app/(dashboard)/settings/leave-types/[leaveTypeId]/new-version/page.tsx`
- Modify: `src/features/leave/ui.test.ts`

**Interfaces:**
- Consumes: leave admin auth, admin request/conflict/balance/policy queries and actions, employee/department option queries, and the shared calendar/request components.
- Produces: all approved HR management screens with no manager approval path and no editable submitted-request fields.

- [ ] **Step 1: Add failing HR UI tests**

Append to `src/features/leave/ui.test.ts`:

```ts
const adminPage = file("../../app/(dashboard)/admin/leave/page.tsx");
const adminDetail = file("../../app/(dashboard)/admin/leave/[requestGroupId]/page.tsx");
const conflictsPage = file("../../app/(dashboard)/admin/leave/conflicts/page.tsx");
const balancesPage = file("../../app/(dashboard)/admin/leave/balances/page.tsx");
const yearOpeningPage = file("../../app/(dashboard)/admin/leave/year-opening/page.tsx");
const leaveTypesPage = file("../../app/(dashboard)/settings/leave-types/page.tsx");

test("all HR leave pages require leave admin", () => {
  for (const source of [adminPage, adminDetail, conflictsPage, balancesPage, yearOpeningPage, leaveTypesPage]) {
    assert.match(source, /requireLeaveAdmin/);
  }
});

test("review detail exposes approve reject and cancellation but no edit form", () => {
  assert.match(adminDetail, /LeaveReviewForm/);
  assert.match(adminDetail, /CancelApprovedLeaveForm/);
  assert.doesNotMatch(adminDetail, /UpdateLeaveDraft|name="start_date"/);
});

test("HR workspace links to conflicts balances year opening and policy settings", () => {
  assert.match(adminPage, /\/admin\/leave\/conflicts/);
  assert.match(adminPage, /\/admin\/leave\/balances/);
  assert.match(adminPage, /\/admin\/leave\/year-opening/);
  assert.match(adminPage, /\/settings\/leave-types/);
});
```

- [ ] **Step 2: Run UI tests and verify failure**

```bash
node --no-warnings --test --experimental-strip-types src/features/leave/ui.test.ts
```

Expected: FAIL because the HR pages and components do not exist.

- [ ] **Step 3: Create review and cancellation components**

Create `leave-review-form.tsx` as a client component that accepts:

```ts
{
  requestGroupId: string;
  expectedRevisionId: string;
  expectedStatus: "pending";
  expectedChargeableUnits: number;
  action: typeof reviewLeaveRequest;
}
```

It must use separate “Approve request” and “Reject request” submit buttons with `name="decision"`; rejection requires a private reason; approval note is optional; both text fields enforce 1,000 characters. The form includes hidden expected revision/status/units values and displays `LEAVE_REQUEST_STALE` as a reload instruction.

Create `cancel-approved-leave-form.tsx` with a required cancellation reason and `window.confirm("Cancel this approved request and restore its remaining leave charges?")`.

Neither component renders editable leave dates, leave type, units, employee note, or attachments.

- [ ] **Step 4: Create conflict, balance, and year-opening components**

Create `leave-conflict-table.tsx` with columns: employee, date, leave type, duration, conflict type, attendance status, automatic balance action, created date, status, and review action.

Create `resolve-leave-conflict-form.tsx` with exact resolution values:

```ts
export const leaveConflictResolutions = [
  "reviewed_no_change",
  "leave_cancelled",
  "attendance_corrected",
  "replacement_requested",
] as const;
```

The submit action only records resolution metadata; operational changes must be completed through the dedicated attendance correction, cancellation, or replacement workflows first.

Create `leave-balance-adjustment-form.tsx` with employee, leave type, year, signed units, and required private reason. Display available balance and prevent a debit larger than available units before server submission; the database remains authoritative.

Create `leave-year-opening-form.tsx` with two stages:

1. preview selected year and show created/skipped/exception rows,
2. require explicit confirmation before generation.

Re-running the same year must show idempotent “already generated” results rather than duplicate entries.

Create `employee-leave-setting-form.tsx` with leave year, employee, leave type, excluded checkbox, optional annual allocation override, and required reason for changing an existing setting.

- [ ] **Step 5: Create leave-type policy components**

Create `leave-type-form.tsx` with fields matching `validateLeaveTypeVersion`. Client-side dependencies must be:

- Paid checked → balance tracked checked and disabled.
- Balance tracked unchecked → annual units `0`, carryover disabled, carryover cap cleared.
- Carryover disabled → cap cleared.
- Document required unchecked → minimum duration cleared.
- Effective date and change reason remain visible for new versions.

Create `leave-type-version-list.tsx` to render immutable versions newest-first with effective dates, active/archived state, paid/unpaid, tracked/exempt, allocation, carryover, note rule, and document rule. Used versions have no edit controls; every change creates a new version.

- [ ] **Step 6: Build HR pages**

`admin/leave/page.tsx` must:

- require leave admin,
- parse employee, department, leave type, status, paid state, conflict state, date, page, year, and month filters,
- load pending count, filtered request table, HR calendar, and open conflict count,
- render quick links to create on behalf, conflicts, balances, year opening, and leave types.

`admin/leave/new/page.tsx` uses `LeaveRequestForm` with an employee selector and HR date-window bypass. It still creates a draft and submits to `pending`; it never auto-approves.

`admin/leave/[requestGroupId]/page.tsx` must render current balance, other pending reservations, submitted date snapshots, private employee note, authorized attachment downloads, lifecycle timeline, and:

- `LeaveReviewForm` only for `pending`,
- `CancelApprovedLeaveForm` only for `approved`,
- no submitted-data edit controls.

`admin/leave/conflicts/page.tsx` loads `getLeaveAttendanceConflicts` with status/type/employee filters and renders the conflict table and resolution form.

`admin/leave/balances/page.tsx` loads admin balances and renders filters, summary table, adjustment form, and employee leave settings form.

`admin/leave/year-opening/page.tsx` renders the preview/generate workflow and individual mid-year allocation form.

Create loading and error states matching existing dashboard patterns.

- [ ] **Step 7: Build leave-type settings pages**

`settings/leave-types/page.tsx` lists stable leave types and active versions with active/archived badges and a “Create leave type” action.

`settings/leave-types/new/page.tsx` renders the create form.

`settings/leave-types/[leaveTypeId]/page.tsx` renders type identity, active version, full immutable version history, archive action, employee exclusions/overrides link, and “Add policy version”.

`settings/leave-types/[leaveTypeId]/new-version/page.tsx` pre-populates the active version but submits a new effective-dated version. The form includes the stable `leave_type_id`; the database locks the stable leave type before allocating the next immutable revision number.

- [ ] **Step 8: Run UI, type, full test, and build verification**

```bash
node --no-warnings --test --experimental-strip-types src/features/leave/ui.test.ts
npx tsc --noEmit
npm test
npm run build
```

Expected: UI tests pass, TypeScript exits `0`, full suite has zero failures, and build exits `0`.

- [ ] **Step 9: Commit**

```bash
git add src/components/leave \
  src/app/'(dashboard)'/admin/leave \
  src/app/'(dashboard)'/settings/leave-types \
  src/features/leave/ui.test.ts
git commit -m "feat: add HR leave administration"
```

## Task 14: Leave-aware reports and CSV/XLSX exports

**Files:**
- Modify: `supabase/migrations/202607160001_leave_management.sql`
- Modify: `src/features/reports/types.ts`
- Modify: `src/features/reports/constants.ts`
- Modify: `src/features/reports/filters.ts`
- Modify: `src/features/reports/filters.test.ts`
- Modify: `src/features/reports/queries.ts`
- Modify: `src/features/reports/queries.test.ts`
- Modify: `src/features/reports/csv.ts`
- Modify: `src/features/reports/csv.test.ts`
- Modify: `src/features/reports/xlsx.ts`
- Modify: `src/features/reports/xlsx.test.ts`
- Modify: `src/features/reports/components/report-tabs.tsx`
- Modify: `src/features/reports/components/daily-attendance-table.tsx`
- Modify: `src/features/reports/components/employee-summary-table.tsx`
- Create: `src/features/reports/components/leave-balance-table.tsx`
- Create: `src/features/reports/components/leave-usage-table.tsx`
- Create: `src/features/reports/components/leave-conflict-report-table.tsx`
- Modify: `src/features/reports/components/exports-panel.tsx`
- Modify: `src/app/(dashboard)/reports/page.tsx`
- Modify: `src/app/api/reports/export/csv/route.ts`
- Modify: `src/app/api/reports/export/xlsx/route.ts`
- Modify: `src/features/reports/migration.test.ts`
- Modify: `src/features/reports/security.test.ts`
- Modify: `src/features/reports/export-routes.test.ts`
- Modify: `src/features/reports/ui.test.ts`

**Interfaces:**
- Consumes: immutable request-day revisions, request lifecycle, ledger entries, conflict records, existing HR report filters, CSV/XLSX helpers, and report export row limits.
- Produces: attendance leave-day counts plus dedicated balance, usage, and conflict report tabs and exports without confidential notes, reasons, or attachment paths.

- [ ] **Step 1: Write failing report contract tests**

Append to `src/features/reports/filters.test.ts`:

```ts
test("accepts leave report tabs and leave filters", () => {
  const filters = parseReportFilters({
    tab: "leave_usage",
    start_date: "2026-07-01",
    end_date: "2026-07-31",
    leave_status: "approved",
    leave_paid_state: "paid",
  }, "2026-07-31");
  assert.equal(filters.tab, "leave_usage");
  assert.equal(filters.leaveStatus, "approved");
  assert.equal(filters.leavePaidState, "paid");
});
```

Append to `src/features/reports/migration.test.ts`:

```ts
test("migration exposes HR-only leave report functions", () => {
  for (const name of [
    "get_leave_balance_report",
    "get_leave_usage_report",
    "get_leave_conflict_report",
  ]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${name}`, "i"));
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}`, "i"));
  }
});

test("leave report SQL excludes private columns", () => {
  const privateColumns = [
    "employee_note", "storage_path", "original_filename", "action_reason",
    "review_note", "private_reason", "private_resolution_note",
  ];
  for (const name of ["get_leave_balance_report", "get_leave_usage_report", "get_leave_conflict_report"]) {
    const source = functionBody(name);
    for (const column of privateColumns) assert.doesNotMatch(source, new RegExp(column, "i"));
  }
});
```

Append to `src/features/reports/csv.test.ts` and `xlsx.test.ts` exact header assertions:

```ts
const leaveBalanceHeaders = [
  "Employee Number", "Employee Name", "Department", "Leave Type", "Leave Year",
  "Allocated Units", "Carryover Units", "Adjustment Units", "Used Units",
  "Pending Units", "Available Units", "Carryover Expires",
];

const leaveUsageHeaders = [
  "Employee Number", "Employee Name", "Department", "Leave Type", "Paid State",
  "Start Date", "End Date", "Duration", "Status", "Requested Units",
  "Chargeable Units", "Submitted At", "Reviewed At",
];

const leaveConflictHeaders = [
  "Employee Number", "Employee Name", "Department", "Leave Type", "Leave Date",
  "Conflict Type", "Conflict Status", "Attendance Status", "Balance Action", "Created At",
];
```

- [ ] **Step 2: Run report tests and verify failure**

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/reports/filters.test.ts \
  src/features/reports/migration.test.ts \
  src/features/reports/csv.test.ts \
  src/features/reports/xlsx.test.ts \
  src/features/reports/security.test.ts \
  src/features/reports/export-routes.test.ts \
  src/features/reports/ui.test.ts
```

Expected: FAIL because leave report contracts do not exist.

- [ ] **Step 3: Add report SQL functions**

Append `get_leave_balance_report` with HR authorization and this authoritative aggregation:

```sql
create or replace function public.get_leave_balance_report(
  p_leave_year integer,
  p_department_id uuid default null,
  p_employee_id uuid default null,
  p_leave_type_id uuid default null,
  p_offset integer default 0,
  p_limit integer default 50
)
returns table (
  employee_id uuid,
  employee_number text,
  employee_name text,
  department_id uuid,
  department_name text,
  leave_type_id uuid,
  leave_type_name text,
  leave_year integer,
  allocated_units numeric,
  carryover_units numeric,
  adjustment_units numeric,
  used_units numeric,
  pending_units numeric,
  available_units numeric,
  carryover_expires date,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  return query
  with ledger_totals as (
    select
      account.id as balance_account_id,
      coalesce(sum(ledger.units) filter (where ledger.entry_type = 'annual_allocation'), 0) as allocated_units,
      coalesce(sum(ledger.units) filter (where ledger.entry_type = 'carryover'), 0) as carryover_units,
      coalesce(sum(ledger.units) filter (where ledger.entry_type in ('hr_adjustment_credit','hr_adjustment_debit')), 0) as adjustment_units,
      abs(coalesce(sum(ledger.units) filter (where ledger.entry_type in ('approved_leave_charge','recalculation_charge')), 0))
        - coalesce(sum(ledger.units) filter (where ledger.entry_type in ('cancellation_restoration','attendance_conflict_release','recalculation_release')), 0)
        as used_units,
      min(ledger.expires_on) filter (where ledger.entry_type = 'carryover' and ledger.expires_on >= current_date) as carryover_expires,
      coalesce(sum(ledger.units), 0) as ledger_balance
    from public.leave_balance_accounts as account
    left join public.leave_balance_ledger as ledger on ledger.balance_account_id = account.id
    group by account.id
  ), pending as (
    select employee_id, leave_type_id, leave_year, sum(chargeable_units) as pending_units
    from public.leave_pending_reservations
    group by employee_id, leave_type_id, leave_year
  )
  select
    employee.id,
    employee.employee_number,
    concat_ws(' ', employee.first_name, employee.last_name),
    employee.department_id,
    department.name,
    leave_type.id,
    active_policy.name,
    account.leave_year,
    totals.allocated_units,
    totals.carryover_units,
    totals.adjustment_units,
    greatest(totals.used_units, 0),
    coalesce(pending.pending_units, 0),
    totals.ledger_balance - coalesce(pending.pending_units, 0),
    totals.carryover_expires,
    count(*) over ()
  from public.leave_balance_accounts as account
  join public.employees as employee on employee.id = account.employee_id
  left join public.departments as department on department.id = employee.department_id
  join public.leave_types as leave_type on leave_type.id = account.leave_type_id
  join lateral public.resolve_leave_type_version(leave_type.id, make_date(account.leave_year, 1, 1)) as active_policy on true
  join ledger_totals as totals on totals.balance_account_id = account.id
  left join pending on pending.employee_id = account.employee_id
    and pending.leave_type_id = account.leave_type_id
    and pending.leave_year = account.leave_year
  where account.leave_year = p_leave_year
    and (p_department_id is null or employee.department_id = p_department_id)
    and (p_employee_id is null or employee.id = p_employee_id)
    and (p_leave_type_id is null or leave_type.id = p_leave_type_id)
  order by employee.last_name, employee.first_name, active_policy.name
  offset greatest(p_offset, 0)
  limit least(greatest(p_limit, 1), 100);
end;
$$;
```

Add the two remaining report functions exactly as follows:

```sql
create or replace function public.get_leave_usage_report(
  p_start_date date,
  p_end_date date,
  p_department_id uuid default null,
  p_employee_id uuid default null,
  p_leave_type_id uuid default null,
  p_status text default null,
  p_paid_state text default null,
  p_offset integer default 0,
  p_limit integer default 50
)
returns table (
  request_group_id uuid,
  employee_id uuid,
  employee_number text,
  employee_name text,
  department_id uuid,
  department_name text,
  leave_type_id uuid,
  leave_type_name text,
  paid_state text,
  start_date date,
  end_date date,
  duration_mode text,
  status text,
  requested_units numeric,
  chargeable_units numeric,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception using errcode = 'P0001', message = 'REPORT_DATE_RANGE_INVALID';
  end if;

  return query
  with action_times as (
    select
      action.request_group_id,
      min(action.created_at) filter (where action.action_type = 'submitted') as submitted_at,
      max(action.created_at) filter (where action.action_type in ('approved','rejected')) as reviewed_at
    from public.leave_request_actions as action
    group by action.request_group_id
  ), unit_totals as (
    select
      request_day.request_revision_id,
      sum(day_revision.chargeable_units) as chargeable_units
    from public.leave_request_days as request_day
    join public.leave_request_day_revisions as day_revision
      on day_revision.id = request_day.active_revision_id
    group by request_day.request_revision_id
  )
  select
    request_group.id,
    employee.id,
    employee.employee_number,
    concat_ws(' ', employee.first_name, employee.last_name),
    employee.department_id,
    department.name,
    leave_type.id,
    policy.name,
    case when policy.is_paid then 'paid' else 'unpaid' end,
    request_revision.start_date,
    request_revision.end_date,
    request_revision.duration_mode,
    request_group.current_status,
    request_revision.requested_units,
    coalesce(unit_totals.chargeable_units, 0),
    action_times.submitted_at,
    action_times.reviewed_at,
    count(*) over ()
  from public.leave_request_groups as request_group
  join public.leave_request_revisions as request_revision
    on request_revision.id = request_group.active_revision_id
  join public.leave_type_versions as policy
    on policy.id = request_revision.leave_type_version_id
  join public.leave_types as leave_type
    on leave_type.id = policy.leave_type_id
  join public.employees as employee
    on employee.id = request_group.employee_id
  left join public.departments as department
    on department.id = employee.department_id
  left join action_times on action_times.request_group_id = request_group.id
  left join unit_totals on unit_totals.request_revision_id = request_revision.id
  where daterange(request_revision.start_date, request_revision.end_date, '[]')
        && daterange(p_start_date, p_end_date, '[]')
    and (p_department_id is null or employee.department_id = p_department_id)
    and (p_employee_id is null or employee.id = p_employee_id)
    and (p_leave_type_id is null or leave_type.id = p_leave_type_id)
    and (p_status is null or request_group.current_status = p_status)
    and (
      p_paid_state is null
      or (p_paid_state = 'paid' and policy.is_paid)
      or (p_paid_state = 'unpaid' and not policy.is_paid)
    )
  order by request_revision.start_date desc, employee.last_name, employee.first_name, request_group.id
  offset greatest(p_offset, 0)
  limit least(greatest(p_limit, 1), 100);
end;
$$;

create or replace function public.get_leave_conflict_report(
  p_start_date date,
  p_end_date date,
  p_department_id uuid default null,
  p_employee_id uuid default null,
  p_conflict_type text default null,
  p_conflict_status text default null,
  p_offset integer default 0,
  p_limit integer default 50
)
returns table (
  conflict_id uuid,
  employee_id uuid,
  employee_number text,
  employee_name text,
  department_id uuid,
  department_name text,
  leave_type_id uuid,
  leave_type_name text,
  leave_date date,
  conflict_type text,
  conflict_status text,
  attendance_status text,
  balance_action text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception using errcode = 'P0001', message = 'REPORT_DATE_RANGE_INVALID';
  end if;

  return query
  select
    conflict.id,
    employee.id,
    employee.employee_number,
    concat_ws(' ', employee.first_name, employee.last_name),
    employee.department_id,
    department.name,
    leave_type.id,
    policy.name,
    request_day.leave_date,
    conflict.conflict_type,
    conflict.status,
    attendance_revision.base_status,
    conflict.automatic_balance_action,
    conflict.created_at,
    count(*) over ()
  from public.leave_attendance_conflicts as conflict
  join public.employees as employee on employee.id = conflict.employee_id
  left join public.departments as department on department.id = employee.department_id
  join public.leave_request_groups as request_group on request_group.id = conflict.request_group_id
  join public.leave_request_revisions as request_revision on request_revision.id = request_group.active_revision_id
  join public.leave_type_versions as policy on policy.id = request_revision.leave_type_version_id
  join public.leave_types as leave_type on leave_type.id = policy.leave_type_id
  join public.leave_request_days as request_day on request_day.id = conflict.request_day_id
  left join public.attendance_calculation_revisions as attendance_revision
    on attendance_revision.id = conflict.attendance_calculation_revision_id
  where request_day.leave_date between p_start_date and p_end_date
    and (p_department_id is null or employee.department_id = p_department_id)
    and (p_employee_id is null or employee.id = p_employee_id)
    and (p_conflict_type is null or conflict.conflict_type = p_conflict_type)
    and (p_conflict_status is null or conflict.status = p_conflict_status)
  order by request_day.leave_date desc, employee.last_name, employee.first_name, conflict.id
  offset greatest(p_offset, 0)
  limit least(greatest(p_limit, 1), 100);
end;
$$;

revoke all on function public.get_leave_balance_report(integer,uuid,uuid,uuid,integer,integer)
from public, anon;
revoke all on function public.get_leave_usage_report(date,date,uuid,uuid,uuid,text,text,integer,integer)
from public, anon;
revoke all on function public.get_leave_conflict_report(date,date,uuid,uuid,text,text,integer,integer)
from public, anon;

grant execute on function public.get_leave_balance_report(integer,uuid,uuid,uuid,integer,integer)
to authenticated;
grant execute on function public.get_leave_usage_report(date,date,uuid,uuid,uuid,text,text,integer,integer)
to authenticated;
grant execute on function public.get_leave_conflict_report(date,date,uuid,uuid,text,text,integer,integer)
to authenticated;
```

- [ ] **Step 4: Extend report types, constants, and filters**

Modify `ReportTab` and `ReportExportDataset`:

```ts
export type ReportTab =
  | "summary"
  | "daily"
  | "exceptions"
  | "overtime"
  | "leave_balances"
  | "leave_usage"
  | "leave_conflicts"
  | "exports";

export type ReportExportDataset =
  | "daily"
  | "employee_summary"
  | "exceptions"
  | "overtime_holiday"
  | "leave_balances"
  | "leave_usage"
  | "leave_conflicts";

export type LeavePaidStateFilter = "paid" | "unpaid";
```

Add to `ReportFilters`:

```ts
leaveTypeId: string | null;
leaveStatus: LeaveRequestStatus | null;
leavePaidState: LeavePaidStateFilter | null;
leaveConflictType: LeaveConflictType | null;
leaveConflictStatus: "open" | "resolved" | "superseded" | null;
```

Add DTOs with the SQL return columns: `LeaveBalanceReportRow`, `LeaveUsageReportRow`, and `LeaveConflictReportRow`.

Update constants:

```ts
export const reportTabs = [
  "summary", "daily", "exceptions", "overtime",
  "leave_balances", "leave_usage", "leave_conflicts", "exports",
] as const;
```

Update parsing and serialization for `leave_type`, `leave_status`, `leave_paid_state`, `leave_conflict_type`, and `leave_conflict_status`. Use the unions exported from `src/features/leave/types.ts` and reject unknown values.

- [ ] **Step 5: Add report query adapters**

In `src/features/reports/queries.ts`, add:

```ts
export async function getLeaveBalanceReport(
  filters: ReportFilters,
): Promise<PaginatedReport<LeaveBalanceReportRow>>;

export async function getLeaveUsageReport(
  filters: ReportFilters,
): Promise<PaginatedReport<LeaveUsageReportRow>>;

export async function getLeaveConflictReport(
  filters: ReportFilters,
): Promise<PaginatedReport<LeaveConflictReportRow>>;
```

Each function must call its protected RPC, map every numeric field through `Number`, use the shared `page/pageSize` offset, and derive `total` from `total_count`. Add all-row loaders used only by exports; enforce `REPORT_EXPORT_ROW_LIMIT` before serialization.

Extend daily attendance and employee summary mapping with:

```ts
paid_leave_days: number;
unpaid_leave_days: number;
```

The report SQL must count these from attendance calculation `base_status`, not from request counts.

- [ ] **Step 6: Add report tables and page routing**

Add tab labels:

```ts
{ value: "leave_balances", label: "Leave Balances" },
{ value: "leave_usage", label: "Leave Usage" },
{ value: "leave_conflicts", label: "Leave Conflicts" },
```

Create the three table components with the fields in the export header arrays. No table may render private notes, reasons, filenames, storage paths, or attachment counts.

Update `reports/page.tsx`:

```ts
const leaveBalances = filters.tab === "leave_balances"
  ? await getLeaveBalanceReport(filters)
  : null;
const leaveUsage = filters.tab === "leave_usage"
  ? await getLeaveUsageReport(filters)
  : null;
const leaveConflicts = filters.tab === "leave_conflicts"
  ? await getLeaveConflictReport(filters)
  : null;
```

Render the matching table and include each in the shared pagination selection.

- [ ] **Step 7: Extend CSV, XLSX, and export routes**

Add serializers for the three datasets. CSV uses the existing escaping helper. XLSX uses one worksheet per requested dataset with frozen header row, autofilter, date formats, numeric unit cells, and no private fields.

Update both export routes to accept only the expanded `ReportExportDataset` union, require report admin, parse the same filters as the page, enforce 25,000 rows, and use filenames:

```text
leave-balances-YYYY-MM-DD.csv
leave-usage-YYYY-MM-DD.csv
leave-conflicts-YYYY-MM-DD.csv
leave-balances-YYYY-MM-DD.xlsx
leave-usage-YYYY-MM-DD.xlsx
leave-conflicts-YYYY-MM-DD.xlsx
```

Update `ExportsPanel` with dedicated download controls for all three leave datasets.

- [ ] **Step 8: Run report and full verification**

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/reports/filters.test.ts \
  src/features/reports/queries.test.ts \
  src/features/reports/migration.test.ts \
  src/features/reports/security.test.ts \
  src/features/reports/csv.test.ts \
  src/features/reports/xlsx.test.ts \
  src/features/reports/export-routes.test.ts \
  src/features/reports/ui.test.ts
npx tsc --noEmit
npm test
npm run build
```

Expected: report tests pass, TypeScript exits `0`, full suite has zero failures, and production build exits `0`.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/202607160001_leave_management.sql \
  src/features/reports \
  src/app/'(dashboard)'/reports/page.tsx \
  src/app/api/reports/export
git commit -m "feat: add leave reports and exports"
```

## Task 15: Navigation, settings discovery, responsive styles, and operator documentation

**Files:**
- Modify: `src/components/sidebar.tsx`
- Modify: `src/app/(dashboard)/settings/page.tsx`
- Modify: `src/app/globals.css`
- Modify: `README.md`
- Modify: `src/features/leave/ui.test.ts`
- Modify: `src/features/build-config.test.ts`

**Interfaces:**
- Consumes: all completed routes and existing dashboard navigation conventions.
- Produces: discoverable role-aware navigation, usable desktop/mobile styling, and explicit deployment/migration/storage instructions.

- [ ] **Step 1: Add failing navigation and documentation tests**

Append to `src/features/leave/ui.test.ts`:

```ts
const sidebar = file("../../components/sidebar.tsx");
const settingsPage = file("../../app/(dashboard)/settings/page.tsx");

test("sidebar separates employee leave from HR leave administration", () => {
  assert.match(sidebar, /\/employee\/leave/);
  assert.match(sidebar, /\/admin\/leave/);
  assert.match(sidebar, /\/settings\/leave-types/);
});

test("settings hub links to leave types for HR", () => {
  assert.match(settingsPage, /\/settings\/leave-types/);
});
```

Append to `src/features/build-config.test.ts`:

```ts
test("README documents Phase 6 migration and private leave bucket", () => {
  const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
  assert.match(readme, /202607160001_leave_management\.sql/);
  assert.match(readme, /leave-documents/);
  assert.match(readme, /private/i);
  assert.match(readme, /Asia\/Manila/);
});
```

- [ ] **Step 2: Run tests and verify failure**

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/leave/ui.test.ts \
  src/features/build-config.test.ts
```

Expected: FAIL because navigation and documentation are not updated.

- [ ] **Step 3: Update role-aware sidebar navigation**

Modify `src/components/sidebar.tsx` so employee navigation always contains:

```ts
["/employee/leave", "My Leave", CalendarDays]
```

HR-only items additionally contain:

```ts
["/admin/leave", "Leave Administration", CalendarHeart],
["/settings/leave-types", "Leave Types", Settings],
```

Remove the old `[/leave, Leave]` item after the redirect route exists. Preserve existing active-link resolution so `/admin/leave/conflicts` highlights `/admin/leave`, while `/settings/leave-types` remains its own active item.

- [ ] **Step 4: Add leave settings discovery**

Add a leave-management card to the existing HR settings grid:

```tsx
<Link className="card settings-card" href="/settings/leave-types">
  <CalendarHeart aria-hidden="true" />
  <div>
    <h2>Leave types</h2>
    <p>Configure effective-dated leave policies, balances, carryover, notes, and document rules.</p>
  </div>
</Link>
```

The card must remain absent or inaccessible for non-HR roles according to the existing settings page authorization.

- [ ] **Step 5: Add responsive leave styles**

Append focused CSS classes to `src/app/globals.css` without changing global colors or existing component behavior:

```css
.leave-balance-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
}

.leave-balance-card .metric-value {
  display: block;
  margin-top: 0.75rem;
  font-size: clamp(1.75rem, 4vw, 2.5rem);
}

.leave-calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  background: var(--border);
}

.leave-calendar-day {
  min-height: 7rem;
  padding: 0.5rem;
  background: var(--surface);
}

.leave-calendar-event {
  display: block;
  margin-top: 0.35rem;
  padding: 0.35rem 0.45rem;
  border-radius: 0.45rem;
  font-size: 0.8rem;
  line-height: 1.25;
}

.leave-preview-grid,
.leave-review-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(18rem, 1fr);
  gap: 1rem;
  align-items: start;
}

.leave-file-list {
  display: grid;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

@media (max-width: 800px) {
  .leave-preview-grid,
  .leave-review-grid {
    grid-template-columns: 1fr;
  }

  .leave-calendar-grid {
    display: block;
    border: 0;
    background: transparent;
  }

  .leave-calendar-weekday {
    display: none;
  }

  .leave-calendar-day {
    min-height: auto;
    margin-bottom: 0.5rem;
    border: 1px solid var(--border);
    border-radius: 0.65rem;
  }
}
```

Use the actual CSS variable names already defined in `globals.css`; replace `--surface` or `--border` only when the repository uses different names.

- [ ] **Step 6: Document deployment and operating procedures**

Add a Phase 6 section to `README.md` covering:

```text
1. Apply supabase/migrations/202607160001_leave_management.sql after Phase 5C migrations.
2. Confirm the private leave-documents bucket exists and is not public.
3. Confirm authenticated users cannot list arbitrary bucket objects.
4. Create initial leave types and effective policy versions.
5. Configure employee exclusions and annual overrides before year opening.
6. Preview, then run year opening; reruns are idempotent.
7. Create mid-year hire allocations individually with manual proration.
8. Review open leave-attendance conflicts after attendance corrections, schedule changes, or holiday changes.
9. Never expose private notes, reasons, attachment paths, or signed URLs in general exports.
10. Company leave and attendance dates use Asia/Manila.
```

Include the exact supported file types, maximum five files, 10 MB per file, employee date windows, and no-cross-year rule.

- [ ] **Step 7: Run navigation, type, test, and build verification**

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/leave/ui.test.ts \
  src/features/build-config.test.ts
npx tsc --noEmit
npm test
npm run build
```

Expected: focused tests pass, TypeScript exits `0`, complete suite has zero failures, and production build exits `0`.

- [ ] **Step 8: Commit**

```bash
git add src/components/sidebar.tsx \
  src/app/'(dashboard)'/settings/page.tsx \
  src/app/globals.css \
  README.md \
  src/features/leave/ui.test.ts \
  src/features/build-config.test.ts
git commit -m "docs: finish leave management navigation"
```

## Task 16: Database security, concurrency fixtures, end-to-end workflow tests, and release verification

**Files:**
- Modify: `src/features/leave/migration.test.ts`
- Modify: `src/features/leave/security.test.ts`
- Modify: `src/features/leave/concurrency.test.ts`
- Create: `src/features/leave/e2e.test.ts`
- Modify: `supabase/migrations/202607160001_leave_management.sql` only for defects revealed by these tests

**Interfaces:**
- Consumes: the complete Phase 6 migration and all application modules.
- Produces: final proof that required workflows, access boundaries, immutable records, stable errors, and existing Phase 1–5C behavior remain intact.

- [ ] **Step 1: Complete migration structure tests**

Add assertions for every required table, view, function, trigger, policy, index, status, and error code. The required object checklist is:

```ts
const tables = [
  "leave_types",
  "leave_type_versions",
  "employee_leave_year_settings",
  "leave_request_groups",
  "leave_request_revisions",
  "leave_request_days",
  "leave_request_day_revisions",
  "leave_request_actions",
  "leave_request_attachments",
  "leave_balance_accounts",
  "leave_balance_ledger",
  "leave_attendance_conflicts",
];

const views = ["leave_pending_reservations"];

const publicRpcs = [
  "create_leave_type",
  "create_leave_type_version",
  "archive_leave_type",
  "create_leave_draft",
  "update_leave_draft",
  "delete_leave_draft",
  "submit_leave_request",
  "create_hr_leave_request",
  "withdraw_leave_request",
  "review_leave_request",
  "cancel_approved_leave_request",
  "create_leave_balance_adjustment",
  "upsert_employee_leave_year_setting",
  "preview_leave_year_opening",
  "generate_leave_year_opening",
  "generate_individual_leave_allocation",
  "recalculate_leave_request_dates",
  "resolve_leave_attendance_conflict",
];
```

Assert `paid_leave` and `unpaid_leave` exist in database and TypeScript status contracts.

- [ ] **Step 2: Complete security tests**

Static tests must prove:

- every privileged RPC uses `security definer` and `set search_path = pg_catalog, public`,
- internal helpers are revoked from `authenticated`,
- submitted revisions, day revisions, actions, ledger entries, and submitted attachments have mutation-prevention triggers,
- employees have no direct insert/update/delete policies for protected history or ledger tables,
- employee select policies are limited by `current_employee_id()`,
- HR policies depend on `is_hr_admin()`,
- storage access passes through `can_access_leave_storage_object`,
- no client file contains `service_role`, `SUPABASE_SERVICE_ROLE_KEY`, or raw `leave-documents/{employee_id}` construction,
- report SQL and general audit payloads omit all confidential text and paths.

Use exact regex assertions against the migration and source files; do not require a running Supabase instance for these repository tests.

- [ ] **Step 3: Complete concurrency tests**

Assert common lock identity and stale checks across:

```text
submit_leave_request_internal
review_leave_request
create_leave_balance_adjustment
generate_leave_year_opening
generate_individual_leave_allocation
recalculate_leave_request_dates
cancel_approved_leave_request
```

The tests must verify:

- submission locks employee/leave type/year before checking pending reservations,
- approval rechecks active revision, status, units, and current context,
- two approvals cannot consume the same final units,
- withdrawal versus approval produces one winner and one `LEAVE_REQUEST_STALE`,
- year opening uses deterministic generation keys and `on conflict`/existence checks,
- cancellation cannot restore the same charge twice,
- schedule/holiday recalculation and approval use the same advisory-lock key.

- [ ] **Step 4: Add end-to-end contract tests**

Create `src/features/leave/e2e.test.ts` as a repository-level workflow contract suite. It must trace the source ownership of these eight approved flows:

```ts
const flows = [
  ["draft submission approval", ["create_leave_draft", "submit_leave_request", "review_leave_request", "approved_leave_charge"]],
  ["pending withdrawal", ["submit_leave_request", "withdraw_leave_request", "withdrawn"]],
  ["pending rejection", ["review_leave_request", "rejected", "LEAVE_REASON_REQUIRED"]],
  ["approved cancellation", ["cancel_approved_leave_request", "cancellation_restoration"]],
  ["attendance conflict", ["apply_leave_attendance_effects", "full_day_completed_attendance", "attendance_conflict_release"]],
  ["year opening", ["preview_leave_year_opening", "generate_leave_year_opening", "carryover"]],
  ["policy replacement", ["create_leave_type_version", "expected_active_version_id"]],
  ["HR historical request", ["create_hr_leave_request", "pending"]],
] as const;
```

For each flow, assert the listed tokens exist in the migration/action/page layers and that no direct protected-table mutation bypass exists in client code. Also assert the employee and HR route tree contains every route named in the approved design.

- [ ] **Step 5: Run migration tests against an ephemeral PostgreSQL/Supabase instance when available**

Preferred command in the real repository:

```bash
npx supabase start
npx supabase db reset
```

Expected: all migrations, including `202607160001_leave_management.sql`, apply successfully.

Then run SQL smoke checks with the local database URL:

```bash
psql "$LOCAL_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
select to_regclass('public.leave_types') is not null as leave_types_exists;
select to_regclass('public.leave_balance_ledger') is not null as ledger_exists;
select proname, prosecdef
from pg_proc
where proname in (
  'submit_leave_request',
  'review_leave_request',
  'cancel_approved_leave_request',
  'recalculate_leave_request_dates'
)
order by proname;
select id, name, public
from storage.buckets
where id = 'leave-documents';
SQL
```

Expected:

- both table checks return `t`,
- all four functions return `prosecdef = t`,
- `leave-documents` returns `public = f`.

When local Supabase is unavailable, record that limitation explicitly; static tests do not substitute for migration execution before deployment.

- [ ] **Step 6: Run the complete release verification suite**

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

Review the full build output for missing routes, server/client boundary errors, dynamic route failures, and bundle-time environment access. Do not claim Phase 6 complete from a partial test run.

- [ ] **Step 7: Manually verify the approved acceptance matrix**

Use two browser sessions, one employee and one HR Admin, against a local Supabase dataset.

```text
Employee
[ ] sees only own balances, requests, notes, and documents
[ ] creates and edits a draft
[ ] sees per-date schedule/holiday preview
[ ] uploads PDF/JPG/PNG within limits
[ ] cannot submit zero-unit, overlapping, cross-year, over-window, or over-balance requests
[ ] submits a valid request and sees pending reservation
[ ] withdraws pending request
[ ] cannot edit submitted request

HR
[ ] creates an employee request that remains pending
[ ] approves whole request and sees ledger deduction
[ ] rejects with required reason
[ ] cancels approved leave and sees source-aware restoration
[ ] creates positive and negative adjustments without allowing negative balance
[ ] previews and runs idempotent year opening
[ ] creates manually prorated mid-year allocation
[ ] creates an effective-dated policy version without rewriting history
[ ] sees and resolves conflicts
[ ] exports leave reports without confidential fields

Attendance and recalculation
[ ] full paid leave becomes paid_leave
[ ] full unpaid leave becomes unpaid_leave
[ ] holiday/rest precedence remains
[ ] completed full-day attendance restores charge and creates conflict
[ ] incomplete attendance retains charge and creates conflict
[ ] half-day uncovered work calculates late/undertime correctly
[ ] half-day covered-time overlap retains charge and creates conflict
[ ] schedule/holiday changes append day revisions and adjust balances atomically
```

Capture defects as failing automated tests before changing implementation.

- [ ] **Step 8: Commit final test and defect fixes**

```bash
git add supabase/migrations/202607160001_leave_management.sql \
  src/features/leave/migration.test.ts \
  src/features/leave/security.test.ts \
  src/features/leave/concurrency.test.ts \
  src/features/leave/e2e.test.ts
git commit -m "test: verify Phase 6 leave management"
```

## Final execution checklist

Before merge or deployment, the implementing agent must record actual command output for:

```text
[ ] Local Supabase reset/migration execution
[ ] Full Node test count and zero failures
[ ] TypeScript exit code 0
[ ] Production build exit code 0
[ ] Employee/HR manual acceptance matrix
[ ] Private leave-documents bucket confirmed non-public
[ ] Migration applied only after 202607150005_fix_employee_attendance_summary_ambiguity.sql
[ ] No confidential leave content in audit JSON, CSV, XLSX, URLs, or logs
```

The implementation is not complete until every applicable item has fresh evidence.

## Spec coverage matrix

| Approved design section | Implemented by plan tasks |
|---|---|
| 1. Goal | Tasks 1–16 collectively |
| 2. Approved scope | Global Constraints; Tasks 1–16 |
| 3. Approved business decisions | Global Constraints; Tasks 1, 4, 5, 7–10 |
| 4. Architecture | File map; Tasks 2–11 |
| 5. Data model | Tasks 2–4 and 7–10 |
| 6. Leave-type management | Tasks 3, 11, and 13 |
| 7. Employee eligibility and yearly allocation | Tasks 4, 11, and 13 |
| 8. Carryover rules | Tasks 4 and 16 |
| 9. Draft workflow | Tasks 5, 6, 11, and 12 |
| 10. Submission workflow | Tasks 7, 11, and 12 |
| 11. HR review workflow | Tasks 8, 11, and 13 |
| 12. Withdrawal, cancellation, and replacement | Tasks 8, 11–13 |
| 13. HR balance adjustments | Tasks 4, 11, and 13 |
| 14. Half-day boundaries and attendance expectations | Tasks 5, 9, and 16 |
| 15. Attendance integration | Tasks 9, 10, 14, and 16 |
| 16. Schedule and holiday recalculation | Tasks 10 and 16 |
| 17. Leave-attendance conflict review | Tasks 9, 11, and 13 |
| 18. Employee leave workspace | Task 12 |
| 19. HR leave administration | Task 13 |
| 20. Calendar visibility | Tasks 2, 12, and 13 |
| 21. Private document storage | Tasks 2, 6, 12, and 16 |
| 22. Authorization and RLS | Tasks 2, 6, 11, and 16 |
| 23. Protected database functions | Tasks 2–10 and 16 |
| 24. Concurrency | Tasks 4, 7, 8, 10, and 16 |
| 25. Safe error handling | Tasks 1, 7–11, and 16 |
| 26. Audit integration | Tasks 2–4, 7–10, and 16 |
| 27. Reporting integration | Task 14 |
| 28. UI feedback states | Tasks 12, 13, and 15 |
| 29. Automated testing | Every task; consolidated in Task 16 |
| 30. Final verification | Task 16 and Final execution checklist |
| 31. Required routes | File map; Tasks 12–15 |
| 32. Acceptance criteria | Task 16 manual acceptance matrix |

## Plan self-review

- **Spec coverage:** All 32 approved design sections map to at least one implementation task above.
- **Deferred-marker scan:** The plan contains no unresolved markers, deferred implementation steps, or unnamed error-handling/testing steps.
- **Type consistency:** Database projection rows remain snake_case only at RPC boundaries; UI-facing leave balance, request, preview, attachment, and conflict types use explicit camelCase mappers.
- **Function consistency:** The protected RPC list, SQL signatures, server actions, static contract tests, and acceptance flows use the same canonical names.
- **Scope:** The plan stays within Phase 6. Payroll calculations, notifications, public-holiday import, hourly leave, and manager approvals remain excluded.
- **Migration ordering:** Phase 6 uses one migration after `202607150005_fix_employee_attendance_summary_ambiguity.sql`; helper functions are created before callers and default execution privileges are revoked explicitly.
- **Known schema resolution:** Phase 5C stores break duration but not an explicit break-start timestamp. Phase 6 freezes the midpoint of scheduled elapsed time as the half-day boundary until a later schedule version adds a real boundary field.
