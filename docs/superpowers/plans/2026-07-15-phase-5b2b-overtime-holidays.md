# Phase 5B-2B Overtime and Holidays Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add effective-dated overtime policy management, immutable holiday versions, holiday-aware attendance classification, immutable overtime detections, HR approval workflows, safe employee history, and explicit overtime recalculation.

**Architecture:** PostgreSQL remains the integrity boundary. Attendance calculation revisions continue to snapshot finalized attendance and schedule inputs; the overtime detector reads the active revision, independently resolves the overtime policy and currently active holiday, then writes immutable detection revisions and one approval item per qualifying segment. Next.js Server Actions invoke protected RPCs, server-only queries expose HR projections or employee-safe RPC results, and all protected reasons remain outside employee projections, audit JSON, logs, URLs, and retry state.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.7, Supabase PostgreSQL/Auth/RLS, PostgreSQL security-definer functions, Node built-in test runner, CSS.

## Global Constraints

- Company timezone remains exactly `Asia/Manila`.
- Overtime requires HR Admin or Super Admin approval; managers receive no approval permission.
- The implicit overtime threshold is exactly 30 completed whole minutes before the first explicit policy version.
- Explicit overtime thresholds are effective-dated integers from 1 through 480 minutes.
- Pre-shift and post-shift segments are calculated and thresholded independently.
- Holiday work takes precedence over rest-day, pre-shift, and post-shift detection.
- Rest-day work takes precedence over pre-shift and post-shift detection.
- Holiday work and rest-day overtime reuse finalized attendance `worked_minutes`; overtime detection never deducts a break.
- Holiday work produces no late or undertime.
- Holiday without attendance is `holiday`, never `absent`.
- Missing clock-out remains `missing_clock_out` on a holiday and creates no approval item.
- All minute calculations use completed whole minutes: `29m 59s -> 29`, `30m 00s -> 30`.
- A qualifying revision creates exactly one pending approval item for its segment.
- Approval is all detected minutes; rejection is zero approved minutes; partial approval is impossible.
- Rejection reason is required and approval note is optional, each with a maximum of 1,000 characters.
- Recalculation creates new detection revisions only when facts or source snapshots changed; unchanged results are no-ops.
- Recalculation that invalidates or lowers a segment supersedes its prior approval item.
- Initially detected positive below-threshold segments retain a non-qualifying revision without an approval item.
- An initial zero-minute segment creates no group; an existing segment recalculated to zero receives a zero-minute superseding revision.
- Holiday versions, overtime policy versions, and overtime detection revisions have no direct edit or delete workflow.
- Holiday replacement changes the group pointer atomically and never mutates prior version facts.
- Overtime recalculation resolves the current overtime policy and holiday without modifying attendance calculation revisions.
- Running the existing attendance recalculation remains the way to refresh historical attendance holiday classification; it automatically invokes overtime detection after writing the new attendance revision.
- Holiday creation includes an optional `change_reason` field because current or past holiday creation requires a reason under the approved data rules; future creation may omit it.
- Superseding an approval item changes only lifecycle fields (`status`, `superseded_at`, `superseded_by_item_id`); prior reviewer fields and prior approved minutes remain available as history.
- Employees may read only their own safe overtime projection and never receive approval notes, rejection reasons, reviewer IDs, policy reasons, holiday reasons, recalculation reasons, or internal source IDs.
- Audit JSON must never include policy reasons, holiday replacement reasons, recalculation reasons, approval notes, rejection reasons, attendance notes, correction reasons, raw exceptions, or SQL details.
- Every security-definer function uses `set search_path = pg_catalog, public`.
- Internal helpers are revoked from `public`, `anon`, and `authenticated`.
- No new runtime npm dependency is introduced.
- Phase 5A, Phase 5B-1, and Phase 5B-2A behavior must remain compatible.
- No payroll, pay rates, multipliers, night differential, payslips, deductions, external holiday imports, partial approvals, manager approvals, or permanent deletion are added.

---

## Baseline and exact project assumptions

Verified baseline from the attached repository:

```text
npm test: 245 passed, 0 failed
Current latest migration: supabase/migrations/202607150001_attendance_policy_calculations.sql
New migration: supabase/migrations/202607150002_overtime_holidays.sql
```

The plan deliberately remains one implementation plan rather than separate policy, holiday, detection, and approval plans because those units share one migration transaction and a strict dependency chain:

```text
holiday/policy sources
  -> holiday-aware attendance revision
  -> overtime detection revision
  -> approval item
  -> HR/employee projections and recalculation
```

## File map

### Create

```text
supabase/migrations/202607150002_overtime_holidays.sql

src/features/overtime/types.ts
src/features/overtime/rules.ts
src/features/overtime/rules.test.ts
src/features/overtime/migration.test.ts
src/features/overtime/security.test.ts
src/features/overtime/queries.ts
src/features/overtime/queries.test.ts
src/features/overtime/presentation.ts
src/features/overtime/presentation.test.ts
src/features/overtime/ui.test.ts
src/features/overtime/actions.test.ts
src/features/overtime/validation.ts

src/features/overtime/policy/types.ts
src/features/overtime/policy/validation.ts
src/features/overtime/policy/validation.test.ts
src/features/overtime/policy/queries.ts
src/features/overtime/policy/queries.test.ts

src/features/overtime/holidays/types.ts
src/features/overtime/holidays/validation.ts
src/features/overtime/holidays/validation.test.ts
src/features/overtime/holidays/queries.ts
src/features/overtime/holidays/queries.test.ts

src/app/(dashboard)/settings/overtime-policy/actions.ts
src/app/(dashboard)/settings/overtime-policy/page.tsx
src/app/(dashboard)/settings/overtime-policy/new/page.tsx
src/app/(dashboard)/settings/holidays/actions.ts
src/app/(dashboard)/settings/holidays/page.tsx
src/app/(dashboard)/settings/holidays/new/page.tsx
src/app/(dashboard)/settings/holidays/[holidayGroupId]/page.tsx
src/app/(dashboard)/settings/holidays/[holidayGroupId]/replace/page.tsx
src/app/(dashboard)/admin/overtime/actions.ts
src/app/(dashboard)/admin/overtime/page.tsx
src/app/(dashboard)/admin/overtime/[approvalItemId]/page.tsx
src/app/(dashboard)/admin/overtime/recalculate/actions.ts
src/app/(dashboard)/admin/overtime/recalculate/page.tsx
src/app/(dashboard)/overtime/page.tsx

src/components/overtime/overtime-policy-form.tsx
src/components/overtime/holiday-form.tsx
src/components/overtime/holiday-replacement-form.tsx
src/components/overtime/overtime-approval-table.tsx
src/components/overtime/overtime-review-form.tsx
src/components/overtime/overtime-recalculation-form.tsx
src/components/overtime/employee-overtime-history.tsx
src/components/overtime/attendance-overtime-summary.tsx
```

### Modify

```text
src/features/attendance/calculations/types.ts
src/features/attendance/calculations/rules.ts
src/features/attendance/calculations/rules.test.ts
src/features/attendance/calculations/attendance-days.ts
src/features/attendance/calculations/attendance-days.test.ts
src/features/attendance/calculations/queries.ts
src/features/attendance/calculations/queries.test.ts
src/features/attendance/calculations/presentation.ts
src/features/attendance/calculations/presentation.test.ts
src/features/attendance/types.ts
src/features/attendance/queries.ts
src/features/attendance/queries.test.ts
src/app/(dashboard)/attendance/page.tsx
src/app/(dashboard)/admin/attendance/page.tsx
src/components/attendance/attendance-calculation-card.tsx
src/components/attendance/attendance-history.tsx
src/components/attendance/admin-attendance-table.tsx
src/components/sidebar.tsx
src/app/(dashboard)/settings/page.tsx
src/features/employees/audit/presentation.ts
src/features/employees/audit/presentation.test.ts
src/app/globals.css
README.md
docs/superpowers/specs/2026-07-15-phase-5b2b-overtime-holidays-design.md
```

## Shared TypeScript contracts

Create `src/features/overtime/types.ts` with these exact public contracts:

```ts
export const overtimeSegmentTypes = [
  "pre_shift",
  "post_shift",
  "rest_day",
  "holiday_work",
] as const;

export type OvertimeSegmentType = (typeof overtimeSegmentTypes)[number];

export const overtimeApprovalStatuses = [
  "pending",
  "approved",
  "rejected",
  "superseded",
] as const;

export type OvertimeApprovalStatus =
  (typeof overtimeApprovalStatuses)[number];

export const overtimeCalculationSources = [
  "clock_in",
  "clock_out",
  "hr_create",
  "hr_correction",
  "correction_approval",
  "daily_finalization",
  "manual_recalculation",
  "manual_finalization",
  "overtime_recalculation",
] as const;

export type OvertimeCalculationSource =
  (typeof overtimeCalculationSources)[number];

export type OvertimeDetectionRevision = {
  id: string;
  detection_group_id: string;
  revision_number: number;
  attendance_calculation_revision_id: string;
  attendance_record_id: string | null;
  schedule_assignment_id: string | null;
  schedule_version_id: string | null;
  overtime_policy_version_id: string | null;
  holiday_version_id: string | null;
  segment_type: OvertimeSegmentType;
  detected_start_at: string | null;
  detected_end_at: string | null;
  detected_minutes: number;
  meets_threshold: boolean;
  is_active: boolean;
  calculation_source: OvertimeCalculationSource;
  calculated_by: string | null;
  calculated_at: string;
  recalculation_reason: string | null;
};

export type OvertimeApprovalItem = {
  id: string;
  detection_revision_id: string;
  status: OvertimeApprovalStatus;
  detected_minutes: number;
  approved_minutes: number;
  reviewed_by: string | null;
  reviewed_at: string | null;
  approval_note: string | null;
  rejection_reason: string | null;
  created_at: string;
  superseded_at: string | null;
  superseded_by_item_id: string | null;
};

export type SafeEmployeeOvertimeItem = {
  attendance_date: string;
  segment_type: OvertimeSegmentType;
  detected_minutes: number;
  approved_minutes: number;
  status: OvertimeApprovalStatus;
  approval_date: string | null;
  holiday_name: string | null;
  holiday_type: import("./holidays/types").HolidayType | null;
  is_active: boolean;
  created_at: string;
};

export type AttendanceOvertimeSummary = Pick<
  SafeEmployeeOvertimeItem,
  | "attendance_date"
  | "segment_type"
  | "detected_minutes"
  | "approved_minutes"
  | "status"
  | "holiday_name"
  | "holiday_type"
  | "is_active"
>;

export type OvertimeApprovalQueueRow = {
  id: string;
  status: OvertimeApprovalStatus;
  detected_minutes: number;
  approved_minutes: number;
  reviewed_at: string | null;
  created_at: string;
  superseded_at: string | null;
  employee: {
    id: string;
    employee_number: string;
    first_name: string;
    last_name: string;
    department_id: string | null;
    department: { id: string; name: string } | null;
  };
  attendance_date: string;
  segment_type: OvertimeSegmentType;
  detected_start_at: string | null;
  detected_end_at: string | null;
  detection_revision_id: string;
  detection_revision_number: number;
  detection_is_active: boolean;
  holiday_name: string | null;
  holiday_type: import("./holidays/types").HolidayType | null;
};

export type OvertimeQueueMetrics = {
  pendingItems: number;
  approvedItems: number;
  rejectedItems: number;
  supersededItems: number;
  totalDetectedMinutes: number;
  totalActiveApprovedMinutes: number;
};

export type OvertimeApprovalDetail = OvertimeApprovalQueueRow & {
  attendance_calculation_revision_id: string;
  attendance_record_id: string | null;
  schedule_assignment_id: string | null;
  schedule_version_id: string | null;
  overtime_policy_version_id: string | null;
  holiday_version_id: string | null;
  calculation_source: OvertimeCalculationSource;
  calculated_at: string;
  reviewer: {
    id: string;
    display_name: string | null;
    first_name: string;
    last_name: string;
  } | null;
  approval_note: string | null;
  rejection_reason: string | null;
  priorItems: OvertimeApprovalQueueRow[];
};

export type OvertimeReviewActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

export type OvertimeRecalculationActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: {
    scope?: "one_employee" | "all_active";
    employeeId?: string;
    startDate?: string;
    endDate?: string;
  };
};
```

Create `src/features/overtime/policy/types.ts`:

```ts
export type OvertimePolicyVersion = {
  id: string;
  effective_date: string;
  minimum_qualifying_minutes: number;
  created_by: string;
  created_at: string;
  change_reason: string | null;
  creator: {
    id: string;
    display_name: string | null;
    first_name: string;
    last_name: string;
  } | null;
};

export type OvertimePolicyActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: {
    effectiveDate?: string;
    minimumQualifyingMinutes?: string;
  };
};
```

Create `src/features/overtime/holidays/types.ts`:

```ts
export const holidayTypes = [
  "regular_holiday",
  "special_non_working_holiday",
  "company_holiday",
] as const;

export type HolidayType = (typeof holidayTypes)[number];

export type HolidayCalendarVersion = {
  id: string;
  holiday_group_id: string;
  revision_number: number;
  holiday_date: string;
  holiday_name: string;
  holiday_type: HolidayType;
  is_active: boolean;
  created_by: string;
  created_at: string;
  change_reason: string | null;
  creator: {
    id: string;
    display_name: string | null;
    first_name: string;
    last_name: string;
  } | null;
};

export type HolidayCalendarGroup = {
  id: string;
  active_version_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  active_version: HolidayCalendarVersion | null;
};

export type HolidayActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: {
    holidayDate?: string;
    holidayName?: string;
    holidayType?: HolidayType;
    isActive?: "true" | "false";
  };
};
```

---

### Task 1: Add the Phase 5B-2B schema and migration contract tests

**Files:**
- Create: `supabase/migrations/202607150002_overtime_holidays.sql`
- Create: `src/features/overtime/migration.test.ts`

**Interfaces:**
- Produces tables `overtime_policy_versions`, `holiday_calendar_groups`, `holiday_calendar_versions`, `overtime_detection_groups`, `overtime_detection_revisions`, and `overtime_approval_items`.
- Extends `attendance_calculation_revisions` with holiday snapshot fields and the `holiday` base status.
- Later tasks append protected functions to the same migration.

- [ ] **Step 1: Write the failing migration tests**

Create `src/features/overtime/migration.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL(
    "../../../supabase/migrations/202607150002_overtime_holidays.sql",
    import.meta.url,
  ),
  "utf8",
);

test("migration creates overtime, holiday, detection, and approval tables", () => {
  for (const table of [
    "overtime_policy_versions",
    "holiday_calendar_groups",
    "holiday_calendar_versions",
    "overtime_detection_groups",
    "overtime_detection_revisions",
    "overtime_approval_items",
  ]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, "i"));
  }
});

test("attendance revisions gain immutable holiday snapshot fields", () => {
  for (const column of [
    "holiday_version_id",
    "holiday_name",
    "holiday_type",
    "is_holiday",
  ]) {
    assert.match(
      sql,
      new RegExp(`alter table public\\.attendance_calculation_revisions[\\s\\S]+${column}`, "i"),
    );
  }
  assert.match(sql, /'holiday'/i);
});

test("group identities and lifecycle foreign keys are constrained", () => {
  assert.match(sql, /unique \(employee_id, attendance_date, segment_type\)/i);
  assert.match(sql, /holiday_calendar_groups_active_version_fkey/i);
  assert.match(sql, /overtime_detection_groups_active_revision_fkey/i);
  assert.match(sql, /overtime_approval_items_superseded_by_fkey/i);
});

test("approved enums and minute limits are encoded in constraints", () => {
  assert.match(sql, /minimum_qualifying_minutes between 1 and 480/i);
  for (const value of [
    "regular_holiday",
    "special_non_working_holiday",
    "company_holiday",
    "pre_shift",
    "post_shift",
    "rest_day",
    "holiday_work",
    "pending",
    "approved",
    "rejected",
    "superseded",
  ]) {
    assert.match(sql, new RegExp(`'${value}'`, "i"));
  }
});

test("base tables expose HR reads but no direct mutations", () => {
  for (const table of [
    "overtime_policy_versions",
    "holiday_calendar_groups",
    "holiday_calendar_versions",
    "overtime_detection_groups",
    "overtime_detection_revisions",
    "overtime_approval_items",
  ]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.doesNotMatch(
      sql,
      new RegExp(`create policy[^;]+${table}[^;]+for (insert|update|delete)`, "i"),
    );
  }
});

test("approval constraints prohibit partial approval", () => {
  assert.match(sql, /status = 'approved'[\s\S]+approved_minutes = detected_minutes/i);
  assert.match(sql, /status = 'rejected'[\s\S]+approved_minutes = 0/i);
  assert.match(sql, /status = 'pending'[\s\S]+approved_minutes = 0/i);
});
```

- [ ] **Step 2: Run the migration tests and verify the missing migration failure**

Run:

```bash
npm test -- src/features/overtime/migration.test.ts
```

Expected: FAIL because `202607150002_overtime_holidays.sql` does not exist.

- [ ] **Step 3: Create the schema portion of the migration**

Create `supabase/migrations/202607150002_overtime_holidays.sql` with this initial content:

```sql
begin;

create table if not exists public.overtime_policy_versions (
  id uuid primary key default gen_random_uuid(),
  effective_date date not null,
  minimum_qualifying_minutes integer not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  change_reason text,
  constraint overtime_policy_effective_unique unique (effective_date),
  constraint overtime_policy_minimum_check
    check (minimum_qualifying_minutes between 1 and 480),
  constraint overtime_policy_reason_length_check
    check (change_reason is null or char_length(change_reason) <= 1000)
);

create table if not exists public.holiday_calendar_groups (
  id uuid primary key default gen_random_uuid(),
  active_version_id uuid,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.holiday_calendar_versions (
  id uuid primary key default gen_random_uuid(),
  holiday_group_id uuid not null
    references public.holiday_calendar_groups(id) on delete restrict,
  revision_number integer not null,
  holiday_date date not null,
  holiday_name text not null,
  holiday_type text not null,
  is_active boolean not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  change_reason text,
  constraint holiday_version_revision_unique
    unique (holiday_group_id, revision_number),
  constraint holiday_name_required_check
    check (char_length(btrim(holiday_name)) between 1 and 160),
  constraint holiday_type_check
    check (holiday_type in (
      'regular_holiday',
      'special_non_working_holiday',
      'company_holiday'
    )),
  constraint holiday_reason_length_check
    check (change_reason is null or char_length(change_reason) <= 1000)
);

alter table public.holiday_calendar_groups
  add constraint holiday_calendar_groups_active_version_fkey
  foreign key (active_version_id)
  references public.holiday_calendar_versions(id)
  on delete restrict
  deferrable initially deferred;

alter table public.attendance_calculation_revisions
  add column if not exists holiday_version_id uuid
    references public.holiday_calendar_versions(id) on delete restrict,
  add column if not exists holiday_name text,
  add column if not exists holiday_type text,
  add column if not exists is_holiday boolean not null default false;

alter table public.attendance_calculation_revisions
  drop constraint if exists calculation_revision_status_check;
alter table public.attendance_calculation_revisions
  add constraint calculation_revision_status_check
  check (base_status in (
    'present',
    'absent',
    'holiday',
    'missing_clock_out',
    'rest_day_worked',
    'unscheduled_attendance'
  ));

alter table public.attendance_calculation_revisions
  add constraint calculation_revision_holiday_type_check
  check (
    holiday_type is null
    or holiday_type in (
      'regular_holiday',
      'special_non_working_holiday',
      'company_holiday'
    )
  );

alter table public.attendance_calculation_revisions
  add constraint calculation_revision_holiday_snapshot_check
  check (
    (
      is_holiday
      and holiday_version_id is not null
      and char_length(btrim(holiday_name)) >= 1
      and holiday_type is not null
    )
    or (
      not is_holiday
      and holiday_version_id is null
      and holiday_name is null
      and holiday_type is null
    )
  );

alter table public.attendance_calculation_revisions
  drop constraint if exists calculation_rest_unscheduled_check;
alter table public.attendance_calculation_revisions
  add constraint calculation_rest_unscheduled_check
  check (
    base_status not in ('holiday', 'rest_day_worked', 'unscheduled_attendance')
    or (late_minutes is null and undertime_minutes is null)
  );

create table if not exists public.overtime_detection_groups (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  attendance_date date not null,
  segment_type text not null,
  active_revision_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint overtime_detection_group_identity_unique
    unique (employee_id, attendance_date, segment_type),
  constraint overtime_detection_group_segment_check
    check (segment_type in (
      'pre_shift', 'post_shift', 'rest_day', 'holiday_work'
    ))
);

create table if not exists public.overtime_detection_revisions (
  id uuid primary key default gen_random_uuid(),
  detection_group_id uuid not null
    references public.overtime_detection_groups(id) on delete restrict,
  revision_number integer not null,
  attendance_calculation_revision_id uuid not null
    references public.attendance_calculation_revisions(id) on delete restrict,
  attendance_record_id uuid
    references public.attendance_records(id) on delete restrict,
  schedule_assignment_id uuid
    references public.employee_schedule_assignments(id) on delete restrict,
  schedule_version_id uuid
    references public.work_schedule_versions(id) on delete restrict,
  overtime_policy_version_id uuid
    references public.overtime_policy_versions(id) on delete restrict,
  holiday_version_id uuid
    references public.holiday_calendar_versions(id) on delete restrict,
  segment_type text not null,
  detected_start_at timestamptz,
  detected_end_at timestamptz,
  detected_minutes integer not null,
  meets_threshold boolean not null,
  is_active boolean not null,
  calculation_source text not null,
  calculated_by uuid references public.profiles(id) on delete set null,
  calculated_at timestamptz not null default now(),
  recalculation_reason text,
  constraint overtime_detection_revision_number_unique
    unique (detection_group_id, revision_number),
  constraint overtime_detection_revision_segment_check
    check (segment_type in (
      'pre_shift', 'post_shift', 'rest_day', 'holiday_work'
    )),
  constraint overtime_detection_minutes_check
    check (detected_minutes >= 0),
  constraint overtime_detection_time_order_check
    check (
      detected_start_at is null
      or detected_end_at is null
      or detected_end_at >= detected_start_at
    ),
  constraint overtime_detection_reason_length_check
    check (
      recalculation_reason is null
      or char_length(recalculation_reason) <= 1000
    ),
  constraint overtime_detection_source_check
    check (calculation_source in (
      'clock_in',
      'clock_out',
      'hr_create',
      'hr_correction',
      'correction_approval',
      'daily_finalization',
      'manual_recalculation',
      'manual_finalization',
      'overtime_recalculation'
    ))
);

alter table public.overtime_detection_groups
  add constraint overtime_detection_groups_active_revision_fkey
  foreign key (active_revision_id)
  references public.overtime_detection_revisions(id)
  on delete restrict
  deferrable initially deferred;

create table if not exists public.overtime_approval_items (
  id uuid primary key default gen_random_uuid(),
  detection_revision_id uuid not null
    references public.overtime_detection_revisions(id) on delete restrict,
  status text not null,
  detected_minutes integer not null,
  approved_minutes integer not null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  approval_note text,
  rejection_reason text,
  created_at timestamptz not null default now(),
  superseded_at timestamptz,
  superseded_by_item_id uuid,
  constraint overtime_approval_detection_unique unique (detection_revision_id),
  constraint overtime_approval_status_check
    check (status in ('pending', 'approved', 'rejected', 'superseded')),
  constraint overtime_approval_minutes_nonnegative_check
    check (detected_minutes >= 0 and approved_minutes >= 0),
  constraint overtime_approval_note_length_check
    check (approval_note is null or char_length(approval_note) <= 1000),
  constraint overtime_rejection_reason_length_check
    check (rejection_reason is null or char_length(rejection_reason) <= 1000),
  constraint overtime_approval_decision_check
    check (
      (status = 'pending' and approved_minutes = 0
        and reviewed_by is null and reviewed_at is null
        and approval_note is null and rejection_reason is null)
      or (status = 'approved' and approved_minutes = detected_minutes
        and reviewed_by is not null and reviewed_at is not null
        and rejection_reason is null)
      or (status = 'rejected' and approved_minutes = 0
        and reviewed_by is not null and reviewed_at is not null
        and char_length(btrim(rejection_reason)) >= 1
        and approval_note is null)
      or (status = 'superseded' and superseded_at is not null)
    ),
  constraint overtime_approval_supersession_check
    check (
      (status <> 'superseded'
        and superseded_at is null
        and superseded_by_item_id is null)
      or status = 'superseded'
    )
);

alter table public.overtime_approval_items
  add constraint overtime_approval_items_superseded_by_fkey
  foreign key (superseded_by_item_id)
  references public.overtime_approval_items(id)
  on delete restrict
  deferrable initially deferred;

create index if not exists overtime_policy_effective_idx
  on public.overtime_policy_versions(effective_date desc, id desc);
create index if not exists holiday_versions_group_revision_idx
  on public.holiday_calendar_versions(holiday_group_id, revision_number desc);
create index if not exists holiday_versions_date_idx
  on public.holiday_calendar_versions(holiday_date, created_at desc);
create index if not exists overtime_detection_employee_date_idx
  on public.overtime_detection_groups(employee_id, attendance_date desc);
create index if not exists overtime_detection_revision_group_idx
  on public.overtime_detection_revisions(detection_group_id, revision_number desc);
create index if not exists overtime_detection_revision_attendance_idx
  on public.overtime_detection_revisions(attendance_calculation_revision_id);
create index if not exists overtime_approval_status_created_idx
  on public.overtime_approval_items(status, created_at, id);

alter table public.overtime_policy_versions enable row level security;
alter table public.holiday_calendar_groups enable row level security;
alter table public.holiday_calendar_versions enable row level security;
alter table public.overtime_detection_groups enable row level security;
alter table public.overtime_detection_revisions enable row level security;
alter table public.overtime_approval_items enable row level security;

create policy "HR views overtime policy versions"
on public.overtime_policy_versions
for select to authenticated
using (public.is_hr_admin());

create policy "HR views holiday calendar groups"
on public.holiday_calendar_groups
for select to authenticated
using (public.is_hr_admin());

create policy "HR views holiday calendar versions"
on public.holiday_calendar_versions
for select to authenticated
using (public.is_hr_admin());

create policy "HR views overtime detection groups"
on public.overtime_detection_groups
for select to authenticated
using (public.is_hr_admin());

create policy "HR views overtime detection revisions"
on public.overtime_detection_revisions
for select to authenticated
using (public.is_hr_admin());

create policy "HR views overtime approval items"
on public.overtime_approval_items
for select to authenticated
using (public.is_hr_admin());

-- No INSERT, UPDATE, or DELETE policies are created for Phase 5B-2B tables.
-- Protected security-definer functions own every lifecycle mutation.
```

Do not add `commit;` yet; later tasks append functions before the final transaction boundary.

- [ ] **Step 4: Run the migration tests**

Run:

```bash
npm test -- src/features/overtime/migration.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the schema slice**

```bash
git add supabase/migrations/202607150002_overtime_holidays.sql src/features/overtime/migration.test.ts
git commit -m "feat: add overtime and holiday schema"
```

---

### Task 2: Add pure overtime detection rules and holiday-aware attendance contracts

**Files:**
- Create: `src/features/overtime/types.ts`
- Create: `src/features/overtime/holidays/types.ts`
- Create: `src/features/overtime/policy/types.ts`
- Create: `src/features/overtime/rules.ts`
- Create: `src/features/overtime/rules.test.ts`
- Modify: `src/features/attendance/calculations/types.ts`
- Modify: `src/features/attendance/calculations/rules.ts`
- Modify: `src/features/attendance/calculations/rules.test.ts`

**Interfaces:**
- Produces `detectOvertimeSegments(input)` for deterministic UI/unit tests.
- Adds `holiday` to `AttendanceCalculationBaseStatus` and holiday snapshot fields to attendance revision types.
- SQL remains authoritative; pure TypeScript mirrors approved rules for fast tests and presentation consistency.

- [ ] **Step 1: Write failing overtime rule tests**

Create `src/features/overtime/rules.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  completedWholeMinutes,
  detectOvertimeSegments,
} from "./rules.ts";

test("whole-minute precision truncates seconds", () => {
  assert.equal(
    completedWholeMinutes(
      "2026-07-15T00:00:00.000Z",
      "2026-07-15T00:29:59.999Z",
    ),
    29,
  );
  assert.equal(
    completedWholeMinutes(
      "2026-07-15T00:00:00.000Z",
      "2026-07-15T00:30:00.000Z",
    ),
    30,
  );
});

test("pre-shift and post-shift thresholds are independent", () => {
  const segments = detectOvertimeSegments({
    clockInAt: "2026-07-15T00:40:00.000Z",
    clockOutAt: "2026-07-15T09:20:00.000Z",
    workedMinutes: 480,
    scheduledStartAt: "2026-07-15T01:00:00.000Z",
    scheduledEndAt: "2026-07-15T09:00:00.000Z",
    isScheduledWorkday: true,
    isHoliday: false,
    minimumQualifyingMinutes: 30,
  });
  assert.deepEqual(
    segments.map((segment) => [segment.segmentType, segment.detectedMinutes, segment.meetsThreshold]),
    [
      ["pre_shift", 20, false],
      ["post_shift", 20, false],
    ],
  );
});

test("all detected minutes qualify when a segment reaches threshold", () => {
  const [segment] = detectOvertimeSegments({
    clockInAt: "2026-07-15T00:25:00.000Z",
    clockOutAt: "2026-07-15T09:00:00.000Z",
    workedMinutes: 480,
    scheduledStartAt: "2026-07-15T01:00:00.000Z",
    scheduledEndAt: "2026-07-15T09:00:00.000Z",
    isScheduledWorkday: true,
    isHoliday: false,
    minimumQualifyingMinutes: 30,
  });
  assert.equal(segment.segmentType, "pre_shift");
  assert.equal(segment.detectedMinutes, 35);
  assert.equal(segment.meetsThreshold, true);
});

test("holiday work suppresses rest-day and scheduled segments", () => {
  const segments = detectOvertimeSegments({
    clockInAt: "2026-07-15T00:00:00.000Z",
    clockOutAt: "2026-07-15T08:00:00.000Z",
    workedMinutes: 450,
    scheduledStartAt: "2026-07-15T01:00:00.000Z",
    scheduledEndAt: "2026-07-15T07:00:00.000Z",
    isScheduledWorkday: false,
    isHoliday: true,
    minimumQualifyingMinutes: 30,
  });
  assert.deepEqual(segments, [{
    segmentType: "holiday_work",
    detectedStartAt: "2026-07-15T00:00:00.000Z",
    detectedEndAt: "2026-07-15T08:00:00.000Z",
    detectedMinutes: 450,
    meetsThreshold: true,
  }]);
});

test("rest-day overtime uses finalized worked minutes", () => {
  const segments = detectOvertimeSegments({
    clockInAt: "2026-07-15T00:00:00.000Z",
    clockOutAt: "2026-07-15T04:30:00.000Z",
    workedMinutes: 240,
    scheduledStartAt: null,
    scheduledEndAt: null,
    isScheduledWorkday: false,
    isHoliday: false,
    minimumQualifyingMinutes: 30,
  });
  assert.equal(segments[0].segmentType, "rest_day");
  assert.equal(segments[0].detectedMinutes, 240);
});

test("incomplete attendance produces no segments", () => {
  assert.deepEqual(detectOvertimeSegments({
    clockInAt: "2026-07-15T00:00:00.000Z",
    clockOutAt: null,
    workedMinutes: null,
    scheduledStartAt: "2026-07-15T01:00:00.000Z",
    scheduledEndAt: "2026-07-15T09:00:00.000Z",
    isScheduledWorkday: true,
    isHoliday: false,
    minimumQualifyingMinutes: 30,
  }), []);
});
```

- [ ] **Step 2: Run the rule test and verify it fails**

Run:

```bash
npm test -- src/features/overtime/rules.test.ts
```

Expected: FAIL because `rules.ts` does not exist.

- [ ] **Step 3: Implement the pure overtime rules**

Create `src/features/overtime/rules.ts`:

```ts
import type { OvertimeSegmentType } from "./types.ts";

export type OvertimeSegmentCandidate = {
  segmentType: OvertimeSegmentType;
  detectedStartAt: string | null;
  detectedEndAt: string | null;
  detectedMinutes: number;
  meetsThreshold: boolean;
};

export type OvertimeDetectionInput = {
  clockInAt: string | null;
  clockOutAt: string | null;
  workedMinutes: number | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  isScheduledWorkday: boolean;
  isHoliday: boolean;
  minimumQualifyingMinutes: number;
};

export function completedWholeMinutes(startIso: string, endIso: string): number {
  return Math.max(
    0,
    Math.floor((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000),
  );
}

function candidate(
  segmentType: OvertimeSegmentType,
  detectedStartAt: string | null,
  detectedEndAt: string | null,
  detectedMinutes: number,
  minimumQualifyingMinutes: number,
): OvertimeSegmentCandidate {
  return {
    segmentType,
    detectedStartAt,
    detectedEndAt,
    detectedMinutes,
    meetsThreshold: detectedMinutes >= minimumQualifyingMinutes,
  };
}

export function detectOvertimeSegments(
  input: OvertimeDetectionInput,
): OvertimeSegmentCandidate[] {
  if (!input.clockInAt || !input.clockOutAt || input.workedMinutes === null) {
    return [];
  }

  if (input.isHoliday) {
    return input.workedMinutes > 0
      ? [candidate(
          "holiday_work",
          input.clockInAt,
          input.clockOutAt,
          input.workedMinutes,
          input.minimumQualifyingMinutes,
        )]
      : [];
  }

  if (!input.isScheduledWorkday) {
    return input.workedMinutes > 0
      ? [candidate(
          "rest_day",
          input.clockInAt,
          input.clockOutAt,
          input.workedMinutes,
          input.minimumQualifyingMinutes,
        )]
      : [];
  }

  if (!input.scheduledStartAt || !input.scheduledEndAt) return [];

  const segments: OvertimeSegmentCandidate[] = [];
  const preShift = completedWholeMinutes(input.clockInAt, input.scheduledStartAt);
  const postShift = completedWholeMinutes(input.scheduledEndAt, input.clockOutAt);

  if (new Date(input.clockInAt) < new Date(input.scheduledStartAt) && preShift > 0) {
    segments.push(candidate(
      "pre_shift",
      input.clockInAt,
      input.scheduledStartAt,
      preShift,
      input.minimumQualifyingMinutes,
    ));
  }
  if (new Date(input.clockOutAt) > new Date(input.scheduledEndAt) && postShift > 0) {
    segments.push(candidate(
      "post_shift",
      input.scheduledEndAt,
      input.clockOutAt,
      postShift,
      input.minimumQualifyingMinutes,
    ));
  }

  return segments;
}
```

- [ ] **Step 4: Extend attendance calculation types**

In `src/features/attendance/calculations/types.ts`:

1. Add `"holiday"` between `"absent"` and `"missing_clock_out"` in `attendanceCalculationBaseStatuses`.
2. Import the holiday type:

```ts
import type { HolidayType } from "@/features/overtime/holidays/types";
```

3. Add these fields to `AttendanceCalculationRevision` after `policy_version_id`:

```ts
  holiday_version_id: string | null;
  holiday_name: string | null;
  holiday_type: HolidayType | null;
  is_holiday: boolean;
```

- [ ] **Step 5: Write and implement holiday classification tests**

Append to `src/features/attendance/calculations/rules.test.ts`:

```ts
test("holiday without attendance is holiday instead of absent", () => {
  assert.equal(classifyAttendanceCalculation({
    hasSchedule: true,
    isScheduledWorkday: true,
    isHoliday: true,
    attendanceExists: false,
    hasClockIn: false,
    hasClockOut: false,
    dateHasEnded: true,
  }), "holiday");
});

test("holiday completed attendance remains present", () => {
  assert.equal(classifyAttendanceCalculation({
    hasSchedule: true,
    isScheduledWorkday: false,
    isHoliday: true,
    attendanceExists: true,
    hasClockIn: true,
    hasClockOut: true,
    dateHasEnded: true,
  }), "present");
});

test("holiday missing clock-out remains missing clock-out", () => {
  assert.equal(classifyAttendanceCalculation({
    hasSchedule: true,
    isScheduledWorkday: true,
    isHoliday: true,
    attendanceExists: true,
    hasClockIn: true,
    hasClockOut: false,
    dateHasEnded: true,
  }), "missing_clock_out");
});
```

Modify the function input and first branch in `src/features/attendance/calculations/rules.ts`:

```ts
export function classifyAttendanceCalculation(input: {
  hasSchedule: boolean;
  isScheduledWorkday: boolean;
  isHoliday: boolean;
  attendanceExists: boolean;
  hasClockIn: boolean;
  hasClockOut: boolean;
  dateHasEnded: boolean;
}): AttendanceCalculationBaseStatus | null {
  if (input.isHoliday) {
    if (!input.attendanceExists) return "holiday";
    if (input.hasClockIn && !input.hasClockOut && input.dateHasEnded) {
      return "missing_clock_out";
    }
    return input.hasClockIn ? "present" : null;
  }
  if (!input.hasSchedule) {
    return input.attendanceExists ? "unscheduled_attendance" : null;
  }
  if (!input.isScheduledWorkday) {
    return input.attendanceExists ? "rest_day_worked" : null;
  }
  if (!input.attendanceExists) {
    return input.dateHasEnded ? "absent" : null;
  }
  if (input.hasClockIn && input.hasClockOut) return "present";
  if (input.hasClockIn && input.dateHasEnded) return "missing_clock_out";
  if (input.hasClockIn) return "present";
  return null;
}
```

Update all existing `classifyAttendanceCalculation` test inputs to include `isHoliday: false`.

- [ ] **Step 6: Run the focused tests**

Run:

```bash
npm test -- \
  src/features/overtime/rules.test.ts \
  src/features/attendance/calculations/rules.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the shared contracts and rules**

```bash
git add src/features/overtime src/features/attendance/calculations/types.ts src/features/attendance/calculations/rules.ts src/features/attendance/calculations/rules.test.ts
git commit -m "feat: add overtime rules and holiday attendance types"
```

---

### Task 3: Add protected overtime-policy and holiday-version database functions

**Files:**
- Modify: `supabase/migrations/202607150002_overtime_holidays.sql`
- Create: `src/features/overtime/security.test.ts`

**Interfaces:**
- Produces RPCs `create_overtime_policy_version`, `create_holiday`, and `replace_holiday_version`.
- Produces internal resolvers `resolve_overtime_policy` and `resolve_active_holiday`.
- `replace_holiday_version` consumes an expected active version ID for stale-write protection.

- [ ] **Step 1: Write failing security and function-contract tests**

Create `src/features/overtime/security.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL(
    "../../../supabase/migrations/202607150002_overtime_holidays.sql",
    import.meta.url,
  ),
  "utf8",
);

function functionBody(name: string) {
  return migration.match(
    new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\$\\$;`, "i"),
  )?.[0] ?? "";
}

test("policy and holiday mutations are protected security-definer functions", () => {
  for (const name of [
    "create_overtime_policy_version",
    "create_holiday",
    "replace_holiday_version",
  ]) {
    const body = functionBody(name);
    assert.match(body, /security definer/i);
    assert.match(body, /set search_path = pg_catalog, public/i);
    assert.match(body, /public\.is_hr_admin\(\)/i);
  }
});

test("policy resolver defaults to 30 minutes and is internal", () => {
  assert.match(migration, /create or replace function public\.resolve_overtime_policy/i);
  assert.match(migration, /null::uuid, 30::integer/i);
  assert.match(migration, /revoke all on function public\.resolve_overtime_policy/i);
});

test("holiday replacement locks and verifies the expected active version", () => {
  const body = functionBody("replace_holiday_version");
  assert.match(body, /lock table public\.holiday_calendar_groups/i);
  assert.match(body, /for update/i);
  assert.match(body, /HOLIDAY_VERSION_STALE/i);
  assert.match(body, /revision_number \+ 1/i);
});

test("holiday functions prevent duplicate active dates", () => {
  assert.match(functionBody("create_holiday"), /HOLIDAY_DATE_EXISTS/i);
  assert.match(functionBody("replace_holiday_version"), /HOLIDAY_DATE_EXISTS/i);
  assert.match(migration, /active_version_id = version\.id/i);
});

test("protected reasons never enter audit JSON", () => {
  for (const privateName of ["p_change_reason", "v_reason"]) {
    assert.doesNotMatch(
      migration,
      new RegExp(`write_employee_audit\\([^;]+${privateName}`, "i"),
    );
  }
});
```

- [ ] **Step 2: Run the tests and verify missing-function failures**

Run:

```bash
npm test -- src/features/overtime/security.test.ts
```

Expected: FAIL because the functions are not yet present.

- [ ] **Step 3: Append the policy resolver and creation RPC**

Append to `supabase/migrations/202607150002_overtime_holidays.sql`:

```sql
create or replace function public.resolve_overtime_policy(
  p_attendance_date date
)
returns table(
  overtime_policy_version_id uuid,
  minimum_qualifying_minutes integer
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  return query
  select policy.id, policy.minimum_qualifying_minutes
  from public.overtime_policy_versions as policy
  where policy.effective_date <= p_attendance_date
  order by policy.effective_date desc, policy.id desc
  limit 1;

  if not found then
    return query select null::uuid, 30::integer;
  end if;
end;
$$;

revoke all on function public.resolve_overtime_policy(date)
  from public, anon, authenticated;

create or replace function public.create_overtime_policy_version(
  p_effective_date date,
  p_minimum_qualifying_minutes integer,
  p_change_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_reason text := nullif(btrim(coalesce(p_change_reason, '')), '');
  v_policy_id uuid;
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
  end if;
  if p_effective_date is null then
    raise exception using errcode = 'P0001', message = 'OVERTIME_POLICY_DATE_REQUIRED';
  end if;
  if p_minimum_qualifying_minutes is null
    or p_minimum_qualifying_minutes < 1
    or p_minimum_qualifying_minutes > 480 then
    raise exception using errcode = 'P0001', message = 'OVERTIME_POLICY_MINIMUM_OUT_OF_RANGE';
  end if;
  if p_effective_date < public.company_attendance_date(now()) and v_reason is null then
    raise exception using errcode = 'P0001', message = 'OVERTIME_POLICY_REASON_REQUIRED';
  end if;
  if v_reason is not null and char_length(v_reason) > 1000 then
    raise exception using errcode = 'P0001', message = 'PRIVATE_TEXT_TOO_LONG';
  end if;

  insert into public.overtime_policy_versions (
    effective_date,
    minimum_qualifying_minutes,
    created_by,
    change_reason
  ) values (
    p_effective_date,
    p_minimum_qualifying_minutes,
    v_actor,
    v_reason
  )
  returning id into v_policy_id;

  perform public.write_employee_audit(
    null,
    'overtime_policy.created',
    'overtime_policy',
    v_policy_id,
    jsonb_build_array('effective_date', 'minimum_qualifying_minutes'),
    '{}'::jsonb,
    jsonb_build_object(
      'effective_date', p_effective_date,
      'minimum_qualifying_minutes', p_minimum_qualifying_minutes,
      'policy_version_id', v_policy_id
    ),
    '{}'::jsonb,
    'application',
    v_actor
  );

  return v_policy_id;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'OVERTIME_POLICY_EFFECTIVE_DATE_EXISTS';
end;
$$;

revoke all on function public.create_overtime_policy_version(date, integer, text)
  from public, anon;
grant execute on function public.create_overtime_policy_version(date, integer, text)
  to authenticated;
```

- [ ] **Step 4: Append the active holiday resolver**

```sql
create or replace function public.resolve_active_holiday(
  p_holiday_date date
)
returns table(
  holiday_version_id uuid,
  holiday_name text,
  holiday_type text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select version.id, version.holiday_name, version.holiday_type
  from public.holiday_calendar_groups as group_row
  join public.holiday_calendar_versions as version
    on version.id = group_row.active_version_id
   and version.holiday_group_id = group_row.id
  where version.holiday_date = p_holiday_date
    and version.is_active
  order by version.created_at desc, version.id desc
  limit 1;
$$;

revoke all on function public.resolve_active_holiday(date)
  from public, anon, authenticated;
```

- [ ] **Step 5: Append immutable holiday creation**

```sql
create or replace function public.create_holiday(
  p_holiday_date date,
  p_holiday_name text,
  p_holiday_type text,
  p_change_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_name text := nullif(btrim(coalesce(p_holiday_name, '')), '');
  v_reason text := nullif(btrim(coalesce(p_change_reason, '')), '');
  v_group_id uuid;
  v_version_id uuid;
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
  end if;
  if p_holiday_date is null then
    raise exception using errcode = 'P0001', message = 'HOLIDAY_DATE_REQUIRED';
  end if;
  if v_name is null or char_length(v_name) > 160 then
    raise exception using errcode = 'P0001', message = 'HOLIDAY_NAME_INVALID';
  end if;
  if p_holiday_type not in (
    'regular_holiday',
    'special_non_working_holiday',
    'company_holiday'
  ) then
    raise exception using errcode = 'P0001', message = 'HOLIDAY_TYPE_INVALID';
  end if;
  if p_holiday_date <= public.company_attendance_date(now()) and v_reason is null then
    raise exception using errcode = 'P0001', message = 'HOLIDAY_REASON_REQUIRED';
  end if;
  if v_reason is not null and char_length(v_reason) > 1000 then
    raise exception using errcode = 'P0001', message = 'PRIVATE_TEXT_TOO_LONG';
  end if;

  lock table public.holiday_calendar_groups in share row exclusive mode;

  if exists (
    select 1
    from public.holiday_calendar_groups as group_row
    join public.holiday_calendar_versions as version
      on version.id = group_row.active_version_id
    where version.holiday_date = p_holiday_date
      and version.is_active
  ) then
    raise exception using errcode = 'P0001', message = 'HOLIDAY_DATE_EXISTS';
  end if;

  insert into public.holiday_calendar_groups (
    created_by
  ) values (
    v_actor
  ) returning id into v_group_id;

  insert into public.holiday_calendar_versions (
    holiday_group_id,
    revision_number,
    holiday_date,
    holiday_name,
    holiday_type,
    is_active,
    created_by,
    change_reason
  ) values (
    v_group_id,
    1,
    p_holiday_date,
    v_name,
    p_holiday_type,
    true,
    v_actor,
    v_reason
  ) returning id into v_version_id;

  update public.holiday_calendar_groups
  set active_version_id = v_version_id,
      updated_at = now()
  where id = v_group_id;

  perform public.write_employee_audit(
    null,
    'holiday.created',
    'holiday_calendar',
    v_group_id,
    jsonb_build_array(
      'holiday_date', 'holiday_name', 'holiday_type', 'revision_number'
    ),
    '{}'::jsonb,
    jsonb_build_object(
      'holiday_group_id', v_group_id,
      'holiday_version_id', v_version_id,
      'holiday_date', p_holiday_date,
      'holiday_name', v_name,
      'holiday_type', p_holiday_type,
      'revision_number', 1,
      'is_active', true
    ),
    '{}'::jsonb,
    'application',
    v_actor
  );

  return v_group_id;
end;
$$;

revoke all on function public.create_holiday(date, text, text, text)
  from public, anon;
grant execute on function public.create_holiday(date, text, text, text)
  to authenticated;
```

- [ ] **Step 6: Append immutable holiday replacement/deactivation**

```sql
create or replace function public.replace_holiday_version(
  p_holiday_group_id uuid,
  p_expected_active_version_id uuid,
  p_holiday_date date,
  p_holiday_name text,
  p_holiday_type text,
  p_is_active boolean,
  p_change_reason text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_name text := nullif(btrim(coalesce(p_holiday_name, '')), '');
  v_reason text := nullif(btrim(coalesce(p_change_reason, '')), '');
  v_group public.holiday_calendar_groups%rowtype;
  v_active public.holiday_calendar_versions%rowtype;
  v_version_id uuid;
  v_revision_number integer;
  v_action text;
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
  end if;
  if p_holiday_group_id is null or p_expected_active_version_id is null then
    raise exception using errcode = 'P0001', message = 'HOLIDAY_INPUT_INVALID';
  end if;
  if p_holiday_date is null then
    raise exception using errcode = 'P0001', message = 'HOLIDAY_DATE_REQUIRED';
  end if;
  if v_name is null or char_length(v_name) > 160 then
    raise exception using errcode = 'P0001', message = 'HOLIDAY_NAME_INVALID';
  end if;
  if p_holiday_type not in (
    'regular_holiday',
    'special_non_working_holiday',
    'company_holiday'
  ) then
    raise exception using errcode = 'P0001', message = 'HOLIDAY_TYPE_INVALID';
  end if;
  if p_holiday_date <= public.company_attendance_date(now()) and v_reason is null then
    raise exception using errcode = 'P0001', message = 'HOLIDAY_REASON_REQUIRED';
  end if;
  if char_length(v_reason) > 1000 then
    raise exception using errcode = 'P0001', message = 'PRIVATE_TEXT_TOO_LONG';
  end if;

  lock table public.holiday_calendar_groups in share row exclusive mode;

  select * into v_group
  from public.holiday_calendar_groups
  where id = p_holiday_group_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'HOLIDAY_NOT_FOUND';
  end if;
  if v_group.active_version_id is distinct from p_expected_active_version_id then
    raise exception using errcode = 'P0001', message = 'HOLIDAY_VERSION_STALE';
  end if;

  select * into v_active
  from public.holiday_calendar_versions
  where id = v_group.active_version_id
    and holiday_group_id = v_group.id;

  if not found then
    raise exception using errcode = 'P0001', message = 'HOLIDAY_VERSION_STALE';
  end if;

  if p_is_active and exists (
    select 1
    from public.holiday_calendar_groups as other_group
    join public.holiday_calendar_versions as version
      on version.id = other_group.active_version_id
    where other_group.id <> v_group.id
      and version.holiday_date = p_holiday_date
      and version.is_active
  ) then
    raise exception using errcode = 'P0001', message = 'HOLIDAY_DATE_EXISTS';
  end if;

  v_revision_number := v_active.revision_number + 1;

  insert into public.holiday_calendar_versions (
    holiday_group_id,
    revision_number,
    holiday_date,
    holiday_name,
    holiday_type,
    is_active,
    created_by,
    change_reason
  ) values (
    v_group.id,
    v_revision_number,
    p_holiday_date,
    v_name,
    p_holiday_type,
    p_is_active,
    v_actor,
    v_reason
  ) returning id into v_version_id;

  update public.holiday_calendar_groups
  set active_version_id = v_version_id,
      updated_at = now()
  where id = v_group.id;

  v_action := case when p_is_active
    then 'holiday.replaced'
    else 'holiday.deactivated'
  end;

  perform public.write_employee_audit(
    null,
    v_action,
    'holiday_calendar',
    v_group.id,
    jsonb_build_array(
      'holiday_date', 'holiday_name', 'holiday_type',
      'revision_number', 'is_active'
    ),
    jsonb_build_object(
      'holiday_version_id', v_active.id,
      'holiday_date', v_active.holiday_date,
      'holiday_name', v_active.holiday_name,
      'holiday_type', v_active.holiday_type,
      'revision_number', v_active.revision_number,
      'is_active', v_active.is_active
    ),
    jsonb_build_object(
      'holiday_version_id', v_version_id,
      'holiday_date', p_holiday_date,
      'holiday_name', v_name,
      'holiday_type', p_holiday_type,
      'revision_number', v_revision_number,
      'is_active', p_is_active
    ),
    '{}'::jsonb,
    'application',
    v_actor
  );

  return v_version_id;
end;
$$;

revoke all on function public.replace_holiday_version(
  uuid, uuid, date, text, text, boolean, text
) from public, anon;
grant execute on function public.replace_holiday_version(
  uuid, uuid, date, text, text, boolean, text
) to authenticated;
```

- [ ] **Step 7: Run the focused tests**

Run:

```bash
npm test -- \
  src/features/overtime/migration.test.ts \
  src/features/overtime/security.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit the protected source-management functions**

```bash
git add supabase/migrations/202607150002_overtime_holidays.sql src/features/overtime/security.test.ts
git commit -m "feat: add overtime policy and holiday RPCs"
```

---
### Task 4: Build effective-dated overtime policy management

**Files:**
- Create: `src/features/overtime/policy/validation.ts`
- Create: `src/features/overtime/policy/validation.test.ts`
- Create: `src/features/overtime/policy/queries.ts`
- Create: `src/features/overtime/policy/queries.test.ts`
- Create: `src/app/(dashboard)/settings/overtime-policy/actions.ts`
- Create: `src/app/(dashboard)/settings/overtime-policy/page.tsx`
- Create: `src/app/(dashboard)/settings/overtime-policy/new/page.tsx`
- Create: `src/components/overtime/overtime-policy-form.tsx`

**Interfaces:**
- Consumes RPC `create_overtime_policy_version(date, integer, text)`.
- Produces HR-only routes `/settings/overtime-policy` and `/settings/overtime-policy/new`.
- Exposes current, upcoming, and historical immutable versions with the implicit 30-minute default.

- [ ] **Step 1: Write validation tests**

Create `src/features/overtime/policy/validation.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { validateOvertimePolicyVersion } from "./validation.ts";

function form(date: string, minutes: string, reason = "") {
  const data = new FormData();
  data.set("effective_date", date);
  data.set("minimum_qualifying_minutes", minutes);
  data.set("change_reason", reason);
  return data;
}

test("overtime policy requires an integer from one through 480", () => {
  assert.equal(validateOvertimePolicyVersion(form("", "30"), "2026-07-15").data, undefined);
  assert.equal(validateOvertimePolicyVersion(form("2026-07-15", "0"), "2026-07-15").data, undefined);
  assert.equal(validateOvertimePolicyVersion(form("2026-07-15", "30.5"), "2026-07-15").data, undefined);
  assert.equal(validateOvertimePolicyVersion(form("2026-07-15", "481"), "2026-07-15").data, undefined);
  assert.equal(
    validateOvertimePolicyVersion(form("2026-07-15", "480"), "2026-07-15").data?.minimumQualifyingMinutes,
    480,
  );
});

test("backdated overtime policy requires a private reason", () => {
  assert.equal(validateOvertimePolicyVersion(form("2026-07-14", "30"), "2026-07-15").data, undefined);
  assert.equal(
    validateOvertimePolicyVersion(form("2026-07-14", "30", "  correction  "), "2026-07-15").data?.changeReason,
    "correction",
  );
});

test("private policy reasons are not echoed in retry state", () => {
  const sentinel = "PRIVATE_OVERTIME_POLICY_REASON";
  const result = validateOvertimePolicyVersion(form("", "30", sentinel), "2026-07-15");
  assert.doesNotMatch(JSON.stringify(result.state), new RegExp(sentinel));
});
```

- [ ] **Step 2: Implement policy validation**

Create `src/features/overtime/policy/validation.ts`:

```ts
import { companyDateAt } from "../../attendance/time.ts";
import type { OvertimePolicyActionState } from "./types.ts";

export function validateOvertimePolicyVersion(
  formData: FormData,
  companyDate = companyDateAt(),
): {
  data?: {
    effectiveDate: string;
    minimumQualifyingMinutes: number;
    changeReason: string | null;
  };
  state?: OvertimePolicyActionState;
} {
  const effectiveDate = String(formData.get("effective_date") ?? "").trim();
  const minutesText = String(
    formData.get("minimum_qualifying_minutes") ?? "",
  ).trim();
  const changeReason = String(formData.get("change_reason") ?? "").trim() || null;
  const minimumQualifyingMinutes = Number(minutesText);
  const fieldErrors: Record<string, string> = {};

  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
    fieldErrors.effective_date = "Effective date is required.";
  }
  if (
    !Number.isInteger(minimumQualifyingMinutes)
    || minimumQualifyingMinutes < 1
    || minimumQualifyingMinutes > 480
  ) {
    fieldErrors.minimum_qualifying_minutes =
      "Minimum qualifying time must be a whole number from 1 to 480.";
  }
  if (effectiveDate && effectiveDate < companyDate && !changeReason) {
    fieldErrors.change_reason = "A reason is required for a backdated policy.";
  }
  if (changeReason && changeReason.length > 1000) {
    fieldErrors.change_reason = "Reason must be 1,000 characters or fewer.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      state: {
        error: "Please correct the highlighted fields.",
        fieldErrors,
        values: {
          effectiveDate,
          minimumQualifyingMinutes: minutesText,
        },
      },
    };
  }

  return {
    data: {
      effectiveDate,
      minimumQualifyingMinutes,
      changeReason,
    },
  };
}
```

- [ ] **Step 3: Write query contract tests**

Create `src/features/overtime/policy/queries.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./queries.ts", import.meta.url), "utf8");

test("overtime policy queries are server-only and explicitly join creators", () => {
  assert.match(source, /import "server-only"/);
  assert.match(source, /overtime_policy_versions/);
  assert.match(source, /profiles!overtime_policy_versions_created_by_fkey/);
});

test("policy query separates current, upcoming, and history", () => {
  assert.match(source, /effective_date <= companyDate/);
  assert.match(source, /effective_date > companyDate/);
});
```

- [ ] **Step 4: Implement policy queries**

Create `src/features/overtime/policy/queries.ts`:

```ts
import "server-only";

import { companyDateAt } from "@/features/attendance/time";
import { createClient } from "@/lib/supabase/server";
import type { OvertimePolicyVersion } from "./types";

const policySelect = `
  id,effective_date,minimum_qualifying_minutes,created_by,created_at,change_reason,
  creator:profiles!overtime_policy_versions_created_by_fkey(
    id,display_name,first_name,last_name
  )
`;

export async function getOvertimePolicyVersions(): Promise<{
  current: OvertimePolicyVersion | null;
  upcoming: OvertimePolicyVersion[];
  history: OvertimePolicyVersion[];
}> {
  const supabase = await createClient();
  const companyDate = companyDateAt();
  const { data, error } = await supabase
    .from("overtime_policy_versions")
    .select(policySelect)
    .order("effective_date", { ascending: false });

  if (error) throw new Error("Unable to load overtime policies.");
  const rows = (data ?? []) as unknown as OvertimePolicyVersion[];
  return {
    current: rows.find((row) => row.effective_date <= companyDate) ?? null,
    upcoming: rows.filter((row) => row.effective_date > companyDate),
    history: rows.filter((row) => row.effective_date <= companyDate),
  };
}
```

- [ ] **Step 5: Implement the protected Server Action**

Create `src/app/(dashboard)/settings/overtime-policy/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAttendanceAdmin } from "@/features/attendance/auth";
import type { OvertimePolicyActionState } from "@/features/overtime/policy/types";
import { validateOvertimePolicyVersion } from "@/features/overtime/policy/validation";

function policyError(message: string) {
  if (message.includes("OVERTIME_POLICY_EFFECTIVE_DATE_EXISTS")) {
    return "An overtime policy already exists for this effective date.";
  }
  if (message.includes("OVERTIME_POLICY_REASON_REQUIRED")) {
    return "A reason is required for a backdated policy.";
  }
  if (message.includes("OVERTIME_POLICY_MINIMUM_OUT_OF_RANGE")) {
    return "Minimum qualifying time must be a whole number from 1 to 480.";
  }
  if (message.includes("PRIVATE_TEXT_TOO_LONG")) {
    return "Reason must be 1,000 characters or fewer.";
  }
  return "The overtime policy could not be saved.";
}

export async function createOvertimePolicyVersion(
  _state: OvertimePolicyActionState,
  formData: FormData,
): Promise<OvertimePolicyActionState> {
  const { supabase } = await requireAttendanceAdmin();
  const validation = validateOvertimePolicyVersion(formData);
  if (!validation.data) {
    return validation.state ?? { error: "Invalid overtime policy." };
  }

  const { error } = await supabase.rpc("create_overtime_policy_version", {
    p_effective_date: validation.data.effectiveDate,
    p_minimum_qualifying_minutes:
      validation.data.minimumQualifyingMinutes,
    p_change_reason: validation.data.changeReason,
  });

  if (error) {
    return {
      error: policyError(error.message),
      values: {
        effectiveDate: validation.data.effectiveDate,
        minimumQualifyingMinutes: String(
          validation.data.minimumQualifyingMinutes,
        ),
      },
    };
  }

  revalidatePath("/settings/overtime-policy");
  revalidatePath("/admin/overtime");
  revalidatePath("/overtime");
  revalidatePath("/attendance");
  revalidatePath("/admin/attendance");
  redirect("/settings/overtime-policy?success=created");
}
```

- [ ] **Step 6: Implement the policy form**

Create `src/components/overtime/overtime-policy-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import type { OvertimePolicyActionState } from "@/features/overtime/policy/types";

const initialState: OvertimePolicyActionState = {};

export function OvertimePolicyForm({
  action,
  companyDate,
}: {
  action: (
    state: OvertimePolicyActionState,
    formData: FormData,
  ) => Promise<OvertimePolicyActionState>;
  companyDate: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="card form-card">
      <div className="form-grid">
        <label>
          <span>Effective date</span>
          <input
            className="field"
            type="date"
            name="effective_date"
            defaultValue={state.values?.effectiveDate ?? companyDate}
            required
          />
          {state.fieldErrors?.effective_date && (
            <span className="form-error">{state.fieldErrors.effective_date}</span>
          )}
        </label>
        <label>
          <span>Minimum qualifying minutes</span>
          <input
            className="field"
            type="number"
            name="minimum_qualifying_minutes"
            min={1}
            max={480}
            step={1}
            defaultValue={state.values?.minimumQualifyingMinutes ?? "30"}
            required
          />
          {state.fieldErrors?.minimum_qualifying_minutes && (
            <span className="form-error">
              {state.fieldErrors.minimum_qualifying_minutes}
            </span>
          )}
        </label>
        <label className="full">
          <span>
            Change reason <span className="muted">(required when backdated)</span>
          </span>
          <textarea className="field" name="change_reason" maxLength={1000} rows={4} />
          {state.fieldErrors?.change_reason && (
            <span className="form-error">{state.fieldErrors.change_reason}</span>
          )}
        </label>
      </div>
      <p className="info-callout">
        Existing overtime detections will not change automatically. Run explicit
        overtime recalculation for affected finalized dates after saving.
      </p>
      {state.error && <p className="form-error">{state.error}</p>}
      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Create policy version"}
      </button>
    </form>
  );
}
```

- [ ] **Step 7: Implement the list and create pages**

Create `src/app/(dashboard)/settings/overtime-policy/page.tsx`:

```tsx
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireAttendanceAdmin } from "@/features/attendance/auth";
import {
  formatCompanyDate,
  formatCompanyDateTime,
} from "@/features/attendance/time";
import { getOvertimePolicyVersions } from "@/features/overtime/policy/queries";
import type { OvertimePolicyVersion } from "@/features/overtime/policy/types";

function creatorName(policy: OvertimePolicyVersion) {
  return policy.creator?.display_name
    || [policy.creator?.first_name, policy.creator?.last_name]
      .filter(Boolean)
      .join(" ")
    || "System";
}

function PolicyCard({
  policy,
  label,
}: {
  policy: OvertimePolicyVersion;
  label: string;
}) {
  return (
    <article className="card policy-card">
      <div className="card-header-row">
        <div>
          <span className="eyebrow">{label}</span>
          <h2>{policy.minimum_qualifying_minutes}-minute threshold</h2>
        </div>
        <span className="badge info">
          Effective {formatCompanyDate(policy.effective_date)}
        </span>
      </div>
      <dl className="detail-grid">
        <div><dt>Created by</dt><dd>{creatorName(policy)}</dd></div>
        <div><dt>Created</dt><dd>{formatCompanyDateTime(policy.created_at)}</dd></div>
      </dl>
      {policy.change_reason && (
        <p className="private-reason">
          <strong>Change reason:</strong> {policy.change_reason}
        </p>
      )}
    </article>
  );
}

export default async function OvertimePolicyPage() {
  await requireAttendanceAdmin();
  const policies = await getOvertimePolicyVersions();

  return (
    <>
      <PageHeader
        title="Overtime policy"
        description="Manage immutable, effective-dated overtime qualification rules."
        action={(
          <div className="header-actions">
            <Link className="btn" href="/settings">Back to settings</Link>
            <Link className="btn primary" href="/settings/overtime-policy/new">
              Create policy version
            </Link>
          </div>
        )}
      />
      {policies.current ? (
        <PolicyCard policy={policies.current} label="Current policy" />
      ) : (
        <div className="card empty-state">
          <h2>Implicit default policy</h2>
          <p>Minimum qualifying minutes: 30</p>
        </div>
      )}
      {policies.upcoming.length > 0 && (
        <section>
          <h2 className="section-title">Upcoming versions</h2>
          <div className="stack-list">
            {policies.upcoming.map((policy) => (
              <PolicyCard key={policy.id} policy={policy} label="Upcoming" />
            ))}
          </div>
        </section>
      )}
      <section>
        <h2 className="section-title">Policy history</h2>
        {policies.history.length > 0 ? (
          <div className="stack-list">
            {policies.history.map((policy) => (
              <PolicyCard key={policy.id} policy={policy} label="Historical version" />
            ))}
          </div>
        ) : (
          <p className="muted">No explicit policy versions yet.</p>
        )}
      </section>
    </>
  );
}
```

Create `src/app/(dashboard)/settings/overtime-policy/new/page.tsx`:

```tsx
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { OvertimePolicyForm } from "@/components/overtime/overtime-policy-form";
import { requireAttendanceAdmin } from "@/features/attendance/auth";
import { companyDateAt } from "@/features/attendance/time";
import { createOvertimePolicyVersion } from "../actions";

export default async function NewOvertimePolicyPage() {
  await requireAttendanceAdmin();
  return (
    <>
      <PageHeader
        title="Create overtime policy version"
        description="Set an immutable minimum qualifying threshold."
        action={<Link className="btn" href="/settings/overtime-policy">Back to policy</Link>}
      />
      <OvertimePolicyForm
        action={createOvertimePolicyVersion}
        companyDate={companyDateAt()}
      />
    </>
  );
}
```

- [ ] **Step 8: Run focused policy tests**

Run:

```bash
npm test -- \
  src/features/overtime/policy/validation.test.ts \
  src/features/overtime/policy/queries.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit the policy application slice**

```bash
git add src/features/overtime/policy src/app/'(dashboard)'/settings/overtime-policy src/components/overtime/overtime-policy-form.tsx
git commit -m "feat: add overtime policy management"
```

---

### Task 5: Build immutable holiday calendar management

**Files:**
- Create: `src/features/overtime/holidays/validation.ts`
- Create: `src/features/overtime/holidays/validation.test.ts`
- Create: `src/features/overtime/holidays/queries.ts`
- Create: `src/features/overtime/holidays/queries.test.ts`
- Create: `src/app/(dashboard)/settings/holidays/actions.ts`
- Create: `src/app/(dashboard)/settings/holidays/page.tsx`
- Create: `src/app/(dashboard)/settings/holidays/new/page.tsx`
- Create: `src/app/(dashboard)/settings/holidays/[holidayGroupId]/page.tsx`
- Create: `src/app/(dashboard)/settings/holidays/[holidayGroupId]/replace/page.tsx`
- Create: `src/components/overtime/holiday-form.tsx`
- Create: `src/components/overtime/holiday-replacement-form.tsx`

**Interfaces:**
- Consumes `create_holiday` and `replace_holiday_version` RPCs.
- Produces active holiday list, immutable version history, replacement, and deactivation workflows.
- Sends `expected_active_version_id` to prevent stale replacement.

- [ ] **Step 1: Write holiday validation tests**

Create `src/features/overtime/holidays/validation.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  validateHolidayCreate,
  validateHolidayReplacement,
} from "./validation.ts";

function createForm(
  date: string,
  name: string,
  type: string,
  reason = "",
) {
  const data = new FormData();
  data.set("holiday_date", date);
  data.set("holiday_name", name);
  data.set("holiday_type", type);
  data.set("change_reason", reason);
  return data;
}

test("holiday creation accepts all approved holiday types", () => {
  for (const type of [
    "regular_holiday",
    "special_non_working_holiday",
    "company_holiday",
  ]) {
    assert.equal(
      validateHolidayCreate(
        createForm("2026-07-16", "Holiday", type),
        "2026-07-15",
      ).data?.holidayType,
      type,
    );
  }
});

test("current and past holiday creation requires a reason", () => {
  assert.equal(
    validateHolidayCreate(
      createForm("2026-07-15", "Holiday", "company_holiday"),
      "2026-07-15",
    ).data,
    undefined,
  );
  assert.equal(
    validateHolidayCreate(
      createForm("2026-07-15", "Holiday", "company_holiday", "Company event"),
      "2026-07-15",
    ).data?.changeReason,
    "Company event",
  );
});

test("replacement validates concurrency, active state, and date-sensitive reason", () => {
  const invalid = new FormData();
  assert.equal(validateHolidayReplacement(invalid, "2026-07-15").data, undefined);

  const future = createForm(
    "2026-07-20",
    "Replacement Holiday",
    "regular_holiday",
  );
  future.set("expected_active_version_id", "11111111-1111-4111-8111-111111111111");
  future.set("is_active", "false");
  assert.equal(validateHolidayReplacement(future, "2026-07-15").data?.isActive, false);

  const current = createForm(
    "2026-07-15",
    "Replacement Holiday",
    "regular_holiday",
  );
  current.set("expected_active_version_id", "11111111-1111-4111-8111-111111111111");
  current.set("is_active", "true");
  assert.equal(validateHolidayReplacement(current, "2026-07-15").data, undefined);
});

test("private holiday reasons are never returned in retry state", () => {
  const sentinel = "PRIVATE_HOLIDAY_REASON";
  const result = validateHolidayCreate(
    createForm("", "Holiday", "company_holiday", sentinel),
    "2026-07-15",
  );
  assert.doesNotMatch(JSON.stringify(result.state), new RegExp(sentinel));
});
```

- [ ] **Step 2: Implement holiday validation**

Create `src/features/overtime/holidays/validation.ts`:

```ts
import { companyDateAt } from "../../attendance/time.ts";
import {
  holidayTypes,
  type HolidayActionState,
  type HolidayType,
} from "./types.ts";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function common(formData: FormData) {
  const holidayDate = String(formData.get("holiday_date") ?? "").trim();
  const holidayName = String(formData.get("holiday_name") ?? "").trim();
  const holidayType = String(formData.get("holiday_type") ?? "").trim();
  const changeReason = String(formData.get("change_reason") ?? "").trim();
  const fieldErrors: Record<string, string> = {};

  if (!/^\d{4}-\d{2}-\d{2}$/.test(holidayDate)) {
    fieldErrors.holiday_date = "Holiday date is required.";
  }
  if (!holidayName || holidayName.length > 160) {
    fieldErrors.holiday_name = "Holiday name must be 1 to 160 characters.";
  }
  if (!holidayTypes.includes(holidayType as HolidayType)) {
    fieldErrors.holiday_type = "Choose a valid holiday type.";
  }
  if (changeReason.length > 1000) {
    fieldErrors.change_reason = "Reason must be 1,000 characters or fewer.";
  }

  return {
    holidayDate,
    holidayName,
    holidayType,
    changeReason,
    fieldErrors,
  };
}

export function validateHolidayCreate(
  formData: FormData,
  companyDate = companyDateAt(),
): {
  data?: {
    holidayDate: string;
    holidayName: string;
    holidayType: HolidayType;
    changeReason: string | null;
  };
  state?: HolidayActionState;
} {
  const input = common(formData);
  if (
    input.holidayDate
    && input.holidayDate <= companyDate
    && !input.changeReason
  ) {
    input.fieldErrors.change_reason =
      "A reason is required for a current or past holiday.";
  }

  if (Object.keys(input.fieldErrors).length > 0) {
    return {
      state: {
        error: "Please correct the highlighted fields.",
        fieldErrors: input.fieldErrors,
        values: {
          holidayDate: input.holidayDate,
          holidayName: input.holidayName,
          holidayType: holidayTypes.includes(input.holidayType as HolidayType)
            ? input.holidayType as HolidayType
            : undefined,
        },
      },
    };
  }

  return {
    data: {
      holidayDate: input.holidayDate,
      holidayName: input.holidayName,
      holidayType: input.holidayType as HolidayType,
      changeReason: input.changeReason || null,
    },
  };
}

export function validateHolidayReplacement(
  formData: FormData,
  companyDate = companyDateAt(),
): {
  data?: {
    expectedActiveVersionId: string;
    holidayDate: string;
    holidayName: string;
    holidayType: HolidayType;
    isActive: boolean;
    changeReason: string | null;
  };
  state?: HolidayActionState;
} {
  const input = common(formData);
  const expectedActiveVersionId = String(
    formData.get("expected_active_version_id") ?? "",
  ).trim();
  const isActiveText = String(formData.get("is_active") ?? "").trim();

  if (!uuid.test(expectedActiveVersionId)) {
    input.fieldErrors.expected_active_version_id =
      "The holiday version changed. Reload and try again.";
  }
  if (isActiveText !== "true" && isActiveText !== "false") {
    input.fieldErrors.is_active = "Choose active or deactivated.";
  }
  if (
    input.holidayDate
    && input.holidayDate <= companyDate
    && !input.changeReason
  ) {
    input.fieldErrors.change_reason =
      "A reason is required for a current or past holiday change.";
  }

  if (Object.keys(input.fieldErrors).length > 0) {
    return {
      state: {
        error: "Please correct the highlighted fields.",
        fieldErrors: input.fieldErrors,
        values: {
          holidayDate: input.holidayDate,
          holidayName: input.holidayName,
          holidayType: holidayTypes.includes(input.holidayType as HolidayType)
            ? input.holidayType as HolidayType
            : undefined,
          isActive: isActiveText === "false" ? "false" : "true",
        },
      },
    };
  }

  return {
    data: {
      expectedActiveVersionId,
      holidayDate: input.holidayDate,
      holidayName: input.holidayName,
      holidayType: input.holidayType as HolidayType,
      isActive: isActiveText === "true",
      changeReason: input.changeReason || null,
    },
  };
}
```

- [ ] **Step 3: Implement server-only holiday queries**

Create `src/features/overtime/holidays/queries.ts`:

```ts
import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  HolidayCalendarGroup,
  HolidayCalendarVersion,
} from "./types";

const versionSelect = `
  id,holiday_group_id,revision_number,holiday_date,holiday_name,
  holiday_type,is_active,created_by,created_at,change_reason,
  creator:profiles!holiday_calendar_versions_created_by_fkey(
    id,display_name,first_name,last_name
  )
`;

export async function getHolidayCalendarGroups(): Promise<HolidayCalendarGroup[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("holiday_calendar_groups")
    .select(`
      id,active_version_id,created_by,created_at,updated_at,
      active_version:holiday_calendar_versions!holiday_calendar_groups_active_version_fkey(
        ${versionSelect}
      )
    `)
    .order("updated_at", { ascending: false });

  if (error) throw new Error("Unable to load holidays.");
  return (data ?? []) as unknown as HolidayCalendarGroup[];
}

export async function getHolidayCalendarGroup(
  holidayGroupId: string,
): Promise<{
  group: HolidayCalendarGroup | null;
  versions: HolidayCalendarVersion[];
}> {
  const supabase = await createClient();
  const { data: group, error: groupError } = await supabase
    .from("holiday_calendar_groups")
    .select(`
      id,active_version_id,created_by,created_at,updated_at,
      active_version:holiday_calendar_versions!holiday_calendar_groups_active_version_fkey(
        ${versionSelect}
      )
    `)
    .eq("id", holidayGroupId)
    .maybeSingle();

  if (groupError) throw new Error("Unable to load the holiday.");
  if (!group) return { group: null, versions: [] };

  const { data: versions, error: versionError } = await supabase
    .from("holiday_calendar_versions")
    .select(versionSelect)
    .eq("holiday_group_id", holidayGroupId)
    .order("revision_number", { ascending: false });

  if (versionError) throw new Error("Unable to load holiday history.");
  return {
    group: group as unknown as HolidayCalendarGroup,
    versions: (versions ?? []) as unknown as HolidayCalendarVersion[],
  };
}
```

Create `src/features/overtime/holidays/queries.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./queries.ts", import.meta.url), "utf8");

test("holiday queries are server-only and use the active pointer relationship", () => {
  assert.match(source, /import "server-only"/);
  assert.match(source, /holiday_calendar_groups_active_version_fkey/);
});

test("holiday history orders immutable revisions newest first", () => {
  assert.match(source, /holiday_calendar_versions/);
  assert.match(source, /order\("revision_number", \{ ascending: false \}\)/);
});
```

- [ ] **Step 4: Implement holiday actions with safe error mapping**

Create `src/app/(dashboard)/settings/holidays/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAttendanceAdmin } from "@/features/attendance/auth";
import type { HolidayActionState } from "@/features/overtime/holidays/types";
import {
  validateHolidayCreate,
  validateHolidayReplacement,
} from "@/features/overtime/holidays/validation";

function holidayError(message: string) {
  if (message.includes("HOLIDAY_DATE_EXISTS")) {
    return "An active holiday already exists for this date.";
  }
  if (message.includes("HOLIDAY_VERSION_STALE")) {
    return "This holiday changed while you were reviewing it.";
  }
  if (message.includes("HOLIDAY_REASON_REQUIRED")) {
    return "A reason is required for this holiday change.";
  }
  if (message.includes("HOLIDAY_NOT_FOUND")) {
    return "The holiday could not be found.";
  }
  if (message.includes("PRIVATE_TEXT_TOO_LONG")) {
    return "Reason must be 1,000 characters or fewer.";
  }
  return "The holiday could not be saved.";
}

function revalidateHolidayPaths(groupId?: string) {
  revalidatePath("/settings/holidays");
  if (groupId) revalidatePath(`/settings/holidays/${groupId}`);
  revalidatePath("/admin/overtime");
  revalidatePath("/overtime");
  revalidatePath("/attendance");
  revalidatePath("/admin/attendance");
}

export async function createHoliday(
  _state: HolidayActionState,
  formData: FormData,
): Promise<HolidayActionState> {
  const { supabase } = await requireAttendanceAdmin();
  const validation = validateHolidayCreate(formData);
  if (!validation.data) {
    return validation.state ?? { error: "Invalid holiday." };
  }

  const { data, error } = await supabase.rpc("create_holiday", {
    p_holiday_date: validation.data.holidayDate,
    p_holiday_name: validation.data.holidayName,
    p_holiday_type: validation.data.holidayType,
    p_change_reason: validation.data.changeReason,
  });

  if (error) {
    return {
      error: holidayError(error.message),
      values: {
        holidayDate: validation.data.holidayDate,
        holidayName: validation.data.holidayName,
        holidayType: validation.data.holidayType,
      },
    };
  }

  revalidateHolidayPaths(String(data));
  redirect(`/settings/holidays/${data}?success=created`);
}

export async function replaceHoliday(
  holidayGroupId: string,
  _state: HolidayActionState,
  formData: FormData,
): Promise<HolidayActionState> {
  const { supabase } = await requireAttendanceAdmin();
  const validation = validateHolidayReplacement(formData);
  if (!validation.data) {
    return validation.state ?? { error: "Invalid holiday replacement." };
  }

  const { error } = await supabase.rpc("replace_holiday_version", {
    p_holiday_group_id: holidayGroupId,
    p_expected_active_version_id: validation.data.expectedActiveVersionId,
    p_holiday_date: validation.data.holidayDate,
    p_holiday_name: validation.data.holidayName,
    p_holiday_type: validation.data.holidayType,
    p_is_active: validation.data.isActive,
    p_change_reason: validation.data.changeReason,
  });

  if (error) {
    return {
      error: holidayError(error.message),
      values: {
        holidayDate: validation.data.holidayDate,
        holidayName: validation.data.holidayName,
        holidayType: validation.data.holidayType,
        isActive: validation.data.isActive ? "true" : "false",
      },
    };
  }

  revalidateHolidayPaths(holidayGroupId);
  redirect(`/settings/holidays/${holidayGroupId}?success=replaced`);
}
```

- [ ] **Step 5: Implement create and replacement forms**

Create `src/components/overtime/holiday-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import type { HolidayActionState } from "@/features/overtime/holidays/types";

const initialState: HolidayActionState = {};

export function HolidayForm({
  action,
  companyDate,
}: {
  action: (
    state: HolidayActionState,
    formData: FormData,
  ) => Promise<HolidayActionState>;
  companyDate: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form action={formAction} className="card form-card">
      <div className="form-grid">
        <label>
          <span>Holiday date</span>
          <input className="field" type="date" name="holiday_date" defaultValue={state.values?.holidayDate ?? companyDate} required />
          {state.fieldErrors?.holiday_date && <span className="form-error">{state.fieldErrors.holiday_date}</span>}
        </label>
        <label>
          <span>Holiday type</span>
          <select className="field" name="holiday_type" defaultValue={state.values?.holidayType ?? "regular_holiday"}>
            <option value="regular_holiday">Regular Holiday</option>
            <option value="special_non_working_holiday">Special Non-Working Holiday</option>
            <option value="company_holiday">Company Holiday</option>
          </select>
          {state.fieldErrors?.holiday_type && <span className="form-error">{state.fieldErrors.holiday_type}</span>}
        </label>
        <label className="full">
          <span>Holiday name</span>
          <input className="field" name="holiday_name" maxLength={160} defaultValue={state.values?.holidayName ?? ""} required />
          {state.fieldErrors?.holiday_name && <span className="form-error">{state.fieldErrors.holiday_name}</span>}
        </label>
        <label className="full">
          <span>Change reason <span className="muted">(required for today or a past date)</span></span>
          <textarea className="field" name="change_reason" maxLength={1000} rows={4} />
          {state.fieldErrors?.change_reason && <span className="form-error">{state.fieldErrors.change_reason}</span>}
        </label>
      </div>
      <p className="info-callout">
        Existing finalized attendance and overtime results will not change automatically.
        Recalculate affected dates after saving.
      </p>
      {state.error && <p className="form-error">{state.error}</p>}
      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Create holiday"}
      </button>
    </form>
  );
}
```

Create `src/components/overtime/holiday-replacement-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import type {
  HolidayActionState,
  HolidayCalendarVersion,
} from "@/features/overtime/holidays/types";

const initialState: HolidayActionState = {};

export function HolidayReplacementForm({
  action,
  activeVersion,
}: {
  action: (
    state: HolidayActionState,
    formData: FormData,
  ) => Promise<HolidayActionState>;
  activeVersion: HolidayCalendarVersion;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form
      action={formAction}
      className="card form-card"
      onSubmit={(event) => {
        if (!window.confirm(
          "Replace this holiday version?\n\nThe previous version will remain immutable in history.",
        )) event.preventDefault();
      }}
    >
      <input type="hidden" name="expected_active_version_id" value={activeVersion.id} />
      <div className="form-grid">
        <label>
          <span>Replacement date</span>
          <input className="field" type="date" name="holiday_date" defaultValue={state.values?.holidayDate ?? activeVersion.holiday_date} required />
          {state.fieldErrors?.holiday_date && <span className="form-error">{state.fieldErrors.holiday_date}</span>}
        </label>
        <label>
          <span>Status</span>
          <select className="field" name="is_active" defaultValue={state.values?.isActive ?? String(activeVersion.is_active)}>
            <option value="true">Active</option>
            <option value="false">Deactivated</option>
          </select>
          {state.fieldErrors?.is_active && <span className="form-error">{state.fieldErrors.is_active}</span>}
        </label>
        <label>
          <span>Replacement type</span>
          <select className="field" name="holiday_type" defaultValue={state.values?.holidayType ?? activeVersion.holiday_type}>
            <option value="regular_holiday">Regular Holiday</option>
            <option value="special_non_working_holiday">Special Non-Working Holiday</option>
            <option value="company_holiday">Company Holiday</option>
          </select>
          {state.fieldErrors?.holiday_type && <span className="form-error">{state.fieldErrors.holiday_type}</span>}
        </label>
        <label>
          <span>Replacement name</span>
          <input className="field" name="holiday_name" maxLength={160} defaultValue={state.values?.holidayName ?? activeVersion.holiday_name} required />
          {state.fieldErrors?.holiday_name && <span className="form-error">{state.fieldErrors.holiday_name}</span>}
        </label>
        <label className="full">
          <span>Change reason</span>
          <textarea className="field" name="change_reason" maxLength={1000} rows={4} />
          <small className="muted">Required when the replacement date is today or earlier.</small>
          {state.fieldErrors?.change_reason && <span className="form-error">{state.fieldErrors.change_reason}</span>}
        </label>
      </div>
      <p className="info-callout">
        Existing finalized attendance and overtime results will not change automatically.
        Use attendance recalculation to refresh holiday classification and overtime
        recalculation to refresh detection from unchanged attendance inputs.
      </p>
      {state.error && <p className="form-error">{state.error}</p>}
      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? "Replacing…" : "Create replacement version"}
      </button>
    </form>
  );
}
```

- [ ] **Step 6: Implement holiday pages**

Create `src/app/(dashboard)/settings/holidays/page.tsx`:

```tsx
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireAttendanceAdmin } from "@/features/attendance/auth";
import { formatCompanyDate } from "@/features/attendance/time";
import { getHolidayCalendarGroups } from "@/features/overtime/holidays/queries";
import { holidayTypeLabel } from "@/features/overtime/presentation";

export default async function HolidaysPage() {
  await requireAttendanceAdmin();
  const groups = await getHolidayCalendarGroups();
  const sorted = [...groups].sort((left, right) =>
    (left.active_version?.holiday_date ?? "9999-12-31").localeCompare(
      right.active_version?.holiday_date ?? "9999-12-31",
    ),
  );

  return (
    <>
      <PageHeader
        title="Holiday calendar"
        description="Manage immutable regular, special non-working, and company holidays."
        action={(
          <div className="header-actions">
            <Link className="btn" href="/settings">Back to settings</Link>
            <Link className="btn primary" href="/settings/holidays/new">Create holiday</Link>
          </div>
        )}
      />
      {sorted.length === 0 ? (
        <div className="card empty-state"><h2>No holidays yet</h2><p>Create the first holiday calendar entry.</p></div>
      ) : (
        <div className="stack-list">
          {sorted.map((group) => {
            const version = group.active_version;
            return (
              <article className="card holiday-card" key={group.id}>
                <div>
                  <span className={`badge ${version?.is_active ? "success" : "warning"}`}>
                    {version?.is_active ? "Active" : "Deactivated"}
                  </span>
                  <h2>{version?.holiday_name ?? "Unavailable holiday"}</h2>
                  <p className="muted">
                    {version ? `${formatCompanyDate(version.holiday_date)} · ${holidayTypeLabel(version.holiday_type)}` : "No active version"}
                  </p>
                </div>
                <Link className="btn" href={`/settings/holidays/${group.id}`}>View history</Link>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
```

Create `src/app/(dashboard)/settings/holidays/new/page.tsx`:

```tsx
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { HolidayForm } from "@/components/overtime/holiday-form";
import { requireAttendanceAdmin } from "@/features/attendance/auth";
import { companyDateAt } from "@/features/attendance/time";
import { createHoliday } from "../actions";

export default async function NewHolidayPage() {
  await requireAttendanceAdmin();
  return (
    <>
      <PageHeader
        title="Create holiday"
        description="Create the first immutable version for a holiday calendar entry."
        action={<Link className="btn" href="/settings/holidays">Back to holidays</Link>}
      />
      <HolidayForm action={createHoliday} companyDate={companyDateAt()} />
    </>
  );
}
```

Create `src/app/(dashboard)/settings/holidays/[holidayGroupId]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { requireAttendanceAdmin } from "@/features/attendance/auth";
import { formatCompanyDate, formatCompanyDateTime } from "@/features/attendance/time";
import { getHolidayCalendarGroup } from "@/features/overtime/holidays/queries";
import { holidayTypeLabel } from "@/features/overtime/presentation";

export default async function HolidayDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ holidayGroupId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAttendanceAdmin();
  const [{ holidayGroupId }, query] = await Promise.all([params, searchParams]);
  const result = await getHolidayCalendarGroup(holidayGroupId);
  if (!result.group || !result.group.active_version) notFound();

  return (
    <>
      <PageHeader
        title={result.group.active_version.holiday_name}
        description="Review the current holiday and every immutable replacement version."
        action={(
          <div className="header-actions">
            <Link className="btn" href="/settings/holidays">Back to holidays</Link>
            <Link className="btn primary" href={`/settings/holidays/${holidayGroupId}/replace`}>Replace version</Link>
          </div>
        )}
      />
      {query.success === "created" && <p className="form-success">Holiday created.</p>}
      {query.success === "replaced" && <p className="form-success">Holiday replacement created.</p>}
      <div className="stack-list">
        {result.versions.map((version) => (
          <article className="card policy-card" key={version.id}>
            <div className="card-header-row">
              <div><span className="eyebrow">Revision {version.revision_number}</span><h2>{version.holiday_name}</h2></div>
              <span className={`badge ${version.id === result.group?.active_version_id ? "success" : "info"}`}>
                {version.id === result.group?.active_version_id ? "Current version" : "Historical version"}
              </span>
            </div>
            <dl className="detail-grid">
              <div><dt>Date</dt><dd>{formatCompanyDate(version.holiday_date)}</dd></div>
              <div><dt>Type</dt><dd>{holidayTypeLabel(version.holiday_type)}</dd></div>
              <div><dt>Lifecycle</dt><dd>{version.is_active ? "Active" : "Deactivated"}</dd></div>
              <div><dt>Created</dt><dd>{formatCompanyDateTime(version.created_at)}</dd></div>
            </dl>
            {version.change_reason && <p className="private-reason"><strong>Change reason:</strong> {version.change_reason}</p>}
          </article>
        ))}
      </div>
    </>
  );
}
```

Create `src/app/(dashboard)/settings/holidays/[holidayGroupId]/replace/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { HolidayReplacementForm } from "@/components/overtime/holiday-replacement-form";
import { requireAttendanceAdmin } from "@/features/attendance/auth";
import { getHolidayCalendarGroup } from "@/features/overtime/holidays/queries";
import { replaceHoliday } from "../../actions";

export default async function ReplaceHolidayPage({
  params,
}: {
  params: Promise<{ holidayGroupId: string }>;
}) {
  await requireAttendanceAdmin();
  const { holidayGroupId } = await params;
  const result = await getHolidayCalendarGroup(holidayGroupId);
  if (!result.group?.active_version) notFound();

  return (
    <>
      <PageHeader
        title="Replace holiday version"
        description="Create an immutable replacement or deactivation version."
        action={<Link className="btn" href={`/settings/holidays/${holidayGroupId}`}>Back to holiday</Link>}
      />
      <HolidayReplacementForm
        action={replaceHoliday.bind(null, holidayGroupId)}
        activeVersion={result.group.active_version}
      />
    </>
  );
}
```

- [ ] **Step 7: Add the holiday label helper required by the pages**

Create `src/features/overtime/presentation.ts` with:

```ts
import type { HolidayType } from "./holidays/types.ts";
import type {
  OvertimeApprovalStatus,
  OvertimeSegmentType,
} from "./types.ts";

export function holidayTypeLabel(type: HolidayType): string {
  const labels: Record<HolidayType, string> = {
    regular_holiday: "Regular Holiday",
    special_non_working_holiday: "Special Non-Working Holiday",
    company_holiday: "Company Holiday",
  };
  return labels[type];
}

export function overtimeSegmentLabel(type: OvertimeSegmentType): string {
  const labels: Record<OvertimeSegmentType, string> = {
    pre_shift: "Pre-shift overtime",
    post_shift: "Post-shift overtime",
    rest_day: "Rest-day overtime",
    holiday_work: "Holiday work",
  };
  return labels[type];
}

export function overtimeStatusLabel(status: OvertimeApprovalStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}
```

- [ ] **Step 8: Run holiday tests**

Run:

```bash
npm test -- \
  src/features/overtime/holidays/validation.test.ts \
  src/features/overtime/holidays/queries.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit holiday management**

```bash
git add src/features/overtime/holidays src/features/overtime/presentation.ts src/app/'(dashboard)'/settings/holidays src/components/overtime/holiday-form.tsx src/components/overtime/holiday-replacement-form.tsx
git commit -m "feat: add immutable holiday management"
```

---
### Task 6: Implement immutable overtime detection revisions and supersession

**Files:**
- Modify: `supabase/migrations/202607150002_overtime_holidays.sql`
- Modify: `src/features/overtime/migration.test.ts`
- Modify: `src/features/overtime/security.test.ts`

**Interfaces:**
- Produces internal `write_overtime_detection_revision(...) -> jsonb`.
- Produces required internal `calculate_overtime_for_attendance_day(employee_id, attendance_date, source, actor, reason) -> jsonb`.
- A writer result contains `changed`, `revision_created`, `approval_item_created`, and `approval_item_superseded` booleans for range metrics.
- Every segment is evaluated on every run so precedence changes can write zero-minute superseding revisions for old active groups.

- [ ] **Step 1: Add failing detection-engine tests**

Append to `src/features/overtime/migration.test.ts`:

```ts
test("detection writer locks groups and no-ops unchanged source snapshots", () => {
  assert.match(sql, /create or replace function public\.write_overtime_detection_revision/i);
  assert.match(sql, /from public\.overtime_detection_groups[\s\S]+for update/i);
  assert.match(sql, /is not distinct from p_attendance_calculation_revision_id/i);
  assert.match(sql, /'changed', false/i);
});

test("detection changes supersede old revisions and approval items atomically", () => {
  assert.match(sql, /update public\.overtime_detection_revisions[\s\S]+is_active = false/i);
  assert.match(sql, /update public\.overtime_approval_items[\s\S]+status = 'superseded'/i);
  assert.match(sql, /superseded_by_item_id = v_new_item_id/i);
  assert.match(sql, /active_revision_id = v_revision_id/i);
});

test("initial zero segments are skipped but existing zero segments are versioned", () => {
  const body = sql.match(/create or replace function public\.write_overtime_detection_revision[\s\S]*?\$\$;/i)?.[0] ?? "";
  assert.match(body, /if v_group_id is null and p_detected_minutes = 0 then/i);
  assert.match(body, /return jsonb_build_object\([\s\S]+'changed', false/i);
  assert.match(body, /insert into public\.overtime_detection_revisions/i);
});

test("single-day detector implements holiday then rest-day then scheduled precedence", () => {
  const body = sql.match(/create or replace function public\.calculate_overtime_for_attendance_day[\s\S]*?\$\$;/i)?.[0] ?? "";
  const holiday = body.indexOf("if v_holiday_version_id is not null then");
  const rest = body.indexOf("elsif not v_is_scheduled_workday then");
  const scheduled = body.indexOf("elsif v_attendance.scheduled_start_at is not null");
  assert.ok(holiday >= 0);
  assert.ok(rest > holiday);
  assert.ok(scheduled > rest);
});

test("detector stores below-threshold positive revisions without approval items", () => {
  const writer = sql.match(/create or replace function public\.write_overtime_detection_revision[\s\S]*?\$\$;/i)?.[0] ?? "";
  assert.match(writer, /if p_meets_threshold and p_detected_minutes > 0 then/i);
  assert.match(writer, /insert into public\.overtime_detection_revisions/i);
});

test("detector reuses finalized worked minutes for rest day and holiday work", () => {
  const body = sql.match(/create or replace function public\.calculate_overtime_for_attendance_day[\s\S]*?\$\$;/i)?.[0] ?? "";
  assert.match(body, /v_holiday_minutes := v_attendance\.worked_minutes/i);
  assert.match(body, /v_rest_minutes := v_attendance\.worked_minutes/i);
  assert.doesNotMatch(body, /break_minutes/i);
});
```

Append to `src/features/overtime/security.test.ts`:

```ts
test("detection helpers are security definer with fixed search paths and revoked", () => {
  for (const name of [
    "write_overtime_detection_revision",
    "calculate_overtime_for_attendance_day",
  ]) {
    const body = functionBody(name);
    assert.match(body, /security definer/i);
    assert.match(body, /set search_path = pg_catalog, public/i);
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}`, "i"));
  }
});

test("detection audit payload excludes recalculation reasons and protected review text", () => {
  const body = functionBody("write_overtime_detection_revision");
  assert.doesNotMatch(body, /write_employee_audit\([^;]+p_recalculation_reason/i);
  assert.doesNotMatch(body, /approval_note|rejection_reason/i);
});
```

- [ ] **Step 2: Run tests and verify missing-function failures**

Run:

```bash
npm test -- \
  src/features/overtime/migration.test.ts \
  src/features/overtime/security.test.ts
```

Expected: FAIL because detection functions do not exist.

- [ ] **Step 3: Add active-pointer validation for detection groups**

Append to `supabase/migrations/202607150002_overtime_holidays.sql`:

```sql
create or replace function public.validate_active_overtime_detection_revision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.active_revision_id is not null and not exists (
    select 1
    from public.overtime_detection_revisions as revision
    where revision.id = new.active_revision_id
      and revision.detection_group_id = new.id
      and revision.segment_type = new.segment_type
  ) then
    raise exception using errcode = 'P0001', message = 'OVERTIME_ACTIVE_REVISION_GROUP_MISMATCH';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_active_overtime_detection_revision()
  from public, anon, authenticated;

drop trigger if exists validate_active_overtime_detection_revision_trigger
  on public.overtime_detection_groups;
create constraint trigger validate_active_overtime_detection_revision_trigger
after insert or update of active_revision_id
on public.overtime_detection_groups
deferrable initially deferred
for each row execute function public.validate_active_overtime_detection_revision();
```

- [ ] **Step 4: Add the immutable detection writer**

Append:

```sql
create or replace function public.write_overtime_detection_revision(
  p_employee_id uuid,
  p_attendance_date date,
  p_segment_type text,
  p_attendance_calculation_revision_id uuid,
  p_attendance_record_id uuid,
  p_schedule_assignment_id uuid,
  p_schedule_version_id uuid,
  p_overtime_policy_version_id uuid,
  p_holiday_version_id uuid,
  p_detected_start_at timestamptz,
  p_detected_end_at timestamptz,
  p_detected_minutes integer,
  p_meets_threshold boolean,
  p_calculation_source text,
  p_calculated_by uuid,
  p_recalculation_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_recalculation_reason, '')), '');
  v_group_id uuid;
  v_current public.overtime_detection_revisions%rowtype;
  v_revision_id uuid;
  v_revision_number integer;
  v_new_item_id uuid;
  v_old_item_id uuid;
  v_item_created boolean := false;
  v_item_superseded boolean := false;
  v_action text;
begin
  if p_segment_type not in (
    'pre_shift', 'post_shift', 'rest_day', 'holiday_work'
  ) then
    raise exception using errcode = 'P0001', message = 'OVERTIME_SEGMENT_INVALID';
  end if;
  if p_detected_minutes is null or p_detected_minutes < 0 then
    raise exception using errcode = 'P0001', message = 'OVERTIME_MINUTES_INVALID';
  end if;
  if v_reason is not null and char_length(v_reason) > 1000 then
    raise exception using errcode = 'P0001', message = 'PRIVATE_TEXT_TOO_LONG';
  end if;

  select id into v_group_id
  from public.overtime_detection_groups
  where employee_id = p_employee_id
    and attendance_date = p_attendance_date
    and segment_type = p_segment_type;

  if v_group_id is null and p_detected_minutes = 0 then
    return jsonb_build_object(
      'changed', false,
      'revision_created', false,
      'approval_item_created', false,
      'approval_item_superseded', false
    );
  end if;

  if v_group_id is null then
    insert into public.overtime_detection_groups (
      employee_id,
      attendance_date,
      segment_type
    ) values (
      p_employee_id,
      p_attendance_date,
      p_segment_type
    )
    on conflict (employee_id, attendance_date, segment_type) do nothing;
  end if;

  select id into v_group_id
  from public.overtime_detection_groups
  where employee_id = p_employee_id
    and attendance_date = p_attendance_date
    and segment_type = p_segment_type
  for update;

  select revision.* into v_current
  from public.overtime_detection_groups as group_row
  join public.overtime_detection_revisions as revision
    on revision.id = group_row.active_revision_id
  where group_row.id = v_group_id;

  if found
    and v_current.attendance_calculation_revision_id
      is not distinct from p_attendance_calculation_revision_id
    and v_current.attendance_record_id
      is not distinct from p_attendance_record_id
    and v_current.schedule_assignment_id
      is not distinct from p_schedule_assignment_id
    and v_current.schedule_version_id
      is not distinct from p_schedule_version_id
    and v_current.overtime_policy_version_id
      is not distinct from p_overtime_policy_version_id
    and v_current.holiday_version_id
      is not distinct from p_holiday_version_id
    and v_current.segment_type = p_segment_type
    and v_current.detected_start_at
      is not distinct from p_detected_start_at
    and v_current.detected_end_at
      is not distinct from p_detected_end_at
    and v_current.detected_minutes = p_detected_minutes
    and v_current.meets_threshold = p_meets_threshold
    and v_current.is_active then
    return jsonb_build_object(
      'changed', false,
      'revision_created', false,
      'approval_item_created', false,
      'approval_item_superseded', false
    );
  end if;

  select coalesce(max(revision_number), 0) + 1
    into v_revision_number
  from public.overtime_detection_revisions
  where detection_group_id = v_group_id;

  if v_current.id is not null then
    update public.overtime_detection_revisions
    set is_active = false
    where id = v_current.id;
  end if;

  insert into public.overtime_detection_revisions (
    detection_group_id,
    revision_number,
    attendance_calculation_revision_id,
    attendance_record_id,
    schedule_assignment_id,
    schedule_version_id,
    overtime_policy_version_id,
    holiday_version_id,
    segment_type,
    detected_start_at,
    detected_end_at,
    detected_minutes,
    meets_threshold,
    is_active,
    calculation_source,
    calculated_by,
    recalculation_reason
  ) values (
    v_group_id,
    v_revision_number,
    p_attendance_calculation_revision_id,
    p_attendance_record_id,
    p_schedule_assignment_id,
    p_schedule_version_id,
    p_overtime_policy_version_id,
    p_holiday_version_id,
    p_segment_type,
    p_detected_start_at,
    p_detected_end_at,
    p_detected_minutes,
    p_meets_threshold,
    true,
    p_calculation_source,
    p_calculated_by,
    v_reason
  ) returning id into v_revision_id;

  if p_meets_threshold and p_detected_minutes > 0 then
    insert into public.overtime_approval_items (
      detection_revision_id,
      status,
      detected_minutes,
      approved_minutes
    ) values (
      v_revision_id,
      'pending',
      p_detected_minutes,
      0
    ) returning id into v_new_item_id;
    v_item_created := true;
  end if;

  if v_current.id is not null then
    select id into v_old_item_id
    from public.overtime_approval_items
    where detection_revision_id = v_current.id
      and status <> 'superseded'
    for update;

    if v_old_item_id is not null then
      update public.overtime_approval_items
      set status = 'superseded',
          superseded_at = now(),
          superseded_by_item_id = v_new_item_id
      where id = v_old_item_id;
      v_item_superseded := true;

      perform public.write_employee_audit(
        p_employee_id,
        'overtime_approval.superseded',
        'overtime_approval',
        v_old_item_id,
        jsonb_build_array('status'),
        jsonb_build_object('status', 'active'),
        jsonb_build_object(
          'status', 'superseded',
          'attendance_date', p_attendance_date,
          'segment_type', p_segment_type,
          'detected_minutes', v_current.detected_minutes,
          'revision_number', v_current.revision_number
        ),
        '{}'::jsonb,
        'application',
        p_calculated_by
      );
    end if;

    perform public.write_employee_audit(
      p_employee_id,
      'overtime_detection.superseded',
      'overtime_detection',
      v_current.id,
      jsonb_build_array('is_active'),
      jsonb_build_object('is_active', true),
      jsonb_build_object(
        'is_active', false,
        'attendance_date', p_attendance_date,
        'segment_type', p_segment_type,
        'detected_minutes', v_current.detected_minutes,
        'revision_number', v_current.revision_number
      ),
      '{}'::jsonb,
      'application',
      p_calculated_by
    );
  end if;

  update public.overtime_detection_groups
  set active_revision_id = v_revision_id,
      updated_at = now()
  where id = v_group_id;

  v_action := case
    when v_current.id is null then 'overtime_detection.created'
    else 'overtime_detection.recalculated'
  end;

  perform public.write_employee_audit(
    p_employee_id,
    v_action,
    'overtime_detection',
    v_revision_id,
    jsonb_build_array(
      'attendance_date',
      'segment_type',
      'detected_minutes',
      'meets_threshold',
      'revision_number'
    ),
    '{}'::jsonb,
    jsonb_build_object(
      'attendance_date', p_attendance_date,
      'segment_type', p_segment_type,
      'detected_minutes', p_detected_minutes,
      'meets_threshold', p_meets_threshold,
      'revision_number', v_revision_number,
      'policy_version_id', p_overtime_policy_version_id,
      'holiday_version_id', p_holiday_version_id,
      'calculation_source', p_calculation_source
    ),
    '{}'::jsonb,
    'application',
    p_calculated_by
  );

  return jsonb_build_object(
    'changed', true,
    'revision_created', true,
    'approval_item_created', v_item_created,
    'approval_item_superseded', v_item_superseded,
    'revision_id', v_revision_id,
    'approval_item_id', v_new_item_id
  );
end;
$$;

revoke all on function public.write_overtime_detection_revision(
  uuid, date, text, uuid, uuid, uuid, uuid, uuid, uuid,
  timestamptz, timestamptz, integer, boolean, text, uuid, text
) from public, anon, authenticated;
```

- [ ] **Step 5: Add the single-day detector with all precedence and cleanup rules**

Append:

```sql
create or replace function public.calculate_overtime_for_attendance_day(
  p_employee_id uuid,
  p_attendance_date date,
  p_source text,
  p_actor_profile_id uuid,
  p_recalculation_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_attendance public.attendance_calculation_revisions%rowtype;
  v_schedule public.work_schedule_versions%rowtype;
  v_attendance_found boolean := false;
  v_schedule_found boolean := false;
  v_policy_version_id uuid;
  v_minimum_minutes integer := 30;
  v_holiday_version_id uuid;
  v_holiday_name text;
  v_holiday_type text;
  v_weekday text;
  v_is_scheduled_workday boolean := false;
  v_is_complete boolean := false;
  v_pre_minutes integer := 0;
  v_post_minutes integer := 0;
  v_rest_minutes integer := 0;
  v_holiday_minutes integer := 0;
  v_write jsonb;
  v_revisions integer := 0;
  v_items integer := 0;
  v_superseded integer := 0;
  v_unchanged integer := 0;
begin
  if p_attendance_date is null
    or p_attendance_date > public.company_attendance_date(now()) then
    raise exception using errcode = 'P0001', message = 'FUTURE_ATTENDANCE_NOT_ALLOWED';
  end if;
  if p_source not in (
    'clock_in',
    'clock_out',
    'hr_create',
    'hr_correction',
    'correction_approval',
    'daily_finalization',
    'manual_recalculation',
    'manual_finalization',
    'overtime_recalculation'
  ) then
    raise exception using errcode = 'P0001', message = 'OVERTIME_SOURCE_INVALID';
  end if;

  select revision.* into v_attendance
  from public.attendance_calculation_groups as group_row
  join public.attendance_calculation_revisions as revision
    on revision.id = group_row.active_revision_id
  where group_row.employee_id = p_employee_id
    and group_row.attendance_date = p_attendance_date;
  v_attendance_found := found;

  if not v_attendance_found then
    return jsonb_build_object(
      'revisions_created', 0,
      'approval_items_created', 0,
      'approval_items_superseded', 0,
      'unchanged_segments', 4
    );
  end if;

  select overtime_policy_version_id, minimum_qualifying_minutes
    into v_policy_version_id, v_minimum_minutes
  from public.resolve_overtime_policy(p_attendance_date);

  select holiday_version_id, holiday_name, holiday_type
    into v_holiday_version_id, v_holiday_name, v_holiday_type
  from public.resolve_active_holiday(p_attendance_date);

  if v_attendance.schedule_version_id is not null then
    select * into v_schedule
    from public.work_schedule_versions
    where id = v_attendance.schedule_version_id;
    v_schedule_found := found;
  end if;

  v_weekday := lower(trim(to_char(p_attendance_date::timestamp, 'FMDay')));
  if v_schedule_found then
    v_is_scheduled_workday := v_weekday = any(v_schedule.working_days);
  end if;

  v_is_complete :=
    not v_attendance.is_provisional
    and v_attendance.actual_clock_in_at is not null
    and v_attendance.actual_clock_out_at is not null
    and v_attendance.worked_minutes is not null
    and v_attendance.base_status not in (
      'absent', 'holiday', 'missing_clock_out'
    );

  if v_is_complete then
    if v_holiday_version_id is not null then
      v_holiday_minutes := v_attendance.worked_minutes;
    elsif not v_is_scheduled_workday then
      if v_schedule_found then
        v_rest_minutes := v_attendance.worked_minutes;
      end if;
    elsif v_attendance.scheduled_start_at is not null
      and v_attendance.scheduled_end_at is not null then
      if v_attendance.actual_clock_in_at < v_attendance.scheduled_start_at then
        v_pre_minutes := greatest(
          0,
          floor(extract(epoch from (
            v_attendance.scheduled_start_at
            - v_attendance.actual_clock_in_at
          )) / 60)::integer
        );
      end if;
      if v_attendance.actual_clock_out_at > v_attendance.scheduled_end_at then
        v_post_minutes := greatest(
          0,
          floor(extract(epoch from (
            v_attendance.actual_clock_out_at
            - v_attendance.scheduled_end_at
          )) / 60)::integer
        );
      end if;
    end if;
  end if;

  v_write := public.write_overtime_detection_revision(
    p_employee_id,
    p_attendance_date,
    'pre_shift',
    v_attendance.id,
    v_attendance.attendance_record_id,
    v_attendance.schedule_assignment_id,
    v_attendance.schedule_version_id,
    v_policy_version_id,
    null,
    case when v_pre_minutes > 0 then v_attendance.actual_clock_in_at else null end,
    case when v_pre_minutes > 0 then v_attendance.scheduled_start_at else null end,
    v_pre_minutes,
    v_pre_minutes >= v_minimum_minutes,
    p_source,
    p_actor_profile_id,
    p_recalculation_reason
  );
  if coalesce((v_write ->> 'changed')::boolean, false) then v_revisions := v_revisions + 1; else v_unchanged := v_unchanged + 1; end if;
  if coalesce((v_write ->> 'approval_item_created')::boolean, false) then v_items := v_items + 1; end if;
  if coalesce((v_write ->> 'approval_item_superseded')::boolean, false) then v_superseded := v_superseded + 1; end if;

  v_write := public.write_overtime_detection_revision(
    p_employee_id,
    p_attendance_date,
    'post_shift',
    v_attendance.id,
    v_attendance.attendance_record_id,
    v_attendance.schedule_assignment_id,
    v_attendance.schedule_version_id,
    v_policy_version_id,
    null,
    case when v_post_minutes > 0 then v_attendance.scheduled_end_at else null end,
    case when v_post_minutes > 0 then v_attendance.actual_clock_out_at else null end,
    v_post_minutes,
    v_post_minutes >= v_minimum_minutes,
    p_source,
    p_actor_profile_id,
    p_recalculation_reason
  );
  if coalesce((v_write ->> 'changed')::boolean, false) then v_revisions := v_revisions + 1; else v_unchanged := v_unchanged + 1; end if;
  if coalesce((v_write ->> 'approval_item_created')::boolean, false) then v_items := v_items + 1; end if;
  if coalesce((v_write ->> 'approval_item_superseded')::boolean, false) then v_superseded := v_superseded + 1; end if;

  v_write := public.write_overtime_detection_revision(
    p_employee_id,
    p_attendance_date,
    'rest_day',
    v_attendance.id,
    v_attendance.attendance_record_id,
    v_attendance.schedule_assignment_id,
    v_attendance.schedule_version_id,
    v_policy_version_id,
    null,
    case when v_rest_minutes > 0 then v_attendance.actual_clock_in_at else null end,
    case when v_rest_minutes > 0 then v_attendance.actual_clock_out_at else null end,
    v_rest_minutes,
    v_rest_minutes >= v_minimum_minutes,
    p_source,
    p_actor_profile_id,
    p_recalculation_reason
  );
  if coalesce((v_write ->> 'changed')::boolean, false) then v_revisions := v_revisions + 1; else v_unchanged := v_unchanged + 1; end if;
  if coalesce((v_write ->> 'approval_item_created')::boolean, false) then v_items := v_items + 1; end if;
  if coalesce((v_write ->> 'approval_item_superseded')::boolean, false) then v_superseded := v_superseded + 1; end if;

  v_write := public.write_overtime_detection_revision(
    p_employee_id,
    p_attendance_date,
    'holiday_work',
    v_attendance.id,
    v_attendance.attendance_record_id,
    v_attendance.schedule_assignment_id,
    v_attendance.schedule_version_id,
    v_policy_version_id,
    v_holiday_version_id,
    case when v_holiday_minutes > 0 then v_attendance.actual_clock_in_at else null end,
    case when v_holiday_minutes > 0 then v_attendance.actual_clock_out_at else null end,
    v_holiday_minutes,
    v_holiday_minutes >= v_minimum_minutes,
    p_source,
    p_actor_profile_id,
    p_recalculation_reason
  );
  if coalesce((v_write ->> 'changed')::boolean, false) then v_revisions := v_revisions + 1; else v_unchanged := v_unchanged + 1; end if;
  if coalesce((v_write ->> 'approval_item_created')::boolean, false) then v_items := v_items + 1; end if;
  if coalesce((v_write ->> 'approval_item_superseded')::boolean, false) then v_superseded := v_superseded + 1; end if;

  return jsonb_build_object(
    'revisions_created', v_revisions,
    'approval_items_created', v_items,
    'approval_items_superseded', v_superseded,
    'unchanged_segments', v_unchanged
  );
end;
$$;

revoke all on function public.calculate_overtime_for_attendance_day(
  uuid, date, text, uuid, text
) from public, anon, authenticated;
```

- [ ] **Step 6: Run focused detection tests**

Run:

```bash
npm test -- \
  src/features/overtime/rules.test.ts \
  src/features/overtime/migration.test.ts \
  src/features/overtime/security.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the detection engine**

```bash
git add supabase/migrations/202607150002_overtime_holidays.sql src/features/overtime/migration.test.ts src/features/overtime/security.test.ts
git commit -m "feat: add immutable overtime detection engine"
```

---
### Task 7: Make Attendance Revisions Holiday-Aware and Trigger Overtime Automatically

**Files:**
- Modify: `supabase/migrations/202607150002_overtime_holidays.sql`
- Modify: `src/features/attendance/calculations/types.ts`
- Modify: `src/features/attendance/calculations/rules.ts`
- Modify: `src/features/attendance/calculations/rules.test.ts`
- Modify: `src/features/attendance/calculations/attendance-days.ts`
- Modify: `src/features/attendance/calculations/attendance-days.test.ts`
- Modify: `src/features/attendance/calculations/queries.ts`
- Modify: `src/features/attendance/calculations/queries.test.ts`
- Modify: `src/features/attendance/calculations/presentation.ts`
- Modify: `src/features/attendance/calculations/presentation.test.ts`
- Modify: `src/features/overtime/migration.test.ts`

**Interfaces:**
- Consumes: `resolve_active_holiday(date)`, `calculate_overtime_for_attendance_day(uuid,date,text,uuid,text)`, and the Phase 5B-2A attendance writer/calculator.
- Produces: holiday-snapshotted attendance revisions with `holiday_version_id`, `holiday_name`, `holiday_type`, and `is_holiday`; every successfully written active attendance revision invokes overtime detection with the same source and protected recalculation reason.

- [ ] **Step 1: Write failing holiday-classification and detector-chain tests**

Append these assertions to `src/features/attendance/calculations/migration.test.ts`:

```ts
import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const phase5b2bMigration = readFileSync(
  new URL("../../../../supabase/migrations/202607150002_overtime_holidays.sql", import.meta.url),
  "utf8",
).toLowerCase();

test("phase 5b-2b snapshots holiday context on attendance revisions", () => {
  assert.match(phase5b2bMigration, /add column if not exists holiday_version_id uuid/);
  assert.match(phase5b2bMigration, /add column if not exists holiday_name text/);
  assert.match(phase5b2bMigration, /add column if not exists holiday_type text/);
  assert.match(phase5b2bMigration, /add column if not exists is_holiday boolean not null default false/);
  assert.match(phase5b2bMigration, /check \(holiday_type is null or holiday_type in \(/);
});

test("holiday is resolved before absence and rest-day classification", () => {
  const resolveAt = phase5b2bMigration.indexOf("from public.resolve_active_holiday(p_attendance_date)");
  const holidayBranchAt = phase5b2bMigration.indexOf("if v_is_holiday then");
  const normalBranchAt = phase5b2bMigration.indexOf("elsif not v_assignment_exists then");
  assert.ok(resolveAt >= 0);
  assert.ok(holidayBranchAt > resolveAt);
  assert.ok(normalBranchAt > holidayBranchAt);
  assert.match(
    phase5b2bMigration,
    /v_base_status := 'holiday';[\s\S]*v_worked_minutes := 0;[\s\S]*v_late_minutes := null;[\s\S]*v_undertime_minutes := null;/,
  );
});

test("holiday work cannot retain late or undertime", () => {
  assert.match(
    phase5b2bMigration,
    /if v_is_holiday then[\s\S]*v_late_minutes := null;[\s\S]*v_undertime_minutes := null;[\s\S]*v_is_late := false;[\s\S]*v_is_undertime := false;/,
  );
});

test("attendance calculation invokes overtime only after writing the revision", () => {
  const writeAt = phase5b2bMigration.indexOf(
    "v_revision_id := public.write_attendance_calculation_revision(",
  );
  const overtimeAt = phase5b2bMigration.indexOf(
    "perform public.calculate_overtime_for_attendance_day(",
  );
  assert.ok(writeAt >= 0);
  assert.ok(overtimeAt > writeAt);
});
```

Append to `src/features/attendance/calculations/rules.test.ts`:

```ts
import { classifyHolidayAttendance } from "./rules.ts";

test("holiday without attendance is finalized holiday with zero worked minutes", () => {
  assert.deepEqual(
    classifyHolidayAttendance({
      hasAttendance: false,
      hasClockOut: false,
      dateHasEnded: true,
      forceFinal: false,
      workedMinutes: null,
    }),
    {
      baseStatus: "holiday",
      isProvisional: false,
      workedMinutes: 0,
      lateMinutes: null,
      undertimeMinutes: null,
    },
  );
});

test("holiday missing clock-out finalizes as missing_clock_out", () => {
  assert.equal(
    classifyHolidayAttendance({
      hasAttendance: true,
      hasClockOut: false,
      dateHasEnded: true,
      forceFinal: false,
      workedMinutes: null,
    }).baseStatus,
    "missing_clock_out",
  );
});

test("completed holiday attendance is present with holiday metrics suppressed", () => {
  assert.deepEqual(
    classifyHolidayAttendance({
      hasAttendance: true,
      hasClockOut: true,
      dateHasEnded: true,
      forceFinal: false,
      workedMinutes: 450,
    }),
    {
      baseStatus: "present",
      isProvisional: false,
      workedMinutes: 450,
      lateMinutes: null,
      undertimeMinutes: null,
    },
  );
});
```

Append to `src/features/attendance/calculations/presentation.test.ts`:

```ts
import { attendanceBaseStatusLabel, holidayAttendanceLabel } from "./presentation.ts";

test("holiday attendance labels are explicit", () => {
  assert.equal(attendanceBaseStatusLabel("holiday"), "Holiday");
  assert.equal(
    holidayAttendanceLabel({
      is_holiday: true,
      holiday_name: "Independence Day",
      holiday_type: "regular_holiday",
      actual_clock_in_at: null,
      actual_clock_out_at: null,
    }),
    "Regular Holiday",
  );
  assert.equal(
    holidayAttendanceLabel({
      is_holiday: true,
      holiday_name: "Company Foundation Day",
      holiday_type: "company_holiday",
      actual_clock_in_at: "2026-07-15T00:00:00.000Z",
      actual_clock_out_at: "2026-07-15T08:00:00.000Z",
    }),
    "Holiday work",
  );
});
```

Append to `src/features/attendance/calculations/attendance-days.test.ts`:

```ts
test("holiday filter returns holiday calculation-only rows", () => {
  const holiday = makeCalculation({
    base_status: "holiday",
    is_holiday: true,
    holiday_name: "Company Foundation Day",
    holiday_type: "company_holiday",
  });
  const rows = mergeAttendanceDays([], [holiday]);
  assert.equal(filterAttendanceDays(rows, "holiday").length, 1);
});
```

- [ ] **Step 2: Run the focused tests and verify the new expectations fail**

Run:

```bash
npm test -- \
  src/features/attendance/calculations/migration.test.ts \
  src/features/attendance/calculations/rules.test.ts \
  src/features/attendance/calculations/presentation.test.ts \
  src/features/attendance/calculations/attendance-days.test.ts
```

Expected: FAIL because the holiday fields, status, helper, and detector invocation do not exist.

- [ ] **Step 3: Extend the attendance revision schema and constraints**

Append this before redefining the writer in `supabase/migrations/202607150002_overtime_holidays.sql`:

```sql
alter table public.attendance_calculation_revisions
  add column if not exists holiday_version_id uuid
    references public.holiday_calendar_versions(id),
  add column if not exists holiday_name text,
  add column if not exists holiday_type text,
  add column if not exists is_holiday boolean not null default false;

alter table public.attendance_calculation_revisions
  drop constraint if exists attendance_calculation_revisions_base_status_check;
alter table public.attendance_calculation_revisions
  add constraint attendance_calculation_revisions_base_status_check
  check (base_status in (
    'present',
    'absent',
    'holiday',
    'missing_clock_out',
    'rest_day_worked',
    'unscheduled_attendance'
  ));

alter table public.attendance_calculation_revisions
  drop constraint if exists attendance_calculation_revisions_holiday_type_check;
alter table public.attendance_calculation_revisions
  add constraint attendance_calculation_revisions_holiday_type_check
  check (
    holiday_type is null or holiday_type in (
      'regular_holiday',
      'special_non_working_holiday',
      'company_holiday'
    )
  );

alter table public.attendance_calculation_revisions
  drop constraint if exists attendance_calculation_revisions_holiday_snapshot_check;
alter table public.attendance_calculation_revisions
  add constraint attendance_calculation_revisions_holiday_snapshot_check
  check (
    (not is_holiday and holiday_version_id is null and holiday_name is null and holiday_type is null)
    or
    (is_holiday and holiday_version_id is not null and holiday_name is not null and holiday_type is not null)
  );
```

- [ ] **Step 4: Replace the attendance revision writer with the holiday-aware signature**

Append this exact replacement function:

```sql
create or replace function public.write_attendance_calculation_revision(
  p_employee_id uuid,
  p_attendance_date date,
  p_attendance_record_id uuid,
  p_schedule_assignment_id uuid,
  p_schedule_version_id uuid,
  p_policy_version_id uuid,
  p_holiday_version_id uuid,
  p_holiday_name text,
  p_holiday_type text,
  p_is_holiday boolean,
  p_base_status text,
  p_is_provisional boolean,
  p_scheduled_start_at timestamptz,
  p_scheduled_end_at timestamptz,
  p_scheduled_minutes integer,
  p_actual_clock_in_at timestamptz,
  p_actual_clock_out_at timestamptz,
  p_worked_minutes integer,
  p_late_minutes integer,
  p_undertime_minutes integer,
  p_is_late boolean,
  p_is_undertime boolean,
  p_is_corrected boolean,
  p_is_recalculated boolean,
  p_calculation_source text,
  p_calculated_by uuid,
  p_recalculation_reason text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_group_id uuid;
  v_revision_id uuid;
  v_revision_number integer;
  v_action text;
begin
  insert into public.attendance_calculation_groups (
    employee_id, attendance_date
  ) values (
    p_employee_id, p_attendance_date
  ) on conflict (employee_id, attendance_date) do nothing;

  select id into v_group_id
  from public.attendance_calculation_groups
  where employee_id = p_employee_id
    and attendance_date = p_attendance_date
  for update;

  select coalesce(max(revision_number), 0) + 1
    into v_revision_number
  from public.attendance_calculation_revisions
  where calculation_group_id = v_group_id;

  insert into public.attendance_calculation_revisions (
    calculation_group_id, revision_number, attendance_record_id,
    schedule_assignment_id, schedule_version_id, policy_version_id,
    holiday_version_id, holiday_name, holiday_type, is_holiday,
    base_status, is_provisional, scheduled_start_at, scheduled_end_at,
    scheduled_minutes, actual_clock_in_at, actual_clock_out_at,
    worked_minutes, late_minutes, undertime_minutes,
    is_late, is_undertime, is_corrected, is_recalculated,
    calculation_source, calculated_by, recalculation_reason
  ) values (
    v_group_id, v_revision_number, p_attendance_record_id,
    p_schedule_assignment_id, p_schedule_version_id, p_policy_version_id,
    p_holiday_version_id, p_holiday_name, p_holiday_type, p_is_holiday,
    p_base_status, p_is_provisional, p_scheduled_start_at, p_scheduled_end_at,
    p_scheduled_minutes, p_actual_clock_in_at, p_actual_clock_out_at,
    p_worked_minutes, p_late_minutes, p_undertime_minutes,
    p_is_late, p_is_undertime, p_is_corrected, p_is_recalculated,
    p_calculation_source, p_calculated_by,
    nullif(btrim(coalesce(p_recalculation_reason, '')), '')
  ) returning id into v_revision_id;

  update public.attendance_calculation_groups
  set active_revision_id = v_revision_id,
      updated_at = now()
  where id = v_group_id;

  v_action := case
    when p_calculation_source = 'manual_recalculation'
      then 'attendance_calculation.recalculated'
    when p_calculation_source in ('daily_finalization', 'manual_finalization')
      then 'attendance_calculation.finalized'
    else 'attendance_calculation.created'
  end;

  perform public.write_employee_audit(
    p_employee_id,
    v_action,
    'attendance_calculation',
    v_revision_id,
    jsonb_build_array(
      'attendance_date', 'base_status', 'revision_number',
      'worked_minutes', 'late_minutes', 'undertime_minutes',
      'is_provisional', 'is_holiday', 'holiday_type'
    ),
    '{}'::jsonb,
    jsonb_build_object(
      'attendance_date', p_attendance_date,
      'base_status', p_base_status,
      'revision_number', v_revision_number,
      'scheduled_minutes', p_scheduled_minutes,
      'worked_minutes', p_worked_minutes,
      'late_minutes', p_late_minutes,
      'undertime_minutes', p_undertime_minutes,
      'is_provisional', p_is_provisional,
      'is_holiday', p_is_holiday,
      'holiday_type', p_holiday_type,
      'holiday_version_id', p_holiday_version_id,
      'policy_version_id', p_policy_version_id,
      'schedule_version_id', p_schedule_version_id,
      'calculation_source', p_calculation_source
    ),
    '{}'::jsonb,
    'application',
    p_calculated_by
  );

  return v_revision_id;
end;
$$;

revoke all on function public.write_attendance_calculation_revision(
  uuid, date, uuid, uuid, uuid, uuid, uuid, text, text, boolean,
  text, boolean, timestamptz, timestamptz, integer,
  timestamptz, timestamptz, integer, integer, integer,
  boolean, boolean, boolean, boolean, text, uuid, text
) from public, anon, authenticated;
```

- [ ] **Step 5: Replace the internal attendance calculator with holiday precedence**

Append this exact function after the detector exists:

```sql
create or replace function public.calculate_attendance_day_internal(
  p_employee_id uuid,
  p_attendance_date date,
  p_source text,
  p_actor_profile_id uuid,
  p_recalculation_reason text default null,
  p_force_final boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_attendance public.attendance_records%rowtype;
  v_assignment public.employee_schedule_assignments%rowtype;
  v_version public.work_schedule_versions%rowtype;
  v_attendance_exists boolean := false;
  v_assignment_exists boolean := false;
  v_version_exists boolean := false;
  v_policy_version_id uuid;
  v_late_grace_minutes integer := 0;
  v_holiday_version_id uuid;
  v_holiday_name text;
  v_holiday_type text;
  v_is_holiday boolean := false;
  v_company_date date := public.company_attendance_date(now());
  v_date_has_ended boolean;
  v_weekday text;
  v_is_workday boolean := false;
  v_base_status text;
  v_is_provisional boolean := false;
  v_scheduled_start_at timestamptz;
  v_scheduled_end_at timestamptz;
  v_scheduled_minutes integer;
  v_worked_minutes integer;
  v_late_minutes integer;
  v_undertime_minutes integer;
  v_is_late boolean := false;
  v_is_undertime boolean := false;
  v_revision_id uuid;
begin
  if p_attendance_date is null or p_attendance_date > v_company_date then
    raise exception using errcode = 'P0001', message = 'FUTURE_ATTENDANCE_NOT_ALLOWED';
  end if;
  if p_source not in (
    'clock_in','clock_out','hr_create','hr_correction',
    'correction_approval','daily_finalization',
    'manual_recalculation','manual_finalization'
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_CALCULATION_SOURCE';
  end if;

  perform 1 from public.employees where id = p_employee_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'EMPLOYEE_NOT_FOUND';
  end if;

  select * into v_attendance
  from public.attendance_records
  where employee_id = p_employee_id
    and attendance_date = p_attendance_date
  limit 1;
  v_attendance_exists := found;

  select * into v_assignment
  from public.employee_schedule_assignments
  where employee_id = p_employee_id
    and not is_superseded
    and effective_start_date <= p_attendance_date
    and (effective_end_date is null or effective_end_date >= p_attendance_date)
  order by effective_start_date desc, id desc
  limit 1;
  v_assignment_exists := found;

  if v_assignment_exists then
    select * into v_version
    from public.work_schedule_versions
    where schedule_template_id = v_assignment.schedule_template_id
      and effective_date <= p_attendance_date
    order by effective_date desc, id desc
    limit 1;
    v_version_exists := found;
    if not v_version_exists then
      raise exception using errcode = 'P0001', message = 'SCHEDULE_VERSION_NOT_FOUND';
    end if;
  end if;

  select policy_version_id, late_grace_minutes
    into v_policy_version_id, v_late_grace_minutes
  from public.resolve_attendance_policy(p_attendance_date);

  select holiday_version_id, holiday_name, holiday_type
    into v_holiday_version_id, v_holiday_name, v_holiday_type
  from public.resolve_active_holiday(p_attendance_date);
  v_is_holiday := v_holiday_version_id is not null;

  v_date_has_ended := p_attendance_date < v_company_date;
  v_weekday := lower(trim(to_char(p_attendance_date::timestamp, 'FMDay')));
  if v_version_exists then
    v_is_workday := v_weekday = any(v_version.working_days);
  end if;

  if v_assignment_exists and v_is_workday then
    v_scheduled_start_at :=
      (p_attendance_date + v_version.start_time) at time zone 'Asia/Manila';
    v_scheduled_end_at :=
      (p_attendance_date + v_version.end_time) at time zone 'Asia/Manila';
    v_scheduled_minutes := greatest(
      0,
      floor(extract(epoch from (v_scheduled_end_at - v_scheduled_start_at)) / 60)::integer
        - v_version.break_minutes
    );
  end if;

  if v_is_holiday then
    if not v_attendance_exists then
      v_base_status := 'holiday';
      v_is_provisional := false;
      v_worked_minutes := 0;
      v_late_minutes := null;
      v_undertime_minutes := null;
    elsif v_attendance.clock_out_at is null then
      if v_date_has_ended or p_force_final then
        v_base_status := 'missing_clock_out';
        v_is_provisional := false;
      else
        v_base_status := 'present';
        v_is_provisional := true;
      end if;
      v_worked_minutes := null;
      v_late_minutes := null;
      v_undertime_minutes := null;
    else
      v_base_status := 'present';
      v_is_provisional := false;
      v_worked_minutes := greatest(
        0,
        floor(extract(epoch from (
          v_attendance.clock_out_at - v_attendance.clock_in_at
        )) / 60)::integer
        - case when v_version_exists then v_version.break_minutes else 0 end
      );
      v_late_minutes := null;
      v_undertime_minutes := null;
    end if;
    v_is_late := false;
    v_is_undertime := false;
  elsif not v_assignment_exists then
    if not v_attendance_exists then
      return null;
    end if;
    v_base_status := 'unscheduled_attendance';
    v_is_provisional := v_attendance.clock_out_at is null
      and not v_date_has_ended and not p_force_final;
  elsif not v_is_workday then
    if not v_attendance_exists then
      return null;
    end if;
    v_base_status := 'rest_day_worked';
    v_is_provisional := v_attendance.clock_out_at is null
      and not v_date_has_ended and not p_force_final;
    v_scheduled_minutes := 0;
  elsif not v_attendance_exists then
    if not v_date_has_ended and not p_force_final then
      return null;
    end if;
    v_base_status := 'absent';
    v_is_provisional := false;
    v_worked_minutes := 0;
    v_late_minutes := 0;
    v_undertime_minutes := 0;
  else
    if v_attendance.clock_out_at is null then
      if v_date_has_ended or p_force_final then
        v_base_status := 'missing_clock_out';
        v_is_provisional := false;
      else
        v_base_status := 'present';
        v_is_provisional := true;
      end if;
    else
      v_base_status := 'present';
      v_is_provisional := false;
    end if;
  end if;

  if not v_is_holiday and v_attendance_exists and v_assignment_exists and v_is_workday then
    if v_attendance.clock_in_at <=
      v_scheduled_start_at + make_interval(mins => v_late_grace_minutes) then
      v_late_minutes := 0;
    else
      v_late_minutes := greatest(
        0,
        floor(extract(epoch from (
          v_attendance.clock_in_at - v_scheduled_start_at
        )) / 60)::integer
      );
    end if;
    v_is_late := coalesce(v_late_minutes, 0) > 0;
  end if;

  if not v_is_holiday and v_attendance_exists and v_attendance.clock_out_at is not null then
    v_worked_minutes := greatest(
      0,
      floor(extract(epoch from (
        v_attendance.clock_out_at - v_attendance.clock_in_at
      )) / 60)::integer
      - case when v_version_exists then v_version.break_minutes else 0 end
    );

    if v_assignment_exists and v_is_workday then
      v_undertime_minutes := greatest(
        0,
        floor(extract(epoch from (
          v_scheduled_end_at - v_attendance.clock_out_at
        )) / 60)::integer
      );
      v_is_undertime := v_undertime_minutes > 0;
    else
      v_late_minutes := null;
      v_undertime_minutes := null;
      v_is_late := false;
      v_is_undertime := false;
    end if;
  elsif not v_is_holiday and v_base_status = 'missing_clock_out' then
    v_worked_minutes := null;
    v_undertime_minutes := null;
    v_is_undertime := false;
  end if;

  v_revision_id := public.write_attendance_calculation_revision(
    p_employee_id,
    p_attendance_date,
    case when v_attendance_exists then v_attendance.id else null end,
    case when v_assignment_exists then v_assignment.id else null end,
    case when v_version_exists then v_version.id else null end,
    v_policy_version_id,
    v_holiday_version_id,
    v_holiday_name,
    v_holiday_type,
    v_is_holiday,
    v_base_status,
    v_is_provisional,
    case when v_assignment_exists and v_is_workday then v_scheduled_start_at else null end,
    case when v_assignment_exists and v_is_workday then v_scheduled_end_at else null end,
    v_scheduled_minutes,
    case when v_attendance_exists then v_attendance.clock_in_at else null end,
    case when v_attendance_exists then v_attendance.clock_out_at else null end,
    v_worked_minutes,
    v_late_minutes,
    v_undertime_minutes,
    v_is_late,
    v_is_undertime,
    case when v_attendance_exists then v_attendance.is_corrected else false end,
    p_source = 'manual_recalculation',
    p_source,
    p_actor_profile_id,
    p_recalculation_reason
  );

  perform public.calculate_overtime_for_attendance_day(
    p_employee_id,
    p_attendance_date,
    p_source,
    p_actor_profile_id,
    p_recalculation_reason
  );

  return v_revision_id;
end;
$$;

revoke all on function public.calculate_attendance_day_internal(
  uuid, date, text, uuid, text, boolean
) from public, anon, authenticated;

drop function if exists public.write_attendance_calculation_revision(
  uuid, date, uuid, uuid, uuid, uuid, text, boolean,
  timestamptz, timestamptz, integer, timestamptz, timestamptz,
  integer, integer, integer, boolean, boolean, boolean, boolean,
  text, uuid, text
);
```

This order is mandatory: create the new overload, replace the calculator so it depends on the new overload, then drop the old overload.

- [ ] **Step 6: Extend the employee-safe attendance projection**

Replace `get_my_attendance_calculations` in the migration so its return table adds these safe display columns immediately after `policy_version_id`:

```sql
holiday_name text,
holiday_type text,
is_holiday boolean,
```

Add these expressions to the corresponding `select` list:

```sql
revision.holiday_name,
revision.holiday_type,
revision.is_holiday,
```

Do not return `holiday_version_id` from this employee RPC. `mapSafeRow` leaves that HR-only source reference as `null` for employee results. Also keep `recalculation_reason`, `calculated_by`, and every protected overtime field out of the projection.

- [ ] **Step 7: Extend attendance TypeScript contracts and pure helper**

In `src/features/attendance/calculations/types.ts`, add `"holiday"` to `attendanceCalculationBaseStatuses` after `"absent"`, and add these fields to `AttendanceCalculationRevision` after `policy_version_id`:

```ts
holiday_version_id: string | null;
holiday_name: string | null;
holiday_type:
  | "regular_holiday"
  | "special_non_working_holiday"
  | "company_holiday"
  | null;
is_holiday: boolean;
```

Append this helper to `src/features/attendance/calculations/rules.ts`:

```ts
export function classifyHolidayAttendance(input: {
  hasAttendance: boolean;
  hasClockOut: boolean;
  dateHasEnded: boolean;
  forceFinal: boolean;
  workedMinutes: number | null;
}) {
  if (!input.hasAttendance) {
    return {
      baseStatus: "holiday" as const,
      isProvisional: false,
      workedMinutes: 0,
      lateMinutes: null,
      undertimeMinutes: null,
    };
  }
  if (!input.hasClockOut) {
    return {
      baseStatus:
        input.dateHasEnded || input.forceFinal
          ? ("missing_clock_out" as const)
          : ("present" as const),
      isProvisional: !(input.dateHasEnded || input.forceFinal),
      workedMinutes: null,
      lateMinutes: null,
      undertimeMinutes: null,
    };
  }
  return {
    baseStatus: "present" as const,
    isProvisional: false,
    workedMinutes: input.workedMinutes,
    lateMinutes: null,
    undertimeMinutes: null,
  };
}
```

- [ ] **Step 8: Extend attendance query mappings and selections**

In both `activeRevisionSelect` and `historySelect` in `src/features/attendance/calculations/queries.ts`, add:

```ts
holiday_version_id,holiday_name,holiday_type,is_holiday,
```

In `mapSafeRow`, add:

```ts
holiday_version_id: row.holiday_version_id ? String(row.holiday_version_id) : null,
holiday_name: row.holiday_name ? String(row.holiday_name) : null,
holiday_type: row.holiday_type
  ? (String(row.holiday_type) as ActiveAttendanceCalculation["holiday_type"])
  : null,
is_holiday: Boolean(row.is_holiday),
```

Update every calculation test fixture in `queries.test.ts`, `attendance-days.test.ts`, and `presentation.test.ts` to include:

```ts
holiday_version_id: null,
holiday_name: null,
holiday_type: null,
is_holiday: false,
```

Add this source-contract test to `queries.test.ts`:

```ts
test("attendance calculation queries load holiday snapshots", () => {
  assert.match(source, /holiday_version_id,holiday_name,holiday_type,is_holiday/);
  assert.match(source, /is_holiday: Boolean\(row\.is_holiday\)/);
});
```

- [ ] **Step 9: Add holiday presentation and filtering**

Update the label map in `src/features/attendance/calculations/presentation.ts`:

```ts
const labels: Record<AttendanceCalculationBaseStatus, string> = {
  present: "Present",
  absent: "Absent",
  holiday: "Holiday",
  missing_clock_out: "Missing clock-out",
  rest_day_worked: "Rest day worked",
  unscheduled_attendance: "Unscheduled attendance",
};
```

Append:

```ts
export function holidayAttendanceLabel(
  revision: Pick<
    AttendanceCalculationRevision,
    | "is_holiday"
    | "holiday_name"
    | "holiday_type"
    | "actual_clock_in_at"
    | "actual_clock_out_at"
  >,
): string | null {
  if (!revision.is_holiday) return null;
  if (revision.actual_clock_in_at && revision.actual_clock_out_at) {
    return "Holiday work";
  }
  if (revision.holiday_type === "regular_holiday") return "Regular Holiday";
  if (revision.holiday_type === "special_non_working_holiday") {
    return "Special Non-Working Holiday";
  }
  if (revision.holiday_type === "company_holiday") return "Company Holiday";
  return revision.holiday_name ?? "Holiday";
}
```

In `filterAttendanceDays`, include `holiday` in the calculation-status branch:

```ts
if (
  status === "absent" ||
  status === "holiday" ||
  status === "rest_day_worked" ||
  status === "unscheduled_attendance"
) {
  return calculation?.base_status === status;
}
```

- [ ] **Step 10: Run focused attendance and overtime tests**

Run:

```bash
npm test -- \
  src/features/attendance/calculations/migration.test.ts \
  src/features/attendance/calculations/rules.test.ts \
  src/features/attendance/calculations/attendance-days.test.ts \
  src/features/attendance/calculations/queries.test.ts \
  src/features/attendance/calculations/presentation.test.ts \
  src/features/overtime/migration.test.ts
```

Expected: PASS.

- [ ] **Step 11: Commit holiday-aware attendance integration**

```bash
git add \
  supabase/migrations/202607150002_overtime_holidays.sql \
  src/features/attendance/calculations \
  src/features/overtime/migration.test.ts
git commit -m "feat: add holiday-aware attendance calculations"
```

---
### Task 8: Add Explicit Overtime Recalculation

**Files:**
- Modify: `supabase/migrations/202607150002_overtime_holidays.sql`
- Modify: `src/features/overtime/types.ts`
- Create: `src/features/overtime/validation.ts`
- Create: `src/features/overtime/actions.test.ts`
- Create: `src/app/(dashboard)/admin/overtime/recalculate/actions.ts`
- Create: `src/app/(dashboard)/admin/overtime/recalculate/page.tsx`
- Create: `src/components/overtime/overtime-recalculation-form.tsx`
- Modify: `src/features/overtime/migration.test.ts`
- Modify: `src/features/overtime/security.test.ts`

**Interfaces:**
- Consumes: `calculate_overtime_for_attendance_day(uuid,date,text,uuid,text)`, `company_attendance_date(timestamptz)`, `is_hr_admin()`, and active employee records.
- Produces: `recalculate_overtime_range(uuid[],date,date,text) -> jsonb` and `recalculateOvertime(state, formData)` for one employee or all active employees.

- [ ] **Step 1: Write failing validation, RPC, and action tests**

Create `src/features/overtime/actions.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateOvertimeRecalculation } from "./validation.ts";

const migration = await readFile(
  new URL("../../../supabase/migrations/202607150002_overtime_holidays.sql", import.meta.url),
  "utf8",
);
const action = await readFile(
  new URL("../../app/(dashboard)/admin/overtime/recalculate/actions.ts", import.meta.url),
  "utf8",
).catch(() => "");
const formSource = await readFile(
  new URL("../../components/overtime/overtime-recalculation-form.tsx", import.meta.url),
  "utf8",
).catch(() => "");

const employeeId = "11111111-1111-4111-8111-111111111111";
function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

test("overtime recalculation validation supports one employee and all active employees", () => {
  const one = validateOvertimeRecalculation(
    form({
      scope: "one_employee",
      employee_id: employeeId,
      start_date: "2026-07-01",
      end_date: "2026-07-15",
      reason: "Apply approved holiday calendar",
    }),
    "2026-07-15",
  );
  assert.deepEqual(one.data?.employeeIds, [employeeId]);

  const all = validateOvertimeRecalculation(
    form({
      scope: "all_active",
      employee_id: "",
      start_date: "2026-07-01",
      end_date: "2026-07-15",
      reason: "Apply approved overtime policy",
    }),
    "2026-07-15",
  );
  assert.equal(all.data?.employeeIds, null);
});

test("overtime recalculation rejects future dates and never echoes its reason", () => {
  const result = validateOvertimeRecalculation(
    form({
      scope: "one_employee",
      employee_id: employeeId,
      start_date: "2026-07-16",
      end_date: "2026-07-16",
      reason: "PROTECTED_RECALCULATION_REASON",
    }),
    "2026-07-15",
  );
  assert.equal(result.data, undefined);
  assert.doesNotMatch(JSON.stringify(result.state), /PROTECTED_RECALCULATION_REASON/);
});

test("overtime recalculation RPC is HR-only and calls only the overtime detector", () => {
  assert.match(migration, /create or replace function public\.recalculate_overtime_range/i);
  assert.match(migration, /if not public\.is_hr_admin\(\) then/i);
  assert.match(migration, /p_end_date > public\.company_attendance_date\(now\(\)\)/i);
  assert.match(migration, /perform public\.calculate_overtime_for_attendance_day\(/i);
  assert.match(migration, /'overtime_recalculation'/i);
  assert.doesNotMatch(
    migration.match(/create or replace function public\.recalculate_overtime_range[\s\S]*?\$\$;/i)?.[0] ?? "",
    /calculate_attendance_day_internal/i,
  );
});

test("overtime recalculation action calls one protected RPC and keeps reason out of retry values", () => {
  assert.match(action, /\.rpc\("recalculate_overtime_range"/);
  assert.match(action, /requireAttendanceAdmin\(\)/);
  assert.doesNotMatch(action, /values:\s*\{[^}]*reason/s);
  assert.doesNotMatch(action, /console\.(log|error|warn)/);
});

test("recalculation form warns about supersession and immutable history", () => {
  assert.match(formSource, /Previous detections and approval items remain in history/);
  assert.match(formSource, /changed results supersede active items/i);
  assert.match(formSource, /maxLength=\{1000\}/);
});
```

- [ ] **Step 2: Run the action tests and verify failure**

Run:

```bash
npm test -- src/features/overtime/actions.test.ts
```

Expected: FAIL because the validation, RPC, action, and form do not exist.

- [ ] **Step 3: Add the protected recalculation RPC**

Append to `supabase/migrations/202607150002_overtime_holidays.sql`:

```sql
create or replace function public.recalculate_overtime_range(
  p_employee_ids uuid[],
  p_start_date date,
  p_end_date date,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_employee_ids uuid[];
  v_employee_id uuid;
  v_date date;
  v_result jsonb;
  v_employees integer := 0;
  v_dates integer := 0;
  v_revisions integer := 0;
  v_items integer := 0;
  v_superseded integer := 0;
  v_unchanged integer := 0;
begin
  if v_actor is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;
  if not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception using errcode = 'P0001', message = 'OVERTIME_RECALCULATION_DATE_RANGE_INVALID';
  end if;
  if p_end_date > public.company_attendance_date(now()) then
    raise exception using errcode = 'P0001', message = 'OVERTIME_RECALCULATION_FUTURE_DATE';
  end if;
  if v_reason is null then
    raise exception using errcode = 'P0001', message = 'OVERTIME_RECALCULATION_REASON_REQUIRED';
  end if;
  if char_length(v_reason) > 1000 then
    raise exception using errcode = 'P0001', message = 'PRIVATE_TEXT_TOO_LONG';
  end if;

  if p_employee_ids is null then
    select coalesce(array_agg(employee.id order by employee.id), '{}'::uuid[])
      into v_employee_ids
    from public.employees as employee
    where employee.archived_at is null;
  else
    if cardinality(p_employee_ids) = 0 then
      raise exception using errcode = 'P0001', message = 'OVERTIME_RECALCULATION_EMPLOYEE_INPUT_INVALID';
    end if;
    select coalesce(array_agg(employee.id order by employee.id), '{}'::uuid[])
      into v_employee_ids
    from public.employees as employee
    where employee.id = any(p_employee_ids)
      and employee.archived_at is null;
    if cardinality(v_employee_ids) <> cardinality(
      array(select distinct unnest(p_employee_ids))
    ) then
      raise exception using errcode = 'P0001', message = 'OVERTIME_RECALCULATION_EMPLOYEE_INPUT_INVALID';
    end if;
  end if;

  foreach v_employee_id in array v_employee_ids loop
    v_employees := v_employees + 1;
    for v_date in
      select generate_series(p_start_date, p_end_date, interval '1 day')::date
    loop
      v_dates := v_dates + 1;
      v_result := public.calculate_overtime_for_attendance_day(
        v_employee_id,
        v_date,
        'overtime_recalculation',
        v_actor,
        v_reason
      );
      v_revisions := v_revisions + coalesce((v_result ->> 'revisions_created')::integer, 0);
      v_items := v_items + coalesce((v_result ->> 'approval_items_created')::integer, 0);
      v_superseded := v_superseded + coalesce((v_result ->> 'approval_items_superseded')::integer, 0);
      v_unchanged := v_unchanged + coalesce((v_result ->> 'unchanged_segments')::integer, 0);
    end loop;
  end loop;

  return jsonb_build_object(
    'employees_processed', v_employees,
    'dates_processed', v_dates,
    'revisions_created', v_revisions,
    'approval_items_created', v_items,
    'approval_items_superseded', v_superseded,
    'unchanged_segments', v_unchanged
  );
exception
  when sqlstate 'P0001' then
    raise;
  when others then
    raise exception using errcode = 'P0001', message = 'OVERTIME_RECALCULATION_FAILED';
end;
$$;

revoke all on function public.recalculate_overtime_range(uuid[], date, date, text)
  from public, anon;
grant execute on function public.recalculate_overtime_range(uuid[], date, date, text)
  to authenticated;
```

The RPC intentionally invokes only the overtime detector. It does not rewrite attendance calculation revisions, which keeps the explicit attendance and overtime recalculation responsibilities separate.

- [ ] **Step 4: Add recalculation validation**

Create `src/features/overtime/validation.ts` with shared helpers and the recalculation validator:

```ts
import { companyDateAt } from "../attendance/time.ts";
import type {
  OvertimeRecalculationActionState,
  OvertimeReviewActionState,
} from "./types.ts";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export function validateOvertimeRecalculation(
  formData: FormData,
  companyDate = companyDateAt(),
): {
  data?: {
    scope: "one_employee" | "all_active";
    employeeIds: string[] | null;
    startDate: string;
    endDate: string;
    reason: string;
  };
  state?: OvertimeRecalculationActionState;
} {
  const scope = text(formData, "scope");
  const employeeId = text(formData, "employee_id");
  const startDate = text(formData, "start_date");
  const endDate = text(formData, "end_date");
  const reason = text(formData, "reason");
  const fieldErrors: Record<string, string> = {};

  if (scope !== "one_employee" && scope !== "all_active") {
    fieldErrors.scope = "Choose an employee scope.";
  }
  if (scope === "one_employee" && !uuidPattern.test(employeeId)) {
    fieldErrors.employee_id = "Select a valid employee.";
  }
  if (!datePattern.test(startDate)) {
    fieldErrors.start_date = "Start date is required.";
  }
  if (!datePattern.test(endDate)) {
    fieldErrors.end_date = "End date is required.";
  } else if (startDate && endDate < startDate) {
    fieldErrors.end_date = "End date must be on or after the start date.";
  }
  if ((startDate && startDate > companyDate) || (endDate && endDate > companyDate)) {
    fieldErrors.end_date = "Future dates cannot be recalculated.";
  }
  if (!reason) {
    fieldErrors.reason = "A recalculation reason is required.";
  } else if (reason.length > 1000) {
    fieldErrors.reason = "Reason must be 1,000 characters or fewer.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      state: {
        error: "Please correct the highlighted fields.",
        fieldErrors,
        values: {
          scope: scope === "all_active" ? "all_active" : "one_employee",
          employeeId,
          startDate,
          endDate,
        },
      },
    };
  }

  return {
    data: {
      scope: scope as "one_employee" | "all_active",
      employeeIds: scope === "one_employee" ? [employeeId] : null,
      startDate,
      endDate,
      reason,
    },
  };
}

export function validateOvertimeReview(
  formData: FormData,
): {
  data?: {
    approvalItemId: string;
    expectedStatus: "pending";
    decision: "approve" | "reject";
    reviewText: string | null;
  };
  state?: OvertimeReviewActionState;
} {
  const approvalItemId = text(formData, "approval_item_id");
  const expectedStatus = text(formData, "expected_status");
  const decision = text(formData, "decision");
  const reviewText = text(formData, "review_text");
  const fieldErrors: Record<string, string> = {};

  if (!uuidPattern.test(approvalItemId)) fieldErrors.approval_item_id = "Invalid overtime item.";
  if (expectedStatus !== "pending") fieldErrors.expected_status = "This item is no longer pending.";
  if (decision !== "approve" && decision !== "reject") fieldErrors.decision = "Choose approve or reject.";
  if (decision === "reject" && !reviewText) fieldErrors.review_text = "A rejection reason is required.";
  if (reviewText.length > 1000) fieldErrors.review_text = "Review text must be 1,000 characters or fewer.";

  if (Object.keys(fieldErrors).length > 0) {
    return { state: { error: "Please correct the highlighted fields.", fieldErrors } };
  }
  return {
    data: {
      approvalItemId,
      expectedStatus: "pending",
      decision: decision as "approve" | "reject",
      reviewText: reviewText || null,
    },
  };
}
```

Task 11 will use the review validator already defined here.

- [ ] **Step 5: Add the Server Action**

Create `src/app/(dashboard)/admin/overtime/recalculate/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAttendanceAdmin } from "@/features/attendance/auth";
import type { OvertimeRecalculationActionState } from "@/features/overtime/types";
import { validateOvertimeRecalculation } from "@/features/overtime/validation";

function recalculationError(message: string) {
  if (message.includes("OVERTIME_RECALCULATION_REASON_REQUIRED")) {
    return "A recalculation reason is required.";
  }
  if (message.includes("OVERTIME_RECALCULATION_FUTURE_DATE")) {
    return "The selected date range contains future dates.";
  }
  if (message.includes("OVERTIME_RECALCULATION_DATE_RANGE_INVALID")) {
    return "End date must be on or after the start date.";
  }
  if (message.includes("OVERTIME_RECALCULATION_EMPLOYEE_INPUT_INVALID")) {
    return "One or more selected employees are no longer eligible.";
  }
  if (message.includes("PRIVATE_TEXT_TOO_LONG")) {
    return "Reason must be 1,000 characters or fewer.";
  }
  return "Overtime recalculation could not be completed.";
}

export async function recalculateOvertime(
  _state: OvertimeRecalculationActionState,
  formData: FormData,
): Promise<OvertimeRecalculationActionState> {
  const { supabase } = await requireAttendanceAdmin();
  const validation = validateOvertimeRecalculation(formData);
  if (!validation.data) {
    return validation.state ?? { error: "Invalid overtime recalculation request." };
  }

  const { error } = await supabase.rpc("recalculate_overtime_range", {
    p_employee_ids: validation.data.employeeIds,
    p_start_date: validation.data.startDate,
    p_end_date: validation.data.endDate,
    p_reason: validation.data.reason,
  });
  if (error) {
    return {
      error: recalculationError(error.message),
      values: {
        scope: validation.data.scope,
        employeeId: validation.data.employeeIds?.[0] ?? "",
        startDate: validation.data.startDate,
        endDate: validation.data.endDate,
      },
    };
  }

  revalidatePath("/admin/overtime");
  revalidatePath("/attendance");
  revalidatePath("/admin/attendance");
  revalidatePath("/overtime");
  redirect("/admin/overtime/recalculate?success=completed");
}
```

- [ ] **Step 6: Add the recalculation form**

Create `src/components/overtime/overtime-recalculation-form.tsx`:

```tsx
"use client";

import { useActionState, useState } from "react";
import type { AttendanceEmployeeSummary } from "@/features/attendance/types";
import type { OvertimeRecalculationActionState } from "@/features/overtime/types";

const initialState: OvertimeRecalculationActionState = {};

export function OvertimeRecalculationForm({
  action,
  employees,
  companyDate,
}: {
  action: (
    state: OvertimeRecalculationActionState,
    formData: FormData,
  ) => Promise<OvertimeRecalculationActionState>;
  employees: AttendanceEmployeeSummary[];
  companyDate: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [scope, setScope] = useState(state.values?.scope ?? "one_employee");

  return (
    <form
      action={formAction}
      className="card form-card"
      onSubmit={(event) => {
        const confirmed = window.confirm(
          "Recalculate overtime?\n\nPrevious detections and approval items remain in history. Changed results supersede active items and newly qualifying results return to Pending.",
        );
        if (!confirmed) event.preventDefault();
      }}
    >
      <div className="form-grid">
        <label>
          <span>Employee scope</span>
          <select
            className="field"
            name="scope"
            value={scope}
            onChange={(event) =>
              setScope(event.target.value as "one_employee" | "all_active")
            }
          >
            <option value="one_employee">One employee</option>
            <option value="all_active">All active employees</option>
          </select>
          {state.fieldErrors?.scope && <span className="form-error">{state.fieldErrors.scope}</span>}
        </label>
        <label>
          <span>Employee</span>
          <select
            className="field"
            name="employee_id"
            defaultValue={state.values?.employeeId ?? ""}
            disabled={scope === "all_active"}
          >
            <option value="">Select employee</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.employee_number} · {employee.first_name} {employee.last_name}
              </option>
            ))}
          </select>
          {state.fieldErrors?.employee_id && <span className="form-error">{state.fieldErrors.employee_id}</span>}
        </label>
        <label>
          <span>Start date</span>
          <input
            className="field"
            type="date"
            name="start_date"
            max={companyDate}
            defaultValue={state.values?.startDate ?? companyDate}
            required
          />
          {state.fieldErrors?.start_date && <span className="form-error">{state.fieldErrors.start_date}</span>}
        </label>
        <label>
          <span>End date</span>
          <input
            className="field"
            type="date"
            name="end_date"
            max={companyDate}
            defaultValue={state.values?.endDate ?? companyDate}
            required
          />
          {state.fieldErrors?.end_date && <span className="form-error">{state.fieldErrors.end_date}</span>}
        </label>
        <label className="full">
          <span>Recalculation reason</span>
          <textarea className="field" name="reason" maxLength={1000} rows={4} required />
          {state.fieldErrors?.reason && <span className="form-error">{state.fieldErrors.reason}</span>}
        </label>
      </div>
      <p className="info-callout">
        Attendance calculation revisions are not modified. The active finalized attendance result is reused, and only changed overtime results create new immutable revisions.
      </p>
      {state.error && <p className="form-error">{state.error}</p>}
      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? "Recalculating…" : "Recalculate overtime"}
      </button>
    </form>
  );
}
```

- [ ] **Step 7: Add the recalculation page**

Create `src/app/(dashboard)/admin/overtime/recalculate/page.tsx`:

```tsx
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { OvertimeRecalculationForm } from "@/components/overtime/overtime-recalculation-form";
import { requireAttendanceAdmin } from "@/features/attendance/auth";
import { getActiveAttendanceEmployees } from "@/features/attendance/queries";
import { companyDateAt } from "@/features/attendance/time";
import { recalculateOvertime } from "./actions";

export default async function RecalculateOvertimePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAttendanceAdmin();
  const query = await searchParams;
  const employees = await getActiveAttendanceEmployees();

  return (
    <>
      <PageHeader
        title="Recalculate overtime"
        description="Re-evaluate active finalized attendance against the current holiday calendar and overtime policy."
        action={<Link className="btn" href="/admin/overtime">Back to overtime</Link>}
      />
      {query.success === "completed" && (
        <p className="form-success">Overtime recalculation completed.</p>
      )}
      <OvertimeRecalculationForm
        action={recalculateOvertime}
        employees={employees}
        companyDate={companyDateAt()}
      />
    </>
  );
}
```

- [ ] **Step 8: Run focused tests**

Run:

```bash
npm test -- \
  src/features/overtime/actions.test.ts \
  src/features/overtime/migration.test.ts \
  src/features/overtime/security.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit explicit overtime recalculation**

```bash
git add \
  supabase/migrations/202607150002_overtime_holidays.sql \
  src/features/overtime \
  'src/app/(dashboard)/admin/overtime/recalculate' \
  src/components/overtime/overtime-recalculation-form.tsx
git commit -m "feat: add explicit overtime recalculation"
```

---
### Task 9: Add Employee-Safe and HR Overtime Query Projections

**Files:**
- Modify: `supabase/migrations/202607150002_overtime_holidays.sql`
- Create: `src/features/overtime/queries.ts`
- Create: `src/features/overtime/queries.test.ts`
- Modify: `src/features/overtime/security.test.ts`
- Modify: `src/features/overtime/types.ts`

**Interfaces:**
- Consumes: overtime groups/revisions/approval items, employee ownership, departments, holiday versions, and profiles.
- Produces: `get_my_overtime_items(date,date)` for employee-safe history; `getOwnOvertimeHistory`, `getOwnActiveOvertimeSummaryMap`, `getAdminOvertimeApprovalQueue`, `getOvertimeApprovalDetail`, and `getAdminActiveOvertimeSummaryMap` server-only functions.

- [ ] **Step 1: Write failing projection and query tests**

Create `src/features/overtime/queries.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../../../supabase/migrations/202607150002_overtime_holidays.sql", import.meta.url),
  "utf8",
);
const source = await readFile(new URL("./queries.ts", import.meta.url), "utf8").catch(() => "");

const employeeRpc = migration.match(
  /create or replace function public\.get_my_overtime_items[\s\S]*?\$\$;/i,
)?.[0] ?? "";

test("employee overtime projection is ownership-scoped and contains only safe fields", () => {
  assert.match(employeeRpc, /employee\.profile_id = auth\.uid\(\)/i);
  assert.match(employeeRpc, /attendance_date date/i);
  assert.match(employeeRpc, /segment_type text/i);
  assert.match(employeeRpc, /detected_minutes integer/i);
  assert.match(employeeRpc, /approved_minutes integer/i);
  assert.match(employeeRpc, /status text/i);
  assert.match(employeeRpc, /approval_date timestamptz/i);
  assert.match(employeeRpc, /holiday_name text/i);
  assert.match(employeeRpc, /holiday_type text/i);
  assert.match(employeeRpc, /is_active boolean/i);
  assert.doesNotMatch(employeeRpc, /approval_note/i);
  assert.doesNotMatch(employeeRpc, /rejection_reason/i);
  assert.doesNotMatch(employeeRpc, /reviewed_by/i);
  assert.doesNotMatch(employeeRpc, /recalculation_reason/i);
  assert.doesNotMatch(employeeRpc, /change_reason/i);
  assert.doesNotMatch(employeeRpc, /policy_version_id/i);
  assert.doesNotMatch(employeeRpc, /detection_revision_id/i);
});

test("employee query uses only the safe RPC", () => {
  const ownHistory = source.match(
    /export async function getOwnOvertimeHistory[\s\S]*?\n}/,
  )?.[0] ?? "";
  assert.match(ownHistory, /\.rpc\("get_my_overtime_items"/);
  assert.doesNotMatch(ownHistory, /\.from\("overtime_/);
});

test("HR queue supports every approved filter and active-approved metrics", () => {
  assert.match(source, /dateFrom\?: string/);
  assert.match(source, /dateTo\?: string/);
  assert.match(source, /employeeId\?: string/);
  assert.match(source, /departmentId\?: string/);
  assert.match(source, /segmentType\?: OvertimeSegmentType/);
  assert.match(source, /holidayType\?: HolidayType/);
  assert.match(source, /status\?: OvertimeApprovalStatus/);
  assert.match(source, /totalActiveApprovedMinutes/);
  assert.match(source, /row\.status === "approved" && row\.detection_is_active/);
});

test("query module is server-only and maps superseded history", () => {
  assert.match(source, /^import "server-only";/);
  assert.match(source, /superseded_at/);
  assert.match(source, /priorItems/);
});
```

Append to `src/features/overtime/security.test.ts`:

```ts
test("safe employee overtime RPC is executable by authenticated users only", () => {
  assert.match(migration, /revoke all on function public\.get_my_overtime_items\(date, date\)\s+from public, anon/i);
  assert.match(migration, /grant execute on function public\.get_my_overtime_items\(date, date\)\s+to authenticated/i);
});
```

- [ ] **Step 2: Run query tests and verify failure**

Run:

```bash
npm test -- src/features/overtime/queries.test.ts src/features/overtime/security.test.ts
```

Expected: FAIL because the projection and query module do not exist.

- [ ] **Step 3: Add the employee-safe overtime RPC**

Append to the migration:

```sql
create or replace function public.get_my_overtime_items(
  p_from_date date default null,
  p_to_date date default null
)
returns table(
  attendance_date date,
  segment_type text,
  detected_minutes integer,
  approved_minutes integer,
  status text,
  approval_date timestamptz,
  holiday_name text,
  holiday_type text,
  is_active boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  return query
  select
    detection_group.attendance_date,
    detection_revision.segment_type,
    approval.detected_minutes,
    approval.approved_minutes,
    approval.status,
    approval.reviewed_at,
    holiday.holiday_name,
    holiday.holiday_type,
    detection_revision.is_active,
    approval.created_at
  from public.employees as employee
  join public.overtime_detection_groups as detection_group
    on detection_group.employee_id = employee.id
  join public.overtime_detection_revisions as detection_revision
    on detection_revision.detection_group_id = detection_group.id
  join public.overtime_approval_items as approval
    on approval.detection_revision_id = detection_revision.id
  left join public.holiday_calendar_versions as holiday
    on holiday.id = detection_revision.holiday_version_id
  where employee.profile_id = auth.uid()
    and (p_from_date is null or detection_group.attendance_date >= p_from_date)
    and (p_to_date is null or detection_group.attendance_date <= p_to_date)
  order by
    detection_group.attendance_date desc,
    approval.created_at desc,
    detection_revision.revision_number desc;
end;
$$;

revoke all on function public.get_my_overtime_items(date, date)
  from public, anon;
grant execute on function public.get_my_overtime_items(date, date)
  to authenticated;
```

The function returns no identifiers, reviewer, notes, reasons, policy references, source fields, or internal timestamps beyond approval/history dates required by the employee view.

- [ ] **Step 4: Add pagination contracts to the shared types**

Append to `src/features/overtime/types.ts`:

```ts
export type PaginatedEmployeeOvertime = {
  items: SafeEmployeeOvertimeItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type PaginatedOvertimeQueue = {
  items: OvertimeApprovalQueueRow[];
  metrics: OvertimeQueueMetrics;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
```

- [ ] **Step 5: Create the server-only overtime query module**

Create `src/features/overtime/queries.ts`:

```ts
import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { HolidayType } from "./holidays/types";
import type {
  AttendanceOvertimeSummary,
  OvertimeApprovalDetail,
  OvertimeApprovalQueueRow,
  OvertimeApprovalStatus,
  OvertimeQueueMetrics,
  OvertimeSegmentType,
  PaginatedEmployeeOvertime,
  PaginatedOvertimeQueue,
  SafeEmployeeOvertimeItem,
} from "./types";

const adminApprovalSelect = `
  id,status,detected_minutes,approved_minutes,reviewed_by,reviewed_at,
  approval_note,rejection_reason,created_at,superseded_at,superseded_by_item_id,
  reviewer:profiles!overtime_approval_items_reviewed_by_fkey(
    id,display_name,first_name,last_name
  ),
  detection_revision:overtime_detection_revisions!inner(
    id,detection_group_id,revision_number,attendance_calculation_revision_id,
    attendance_record_id,schedule_assignment_id,schedule_version_id,
    overtime_policy_version_id,holiday_version_id,segment_type,
    detected_start_at,detected_end_at,detected_minutes,meets_threshold,
    is_active,calculation_source,calculated_at,
    holiday:holiday_calendar_versions!overtime_detection_revisions_holiday_version_id_fkey(
      holiday_name,holiday_type
    ),
    detection_group:overtime_detection_groups!inner(
      id,employee_id,attendance_date,active_revision_id,
      employee:employees!inner(
        id,employee_number,first_name,last_name,department_id,
        department:departments!employees_department_id_fkey(id,name)
      )
    )
  )
`;

function mapSafeEmployeeItem(row: Record<string, unknown>): SafeEmployeeOvertimeItem {
  return {
    attendance_date: String(row.attendance_date),
    segment_type: row.segment_type as SafeEmployeeOvertimeItem["segment_type"],
    detected_minutes: Number(row.detected_minutes),
    approved_minutes: Number(row.approved_minutes),
    status: row.status as SafeEmployeeOvertimeItem["status"],
    approval_date: row.approval_date ? String(row.approval_date) : null,
    holiday_name: row.holiday_name ? String(row.holiday_name) : null,
    holiday_type: row.holiday_type
      ? (String(row.holiday_type) as SafeEmployeeOvertimeItem["holiday_type"])
      : null,
    is_active: Boolean(row.is_active),
    created_at: String(row.created_at),
  };
}

function mapAdminApproval(row: Record<string, unknown>): OvertimeApprovalQueueRow {
  const revision = row.detection_revision as Record<string, unknown>;
  const group = revision.detection_group as Record<string, unknown>;
  const employee = group.employee as OvertimeApprovalQueueRow["employee"];
  const holiday = revision.holiday as Record<string, unknown> | null;

  return {
    id: String(row.id),
    status: row.status as OvertimeApprovalStatus,
    detected_minutes: Number(row.detected_minutes),
    approved_minutes: Number(row.approved_minutes),
    reviewed_at: row.reviewed_at ? String(row.reviewed_at) : null,
    created_at: String(row.created_at),
    superseded_at: row.superseded_at ? String(row.superseded_at) : null,
    employee,
    attendance_date: String(group.attendance_date),
    segment_type: revision.segment_type as OvertimeSegmentType,
    detected_start_at: revision.detected_start_at
      ? String(revision.detected_start_at)
      : null,
    detected_end_at: revision.detected_end_at
      ? String(revision.detected_end_at)
      : null,
    detection_revision_id: String(revision.id),
    detection_revision_number: Number(revision.revision_number),
    detection_is_active: Boolean(revision.is_active),
    holiday_name: holiday?.holiday_name ? String(holiday.holiday_name) : null,
    holiday_type: holiday?.holiday_type
      ? (String(holiday.holiday_type) as HolidayType)
      : null,
  };
}

function applyAdminFilters(
  query: any,
  params: {
    dateFrom?: string;
    dateTo?: string;
    employeeId?: string;
    departmentId?: string;
    segmentType?: OvertimeSegmentType;
    holidayType?: HolidayType;
    status?: OvertimeApprovalStatus;
  },
) {
  let filtered = query;
  if (params.dateFrom) {
    filtered = filtered.gte(
      "detection_revision.detection_group.attendance_date",
      params.dateFrom,
    );
  }
  if (params.dateTo) {
    filtered = filtered.lte(
      "detection_revision.detection_group.attendance_date",
      params.dateTo,
    );
  }
  if (params.employeeId) {
    filtered = filtered.eq(
      "detection_revision.detection_group.employee_id",
      params.employeeId,
    );
  }
  if (params.departmentId) {
    filtered = filtered.eq(
      "detection_revision.detection_group.employee.department_id",
      params.departmentId,
    );
  }
  if (params.segmentType) {
    filtered = filtered.eq("detection_revision.segment_type", params.segmentType);
  }
  if (params.holidayType) {
    filtered = filtered.eq("detection_revision.holiday.holiday_type", params.holidayType);
  }
  if (params.status) filtered = filtered.eq("status", params.status);
  return filtered;
}

async function loadAllAdminApprovalRows(params: {
  dateFrom?: string;
  dateTo?: string;
  employeeId?: string;
  departmentId?: string;
  segmentType?: OvertimeSegmentType;
  holidayType?: HolidayType;
  status?: OvertimeApprovalStatus;
}): Promise<OvertimeApprovalQueueRow[]> {
  const supabase = await createClient();
  const rows: OvertimeApprovalQueueRow[] = [];
  const batchSize = 1000;
  let from = 0;

  while (true) {
    const query = applyAdminFilters(
      supabase
        .from("overtime_approval_items")
        .select(adminApprovalSelect)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false }),
      params,
    ).range(from, from + batchSize - 1);
    const { data, error } = await query;
    if (error) throw new Error("Unable to load overtime approvals.");
    const batch = (data ?? []).map((row: unknown) =>
      mapAdminApproval(row as Record<string, unknown>),
    );
    rows.push(...batch);
    if (batch.length < batchSize) break;
    from += batchSize;
  }

  return rows;
}

export async function getOwnOvertimeHistory(params: {
  fromDate?: string;
  toDate?: string;
  page?: number;
}): Promise<PaginatedEmployeeOvertime> {
  const supabase = await createClient();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = 20;
  const { data, error } = await supabase.rpc("get_my_overtime_items", {
    p_from_date: params.fromDate?.trim() || null,
    p_to_date: params.toDate?.trim() || null,
  });
  if (error) throw new Error("Unable to load overtime history.");
  const items = (data ?? []).map((row) =>
    mapSafeEmployeeItem(row as Record<string, unknown>),
  );
  const total = items.length;
  const from = (page - 1) * pageSize;
  return {
    items: items.slice(from, from + pageSize),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getOwnActiveOvertimeSummaryMap(params: {
  fromDate?: string;
  toDate?: string;
}): Promise<Map<string, AttendanceOvertimeSummary[]>> {
  const history = await getOwnOvertimeHistory({
    fromDate: params.fromDate,
    toDate: params.toDate,
    page: 1,
  });
  const map = new Map<string, AttendanceOvertimeSummary[]>();
  for (const item of history.items.filter((row) => row.is_active)) {
    const current = map.get(item.attendance_date) ?? [];
    current.push(item);
    map.set(item.attendance_date, current);
  }
  return map;
}

export async function getAdminOvertimeApprovalQueue(params: {
  dateFrom?: string;
  dateTo?: string;
  employeeId?: string;
  departmentId?: string;
  segmentType?: OvertimeSegmentType;
  holidayType?: HolidayType;
  status?: OvertimeApprovalStatus;
  page?: number;
}): Promise<PaginatedOvertimeQueue> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = 20;
  const rows = await loadAllAdminApprovalRows(params);
  const metrics: OvertimeQueueMetrics = {
    pendingItems: rows.filter((row) => row.status === "pending").length,
    approvedItems: rows.filter((row) => row.status === "approved").length,
    rejectedItems: rows.filter((row) => row.status === "rejected").length,
    supersededItems: rows.filter((row) => row.status === "superseded").length,
    totalDetectedMinutes: rows.reduce(
      (sum, row) => sum + row.detected_minutes,
      0,
    ),
    totalActiveApprovedMinutes: rows
      .filter((row) => row.status === "approved" && row.detection_is_active)
      .reduce((sum, row) => sum + row.approved_minutes, 0),
  };
  const total = rows.length;
  const from = (page - 1) * pageSize;
  return {
    items: rows.slice(from, from + pageSize),
    metrics,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getAdminActiveOvertimeSummaryMap(params: {
  employeeIds: string[];
  fromDate?: string;
  toDate?: string;
}): Promise<Map<string, AttendanceOvertimeSummary[]>> {
  const map = new Map<string, AttendanceOvertimeSummary[]>();
  if (params.employeeIds.length === 0) return map;
  const rows = await loadAllAdminApprovalRows({
    dateFrom: params.fromDate,
    dateTo: params.toDate,
  });
  const employeeSet = new Set(params.employeeIds);
  for (const row of rows) {
    if (!row.detection_is_active || !employeeSet.has(row.employee.id)) continue;
    const key = `${row.employee.id}:${row.attendance_date}`;
    const current = map.get(key) ?? [];
    current.push({
      attendance_date: row.attendance_date,
      segment_type: row.segment_type,
      detected_minutes: row.detected_minutes,
      approved_minutes: row.approved_minutes,
      status: row.status,
      holiday_name: row.holiday_name,
      holiday_type: row.holiday_type,
      is_active: row.detection_is_active,
    });
    map.set(key, current);
  }
  return map;
}

export async function getOvertimeApprovalDetail(
  approvalItemId: string,
): Promise<OvertimeApprovalDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("overtime_approval_items")
    .select(adminApprovalSelect)
    .eq("id", approvalItemId)
    .maybeSingle();
  if (error) throw new Error("Unable to load the overtime approval item.");
  if (!data) return null;

  const row = data as unknown as Record<string, unknown>;
  const mapped = mapAdminApproval(row);
  const revision = row.detection_revision as Record<string, unknown>;
  const groupId = String(revision.detection_group_id);
  const { data: revisionRows, error: revisionError } = await supabase
    .from("overtime_detection_revisions")
    .select("id")
    .eq("detection_group_id", groupId);
  if (revisionError) throw new Error("Unable to load overtime history.");
  const revisionIds = (revisionRows ?? []).map((item) => item.id);
  const priorItems = revisionIds.length
    ? (await loadAllAdminApprovalRows({})).filter(
        (item) =>
          revisionIds.includes(item.detection_revision_id) &&
          item.id !== approvalItemId &&
          item.status === "superseded",
      )
    : [];

  return {
    ...mapped,
    attendance_calculation_revision_id: String(
      revision.attendance_calculation_revision_id,
    ),
    attendance_record_id: revision.attendance_record_id
      ? String(revision.attendance_record_id)
      : null,
    schedule_assignment_id: revision.schedule_assignment_id
      ? String(revision.schedule_assignment_id)
      : null,
    schedule_version_id: revision.schedule_version_id
      ? String(revision.schedule_version_id)
      : null,
    overtime_policy_version_id: revision.overtime_policy_version_id
      ? String(revision.overtime_policy_version_id)
      : null,
    holiday_version_id: revision.holiday_version_id
      ? String(revision.holiday_version_id)
      : null,
    calculation_source: revision.calculation_source as OvertimeApprovalDetail["calculation_source"],
    calculated_at: String(revision.calculated_at),
    reviewer: (row.reviewer ?? null) as OvertimeApprovalDetail["reviewer"],
    approval_note: row.approval_note ? String(row.approval_note) : null,
    rejection_reason: row.rejection_reason ? String(row.rejection_reason) : null,
    priorItems: priorItems.sort((left, right) =>
      right.detection_revision_number - left.detection_revision_number
    ),
  };
}
```

Keep the `any` in `applyAdminFilters` isolated to this internal adapter because the repository has no generated Supabase database type. Public parameters, mapper inputs, and return values remain explicitly typed.

- [ ] **Step 6: Correct the employee summary helper so pagination never truncates attendance integration**

Replace `getOwnActiveOvertimeSummaryMap` with a direct safe-RPC load rather than reusing the paginated history function:

```ts
export async function getOwnActiveOvertimeSummaryMap(params: {
  fromDate?: string;
  toDate?: string;
}): Promise<Map<string, AttendanceOvertimeSummary[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_overtime_items", {
    p_from_date: params.fromDate?.trim() || null,
    p_to_date: params.toDate?.trim() || null,
  });
  if (error) throw new Error("Unable to load overtime summaries.");
  const map = new Map<string, AttendanceOvertimeSummary[]>();
  for (const row of (data ?? []).map((item) =>
    mapSafeEmployeeItem(item as Record<string, unknown>),
  )) {
    if (!row.is_active) continue;
    const current = map.get(row.attendance_date) ?? [];
    current.push(row);
    map.set(row.attendance_date, current);
  }
  return map;
}
```

- [ ] **Step 7: Run focused projection tests and type-check the query module**

Run:

```bash
npm test -- src/features/overtime/queries.test.ts src/features/overtime/security.test.ts
npx tsc --noEmit
```

Expected: tests PASS and TypeScript reports no errors; relation-shape casts remain limited to `mapSafeEmployeeItem` and `mapAdminApproval`.

- [ ] **Step 8: Commit safe and HR query projections**

```bash
git add \
  supabase/migrations/202607150002_overtime_holidays.sql \
  src/features/overtime/types.ts \
  src/features/overtime/queries.ts \
  src/features/overtime/queries.test.ts \
  src/features/overtime/security.test.ts
git commit -m "feat: add overtime query projections"
```

---
### Task 10: Build the HR Overtime Approval Queue

**Files:**
- Create: `src/features/overtime/presentation.ts`
- Create: `src/features/overtime/presentation.test.ts`
- Create: `src/components/overtime/overtime-approval-table.tsx`
- Create: `src/app/(dashboard)/admin/overtime/page.tsx`
- Create: `src/features/overtime/ui.test.ts`

**Interfaces:**
- Consumes: `getAdminOvertimeApprovalQueue`, `getEmployeeOptions`, overtime/holiday presentation contracts.
- Produces: `/admin/overtime` with all approved filters, six summary metrics, responsive results, pagination, and links to review/recalculate.

- [ ] **Step 1: Write failing presentation and queue UI tests**

Create `src/features/overtime/presentation.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  overtimeApprovalStatusLabel,
  overtimeSegmentLabel,
  holidayTypeLabel,
} from "./presentation.ts";

test("overtime segment labels are user-facing", () => {
  assert.equal(overtimeSegmentLabel("pre_shift"), "Pre-shift");
  assert.equal(overtimeSegmentLabel("post_shift"), "Post-shift");
  assert.equal(overtimeSegmentLabel("rest_day"), "Rest-day overtime");
  assert.equal(overtimeSegmentLabel("holiday_work"), "Holiday work");
});

test("approval and holiday labels are complete", () => {
  assert.equal(overtimeApprovalStatusLabel("pending"), "Pending");
  assert.equal(overtimeApprovalStatusLabel("approved"), "Approved");
  assert.equal(overtimeApprovalStatusLabel("rejected"), "Rejected");
  assert.equal(overtimeApprovalStatusLabel("superseded"), "Superseded");
  assert.equal(holidayTypeLabel("regular_holiday"), "Regular Holiday");
  assert.equal(
    holidayTypeLabel("special_non_working_holiday"),
    "Special Non-Working Holiday",
  );
  assert.equal(holidayTypeLabel("company_holiday"), "Company Holiday");
});
```

Create `src/features/overtime/ui.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const queuePage = await readFile(
  new URL("../../app/(dashboard)/admin/overtime/page.tsx", import.meta.url),
  "utf8",
).catch(() => "");
const table = await readFile(
  new URL("../../components/overtime/overtime-approval-table.tsx", import.meta.url),
  "utf8",
).catch(() => "");

test("HR overtime queue requires admin before loading data", () => {
  const authAt = queuePage.indexOf("await requireAttendanceAdmin()");
  const queryAt = queuePage.indexOf("getAdminOvertimeApprovalQueue(");
  assert.ok(authAt >= 0);
  assert.ok(queryAt > authAt);
});

test("HR queue exposes every approved filter and summary metric", () => {
  for (const name of [
    "date_from",
    "date_to",
    "employee",
    "department",
    "segment_type",
    "holiday_type",
    "status",
  ]) {
    assert.match(queuePage, new RegExp(`name=["']${name}["']`));
  }
  for (const label of [
    "Pending items",
    "Approved items",
    "Rejected items",
    "Superseded items",
    "Total detected",
    "Active approved",
  ]) {
    assert.match(queuePage, new RegExp(label));
  }
});

test("queue table shows employee, segment, holiday, minutes, status, and detail action", () => {
  for (const label of ["Employee", "Date", "Segment", "Holiday", "Detected", "Approved", "Status"])
    assert.match(table, new RegExp(label));
  assert.match(table, /href=\{`\/admin\/overtime\/\$\{item\.id\}`\}/);
});
```

- [ ] **Step 2: Run the tests and verify failure**

Run:

```bash
npm test -- src/features/overtime/presentation.test.ts src/features/overtime/ui.test.ts
```

Expected: FAIL because the presentation module, page, and table do not exist.

- [ ] **Step 3: Add overtime presentation helpers**

Create `src/features/overtime/presentation.ts`:

```ts
import type { HolidayType } from "./holidays/types";
import type { OvertimeApprovalStatus, OvertimeSegmentType } from "./types";

export function overtimeSegmentLabel(segment: OvertimeSegmentType): string {
  const labels: Record<OvertimeSegmentType, string> = {
    pre_shift: "Pre-shift",
    post_shift: "Post-shift",
    rest_day: "Rest-day overtime",
    holiday_work: "Holiday work",
  };
  return labels[segment];
}

export function overtimeApprovalStatusLabel(status: OvertimeApprovalStatus): string {
  const labels: Record<OvertimeApprovalStatus, string> = {
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
    superseded: "Superseded",
  };
  return labels[status];
}

export function holidayTypeLabel(type: HolidayType | null): string {
  if (type === "regular_holiday") return "Regular Holiday";
  if (type === "special_non_working_holiday") {
    return "Special Non-Working Holiday";
  }
  if (type === "company_holiday") return "Company Holiday";
  return "—";
}
```

- [ ] **Step 4: Create the responsive approval table**

Create `src/components/overtime/overtime-approval-table.tsx`:

```tsx
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { formatAttendanceMinutes } from "@/features/attendance/calculations/presentation";
import { formatCompanyDate, formatCompanyTime } from "@/features/attendance/time";
import {
  holidayTypeLabel,
  overtimeApprovalStatusLabel,
  overtimeSegmentLabel,
} from "@/features/overtime/presentation";
import type { OvertimeApprovalQueueRow } from "@/features/overtime/types";

function employeeName(item: OvertimeApprovalQueueRow) {
  return `${item.employee.first_name} ${item.employee.last_name}`.trim();
}

export function OvertimeApprovalTable({
  items,
}: {
  items: OvertimeApprovalQueueRow[];
}) {
  if (items.length === 0) {
    return <div className="empty">No overtime approval items match these filters.</div>;
  }

  return (
    <div>
      <div className="table-wrap organization-table-desktop">
        <table>
          <thead>
            <tr>
              <th>Employee</th><th>Date</th><th>Segment</th><th>Holiday</th>
              <th>Detected</th><th>Approved</th><th>Status</th><th><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td><strong>{employeeName(item)}</strong><div className="muted">{item.employee.employee_number}</div></td>
                <td>{formatCompanyDate(item.attendance_date)}</td>
                <td>
                  <strong>{overtimeSegmentLabel(item.segment_type)}</strong>
                  {(item.detected_start_at || item.detected_end_at) && (
                    <div className="muted">
                      {formatCompanyTime(item.detected_start_at)}–{formatCompanyTime(item.detected_end_at)}
                    </div>
                  )}
                </td>
                <td>{item.holiday_name ? <><strong>{item.holiday_name}</strong><div className="muted">{holidayTypeLabel(item.holiday_type)}</div></> : "—"}</td>
                <td>{formatAttendanceMinutes(item.detected_minutes)}</td>
                <td>{formatAttendanceMinutes(item.approved_minutes)}</td>
                <td><StatusBadge value={overtimeApprovalStatusLabel(item.status)} /></td>
                <td><Link className="table-link" href={`/admin/overtime/${item.id}`}>View</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="organization-card-list">
        {items.map((item) => (
          <article className="organization-list-card" key={item.id}>
            <div><strong>{employeeName(item)}</strong><span className="muted">{item.employee.employee_number}</span></div>
            <StatusBadge value={overtimeApprovalStatusLabel(item.status)} />
            <dl>
              <div><dt>Date</dt><dd>{formatCompanyDate(item.attendance_date)}</dd></div>
              <div><dt>Segment</dt><dd>{overtimeSegmentLabel(item.segment_type)}</dd></div>
              <div><dt>Holiday</dt><dd>{item.holiday_name ?? "—"}</dd></div>
              <div><dt>Detected</dt><dd>{formatAttendanceMinutes(item.detected_minutes)}</dd></div>
              <div><dt>Approved</dt><dd>{formatAttendanceMinutes(item.approved_minutes)}</dd></div>
            </dl>
            <Link className="btn" href={`/admin/overtime/${item.id}`}>View item</Link>
          </article>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Build the queue page**

Create `src/app/(dashboard)/admin/overtime/page.tsx`:

```tsx
import Link from "next/link";
import { OvertimeApprovalTable } from "@/components/overtime/overtime-approval-table";
import { PageHeader } from "@/components/page-header";
import { formatAttendanceMinutes } from "@/features/attendance/calculations/presentation";
import { requireAttendanceAdmin } from "@/features/attendance/auth";
import { getActiveAttendanceEmployees } from "@/features/attendance/queries";
import { companyDateAt } from "@/features/attendance/time";
import { getEmployeeOptions } from "@/features/employees/queries";
import { getAdminOvertimeApprovalQueue } from "@/features/overtime/queries";
import type { HolidayType } from "@/features/overtime/holidays/types";
import type { OvertimeApprovalStatus, OvertimeSegmentType } from "@/features/overtime/types";

function value(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] : input ?? "";
}

function pageHref(filters: Record<string, string>, page: number) {
  const search = new URLSearchParams();
  for (const [key, item] of Object.entries(filters)) if (item) search.set(key, item);
  if (page > 1) search.set("page", String(page));
  return `/admin/overtime${search.size ? `?${search}` : ""}`;
}

export default async function AdminOvertimePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAttendanceAdmin();
  const raw = await searchParams;
  const dateFrom = value(raw.date_from);
  const dateTo = value(raw.date_to) || companyDateAt();
  const employee = value(raw.employee);
  const department = value(raw.department);
  const segmentType = value(raw.segment_type);
  const holidayType = value(raw.holiday_type);
  const status = value(raw.status);
  const page = Math.max(1, Number(value(raw.page) || "1") || 1);

  const [employees, options, result] = await Promise.all([
    getActiveAttendanceEmployees(),
    getEmployeeOptions(),
    getAdminOvertimeApprovalQueue({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      employeeId: employee || undefined,
      departmentId: department || undefined,
      segmentType: (segmentType || undefined) as OvertimeSegmentType | undefined,
      holidayType: (holidayType || undefined) as HolidayType | undefined,
      status: (status || undefined) as OvertimeApprovalStatus | undefined,
      page,
    }),
  ]);
  const filters = {
    date_from: dateFrom,
    date_to: dateTo,
    employee,
    department,
    segment_type: segmentType,
    holiday_type: holidayType,
    status,
  };

  return (
    <>
      <PageHeader
        title="Overtime approvals"
        description="Review immutable overtime and holiday-work detections."
        action={(
          <div className="header-actions">
            <Link className="btn" href="/admin/overtime/recalculate">Recalculate</Link>
          </div>
        )}
      />

      <section className="metrics-grid overtime-metrics-grid" aria-label="Overtime summary">
        <article className="metric-card"><span>Pending items</span><strong>{result.metrics.pendingItems}</strong></article>
        <article className="metric-card"><span>Approved items</span><strong>{result.metrics.approvedItems}</strong></article>
        <article className="metric-card"><span>Rejected items</span><strong>{result.metrics.rejectedItems}</strong></article>
        <article className="metric-card"><span>Superseded items</span><strong>{result.metrics.supersededItems}</strong></article>
        <article className="metric-card"><span>Total detected</span><strong>{formatAttendanceMinutes(result.metrics.totalDetectedMinutes)}</strong></article>
        <article className="metric-card"><span>Active approved</span><strong>{formatAttendanceMinutes(result.metrics.totalActiveApprovedMinutes)}</strong></article>
      </section>

      <section className="card">
        <form className="toolbar overtime-filter-toolbar" method="get">
          <input className="field" type="date" name="date_from" defaultValue={dateFrom} aria-label="From date" />
          <input className="field" type="date" name="date_to" defaultValue={dateTo} max={companyDateAt()} aria-label="To date" />
          <select className="field" name="employee" defaultValue={employee} aria-label="Filter by employee">
            <option value="">All employees</option>
            {employees.map((item) => <option key={item.id} value={item.id}>{item.employee_number} · {item.first_name} {item.last_name}</option>)}
          </select>
          <select className="field" name="department" defaultValue={department} aria-label="Filter by department">
            <option value="">All departments</option>
            {options.departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select className="field" name="segment_type" defaultValue={segmentType} aria-label="Filter by segment">
            <option value="">All segment types</option>
            <option value="pre_shift">Pre-shift</option><option value="post_shift">Post-shift</option>
            <option value="rest_day">Rest-day overtime</option><option value="holiday_work">Holiday work</option>
          </select>
          <select className="field" name="holiday_type" defaultValue={holidayType} aria-label="Filter by holiday type">
            <option value="">All holiday types</option>
            <option value="regular_holiday">Regular Holiday</option>
            <option value="special_non_working_holiday">Special Non-Working Holiday</option>
            <option value="company_holiday">Company Holiday</option>
          </select>
          <select className="field" name="status" defaultValue={status} aria-label="Filter by status">
            <option value="">All statuses</option><option value="pending">Pending</option>
            <option value="approved">Approved</option><option value="rejected">Rejected</option>
            <option value="superseded">Superseded</option>
          </select>
          <button className="btn" type="submit">Apply filters</button>
          <Link className="btn" href="/admin/overtime">Clear</Link>
        </form>

        <OvertimeApprovalTable items={result.items} />

        <nav className="pagination" aria-label="Overtime approval pages">
          <Link aria-disabled={result.page <= 1} className={`btn${result.page <= 1 ? " disabled" : ""}`} href={pageHref(filters, Math.max(1, result.page - 1))}>Previous</Link>
          <span>Page {result.page} of {result.totalPages} · {result.total} items</span>
          <Link aria-disabled={result.page >= result.totalPages} className={`btn${result.page >= result.totalPages ? " disabled" : ""}`} href={pageHref(filters, Math.min(result.totalPages, result.page + 1))}>Next</Link>
        </nav>
      </section>
    </>
  );
}
```

- [ ] **Step 6: Run UI and type tests**

Run:

```bash
npm test -- src/features/overtime/presentation.test.ts src/features/overtime/ui.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit the HR approval queue**

```bash
git add \
  src/features/overtime/presentation.ts \
  src/features/overtime/presentation.test.ts \
  src/features/overtime/ui.test.ts \
  src/components/overtime/overtime-approval-table.tsx \
  'src/app/(dashboard)/admin/overtime/page.tsx'
git commit -m "feat: add HR overtime approval queue"
```

---
### Task 11: Add Concurrency-Safe Full Approval and Rejection

**Files:**
- Modify: `supabase/migrations/202607150002_overtime_holidays.sql`
- Create: `src/app/(dashboard)/admin/overtime/actions.ts`
- Create: `src/app/(dashboard)/admin/overtime/[approvalItemId]/page.tsx`
- Create: `src/components/overtime/overtime-review-form.tsx`
- Modify: `src/features/overtime/actions.test.ts`
- Modify: `src/features/overtime/migration.test.ts`
- Modify: `src/features/overtime/security.test.ts`
- Modify: `src/features/overtime/ui.test.ts`

**Interfaces:**
- Consumes: `validateOvertimeReview`, `getOvertimeApprovalDetail`, active detection pointers, and HR authentication.
- Produces: `review_overtime_approval_item(uuid,text,text,text) -> uuid`, `reviewOvertimeApproval(state,formData)`, and `/admin/overtime/[approvalItemId]`.

- [ ] **Step 1: Write failing review concurrency and UI tests**

Append to `src/features/overtime/actions.test.ts`:

```ts
const reviewAction = await readFile(
  new URL("../../app/(dashboard)/admin/overtime/actions.ts", import.meta.url),
  "utf8",
).catch(() => "");
const reviewForm = await readFile(
  new URL("../../components/overtime/overtime-review-form.tsx", import.meta.url),
  "utf8",
).catch(() => "");

test("review validation requires rejection reason but permits empty approval note", () => {
  const approve = form({
    approval_item_id: employeeId,
    expected_status: "pending",
    decision: "approve",
    review_text: "",
  });
  assert.equal(validateOvertimeReview(approve).data?.reviewText, null);

  const reject = form({
    approval_item_id: employeeId,
    expected_status: "pending",
    decision: "reject",
    review_text: "",
  });
  assert.equal(validateOvertimeReview(reject).data, undefined);
  assert.equal(
    validateOvertimeReview(reject).state?.fieldErrors?.review_text,
    "A rejection reason is required.",
  );
});

test("review action calls protected RPC without supporting partial minutes", () => {
  assert.match(reviewAction, /\.rpc\("review_overtime_approval_item"/);
  assert.match(reviewAction, /p_expected_status:/);
  assert.match(reviewAction, /p_decision:/);
  assert.match(reviewAction, /p_review_text:/);
  assert.doesNotMatch(reviewAction, /approved_minutes\s*:/);
  assert.doesNotMatch(reviewAction, /console\.(log|error|warn)/);
});

test("review action maps stale and validation errors to safe copy", () => {
  assert.match(reviewAction, /OVERTIME_ITEM_STALE/);
  assert.match(reviewAction, /This overtime item changed while you were reviewing it\./);
  assert.match(reviewAction, /OVERTIME_REJECTION_REASON_REQUIRED/);
  assert.doesNotMatch(reviewAction, /SQLSTATE|constraint|stack/i);
});

test("review form exposes only full approve and full reject decisions", () => {
  assert.match(reviewForm, /value="approve"/);
  assert.match(reviewForm, /value="reject"/);
  assert.match(reviewForm, /name="review_text"/);
  assert.doesNotMatch(reviewForm, /name="approved_minutes"/);
});
```

Append to `src/features/overtime/migration.test.ts`:

```ts
test("review function locks and validates item plus active revision before deciding", () => {
  const review = migration.match(
    /create or replace function public\.review_overtime_approval_item[\s\S]*?\$\$;/i,
  )?.[0] ?? "";
  assert.match(review, /from public\.overtime_approval_items[\s\S]*for update/i);
  assert.match(review, /from public\.overtime_detection_revisions[\s\S]*for update/i);
  assert.match(review, /group_row\.active_revision_id <> revision\.id/i);
  assert.match(review, /item\.detected_minutes <> revision\.detected_minutes/i);
  assert.match(review, /OVERTIME_ITEM_STALE/i);
});

test("approval is all detected minutes and rejection is zero", () => {
  const review = migration.match(
    /create or replace function public\.review_overtime_approval_item[\s\S]*?\$\$;/i,
  )?.[0] ?? "";
  assert.match(review, /approved_minutes = item\.detected_minutes/i);
  assert.match(review, /approved_minutes = 0/i);
  assert.doesNotMatch(review, /p_approved_minutes/i);
});
```

Append to `src/features/overtime/ui.test.ts`:

```ts
const detailPage = await readFile(
  new URL("../../app/(dashboard)/admin/overtime/[approvalItemId]/page.tsx", import.meta.url),
  "utf8",
).catch(() => "");

test("approval detail includes every required source snapshot and prior history", () => {
  for (const label of [
    "Employee",
    "Attendance date",
    "Segment type",
    "Holiday",
    "Detected start",
    "Detected end",
    "Detected minutes",
    "Attendance calculation revision",
    "Schedule assignment",
    "Schedule version",
    "Overtime policy version",
    "Holiday version",
    "Approval status",
    "Created at",
    "Prior superseded items",
  ]) assert.match(detailPage, new RegExp(label));
});
```

- [ ] **Step 2: Run focused review tests and verify failure**

Run:

```bash
npm test -- \
  src/features/overtime/actions.test.ts \
  src/features/overtime/migration.test.ts \
  src/features/overtime/ui.test.ts
```

Expected: FAIL because the review function/action/form/detail route do not exist.

- [ ] **Step 3: Add the concurrency-safe review function**

Append to the migration:

```sql
create or replace function public.review_overtime_approval_item(
  p_approval_item_id uuid,
  p_expected_status text,
  p_decision text,
  p_review_text text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  item public.overtime_approval_items%rowtype;
  revision public.overtime_detection_revisions%rowtype;
  group_row public.overtime_detection_groups%rowtype;
  v_review_text text := nullif(btrim(coalesce(p_review_text, '')), '');
  v_status text;
begin
  if v_actor is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;
  if not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception using errcode = 'P0001', message = 'OVERTIME_DECISION_INVALID';
  end if;
  if p_expected_status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'OVERTIME_ITEM_STALE';
  end if;
  if v_review_text is not null and char_length(v_review_text) > 1000 then
    raise exception using errcode = 'P0001', message = 'PRIVATE_TEXT_TOO_LONG';
  end if;
  if p_decision = 'reject' and v_review_text is null then
    raise exception using errcode = 'P0001', message = 'OVERTIME_REJECTION_REASON_REQUIRED';
  end if;

  select approval.* into item
  from public.overtime_approval_items as approval
  where approval.id = p_approval_item_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'OVERTIME_ITEM_STALE';
  end if;

  select detection.* into revision
  from public.overtime_detection_revisions as detection
  where detection.id = item.detection_revision_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'OVERTIME_ITEM_STALE';
  end if;

  select detection_group.* into group_row
  from public.overtime_detection_groups as detection_group
  where detection_group.id = revision.detection_group_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'OVERTIME_ITEM_STALE';
  end if;

  if item.status <> p_expected_status
    or item.status <> 'pending'
    or item.superseded_at is not null
    or not revision.is_active
    or group_row.active_revision_id <> revision.id
    or item.detected_minutes <> revision.detected_minutes
  then
    raise exception using errcode = 'P0001', message = 'OVERTIME_ITEM_STALE';
  end if;

  if p_decision = 'approve' then
    update public.overtime_approval_items
    set status = 'approved',
        approved_minutes = item.detected_minutes,
        reviewed_by = v_actor,
        reviewed_at = now(),
        approval_note = v_review_text,
        rejection_reason = null
    where id = item.id;
    v_status := 'approved';
  else
    update public.overtime_approval_items
    set status = 'rejected',
        approved_minutes = 0,
        reviewed_by = v_actor,
        reviewed_at = now(),
        approval_note = null,
        rejection_reason = v_review_text
    where id = item.id;
    v_status := 'rejected';
  end if;

  perform public.write_employee_audit(
    group_row.employee_id,
    'overtime_approval.' || v_status,
    'overtime_approval',
    item.id,
    jsonb_build_array('attendance_date', 'segment_type', 'status', 'approved_minutes'),
    jsonb_build_object(
      'attendance_date', group_row.attendance_date,
      'segment_type', revision.segment_type,
      'status', 'pending',
      'approved_minutes', 0
    ),
    jsonb_build_object(
      'attendance_date', group_row.attendance_date,
      'segment_type', revision.segment_type,
      'status', v_status,
      'detected_minutes', revision.detected_minutes,
      'approved_minutes', case when v_status = 'approved' then revision.detected_minutes else 0 end,
      'revision_number', revision.revision_number,
      'holiday_version_id', revision.holiday_version_id,
      'overtime_policy_version_id', revision.overtime_policy_version_id
    ),
    '{}'::jsonb,
    'application',
    v_actor
  );

  return item.id;
exception
  when sqlstate 'P0001' then
    raise;
  when others then
    raise exception using errcode = 'P0001', message = 'OVERTIME_REVIEW_FAILED';
end;
$$;

revoke all on function public.review_overtime_approval_item(uuid, text, text, text)
  from public, anon;
grant execute on function public.review_overtime_approval_item(uuid, text, text, text)
  to authenticated;
```

- [ ] **Step 4: Add the review Server Action**

Create `src/app/(dashboard)/admin/overtime/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAttendanceAdmin } from "@/features/attendance/auth";
import type { OvertimeReviewActionState } from "@/features/overtime/types";
import { validateOvertimeReview } from "@/features/overtime/validation";

function reviewError(message: string) {
  if (message.includes("OVERTIME_ITEM_STALE")) {
    return "This overtime item changed while you were reviewing it.";
  }
  if (message.includes("OVERTIME_REJECTION_REASON_REQUIRED")) {
    return "A rejection reason is required.";
  }
  if (message.includes("OVERTIME_DECISION_INVALID")) {
    return "Choose approve or reject.";
  }
  if (message.includes("PRIVATE_TEXT_TOO_LONG")) {
    return "Review text must be 1,000 characters or fewer.";
  }
  return "The overtime item could not be reviewed.";
}

export async function reviewOvertimeApproval(
  _state: OvertimeReviewActionState,
  formData: FormData,
): Promise<OvertimeReviewActionState> {
  const { supabase } = await requireAttendanceAdmin();
  const validation = validateOvertimeReview(formData);
  if (!validation.data) {
    return validation.state ?? { error: "Invalid overtime review." };
  }

  const { error } = await supabase.rpc("review_overtime_approval_item", {
    p_approval_item_id: validation.data.approvalItemId,
    p_expected_status: validation.data.expectedStatus,
    p_decision: validation.data.decision,
    p_review_text: validation.data.reviewText,
  });
  if (error) return { error: reviewError(error.message) };

  revalidatePath("/admin/overtime");
  revalidatePath(`/admin/overtime/${validation.data.approvalItemId}`);
  revalidatePath("/attendance");
  revalidatePath("/admin/attendance");
  revalidatePath("/overtime");
  redirect(`/admin/overtime/${validation.data.approvalItemId}?success=reviewed`);
}
```

- [ ] **Step 5: Add the full approve/reject form**

Create `src/components/overtime/overtime-review-form.tsx`:

```tsx
"use client";

import { useActionState, useRef } from "react";
import type { OvertimeReviewActionState } from "@/features/overtime/types";

const initialState: OvertimeReviewActionState = {};

export function OvertimeReviewForm({
  approvalItemId,
  action,
}: {
  approvalItemId: string;
  action: (
    state: OvertimeReviewActionState,
    formData: FormData,
  ) => Promise<OvertimeReviewActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const reviewText = useRef<HTMLTextAreaElement>(null);

  return (
    <form action={formAction} className="card correction-review-form">
      <input type="hidden" name="approval_item_id" value={approvalItemId} />
      <input type="hidden" name="expected_status" value="pending" />
      <div>
        <h2 className="card-title">Review decision</h2>
        <p className="muted">
          Approval accepts every detected minute. Rejection accepts zero minutes and requires a reason.
        </p>
      </div>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <label>
        <span>Approval note or rejection reason</span>
        <textarea
          ref={reviewText}
          className="field organization-textarea"
          name="review_text"
          maxLength={1000}
          aria-invalid={Boolean(state.fieldErrors?.review_text)}
        />
        <small className="muted">Optional for approval; required for rejection. Maximum 1,000 characters.</small>
        {state.fieldErrors?.review_text && <span className="field-error">{state.fieldErrors.review_text}</span>}
      </label>
      <div className="form-actions">
        <button
          className="btn"
          disabled={pending}
          name="decision"
          type="submit"
          value="reject"
          onClick={(event) => {
            if (!reviewText.current?.value.trim()) {
              event.preventDefault();
              reviewText.current?.focus();
              return;
            }
            if (!window.confirm("Reject all detected overtime minutes?")) {
              event.preventDefault();
            }
          }}
        >
          {pending ? "Saving…" : "Reject all minutes"}
        </button>
        <button
          className="btn primary"
          disabled={pending}
          name="decision"
          type="submit"
          value="approve"
          onClick={(event) => {
            if (!window.confirm("Approve all detected overtime minutes?")) {
              event.preventDefault();
            }
          }}
        >
          {pending ? "Saving…" : "Approve all minutes"}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 6: Add the approval detail route**

Create `src/app/(dashboard)/admin/overtime/[approvalItemId]/page.tsx` with this structure:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { OvertimeReviewForm } from "@/components/overtime/overtime-review-form";
import { PageHeader } from "@/components/page-header";
import { formatAttendanceMinutes } from "@/features/attendance/calculations/presentation";
import { requireAttendanceAdmin } from "@/features/attendance/auth";
import { formatCompanyDate, formatCompanyDateTime } from "@/features/attendance/time";
import {
  holidayTypeLabel,
  overtimeApprovalStatusLabel,
  overtimeSegmentLabel,
} from "@/features/overtime/presentation";
import { getOvertimeApprovalDetail } from "@/features/overtime/queries";
import { reviewOvertimeApproval } from "../actions";

function reviewerName(
  reviewer: NonNullable<Awaited<ReturnType<typeof getOvertimeApprovalDetail>>>["reviewer"],
) {
  if (!reviewer) return "—";
  return reviewer.display_name || `${reviewer.first_name} ${reviewer.last_name}`.trim();
}

export default async function OvertimeApprovalDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ approvalItemId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAttendanceAdmin();
  const { approvalItemId } = await params;
  const query = await searchParams;
  const item = await getOvertimeApprovalDetail(approvalItemId);
  if (!item) notFound();
  const reviewable =
    item.status === "pending" &&
    item.detection_is_active &&
    !item.superseded_at;

  return (
    <>
      <PageHeader
        title="Overtime approval detail"
        description={`${item.employee.first_name} ${item.employee.last_name} · ${formatCompanyDate(item.attendance_date)}`}
        action={<Link className="btn" href="/admin/overtime">Back to approvals</Link>}
      />
      {query.success === "reviewed" && <p className="form-success">Overtime review saved.</p>}

      <section className="card">
        <dl className="attendance-detail-grid overtime-detail-grid">
          <div><dt>Employee</dt><dd>{item.employee.first_name} {item.employee.last_name} · {item.employee.employee_number}</dd></div>
          <div><dt>Attendance date</dt><dd>{formatCompanyDate(item.attendance_date)}</dd></div>
          <div><dt>Segment type</dt><dd>{overtimeSegmentLabel(item.segment_type)}</dd></div>
          <div><dt>Holiday</dt><dd>{item.holiday_name ? `${item.holiday_name} · ${holidayTypeLabel(item.holiday_type)}` : "—"}</dd></div>
          <div><dt>Detected start</dt><dd>{formatCompanyDateTime(item.detected_start_at)}</dd></div>
          <div><dt>Detected end</dt><dd>{formatCompanyDateTime(item.detected_end_at)}</dd></div>
          <div><dt>Detected minutes</dt><dd>{formatAttendanceMinutes(item.detected_minutes)}</dd></div>
          <div><dt>Approved minutes</dt><dd>{formatAttendanceMinutes(item.approved_minutes)}</dd></div>
          <div><dt>Approval status</dt><dd>{overtimeApprovalStatusLabel(item.status)}</dd></div>
          <div><dt>Created at</dt><dd>{formatCompanyDateTime(item.created_at)}</dd></div>
          <div><dt>Reviewed by</dt><dd>{reviewerName(item.reviewer)}</dd></div>
          <div><dt>Reviewed at</dt><dd>{formatCompanyDateTime(item.reviewed_at)}</dd></div>
          <div><dt>Attendance calculation revision</dt><dd><code>{item.attendance_calculation_revision_id}</code></dd></div>
          <div><dt>Schedule assignment</dt><dd><code>{item.schedule_assignment_id ?? "—"}</code></dd></div>
          <div><dt>Schedule version</dt><dd><code>{item.schedule_version_id ?? "—"}</code></dd></div>
          <div><dt>Overtime policy version</dt><dd><code>{item.overtime_policy_version_id ?? "Implicit default (30m)"}</code></dd></div>
          <div><dt>Holiday version</dt><dd><code>{item.holiday_version_id ?? "—"}</code></dd></div>
        </dl>
        {item.approval_note && <div className="private-text-block"><strong>Approval note</strong><p>{item.approval_note}</p></div>}
        {item.rejection_reason && <div className="private-text-block"><strong>Rejection reason</strong><p>{item.rejection_reason}</p></div>}
      </section>

      {reviewable && (
        <OvertimeReviewForm approvalItemId={item.id} action={reviewOvertimeApproval} />
      )}

      <section className="card">
        <h2 className="card-title">Prior superseded items</h2>
        {item.priorItems.length === 0 ? (
          <p className="empty">No prior approval items exist for this segment.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Revision</th><th>Status</th><th>Detected</th><th>Approved</th><th>Created</th><th>Action</th></tr></thead>
              <tbody>{item.priorItems.map((prior) => (
                <tr key={prior.id}>
                  <td>{prior.detection_revision_number}</td>
                  <td>{overtimeApprovalStatusLabel(prior.status)}</td>
                  <td>{formatAttendanceMinutes(prior.detected_minutes)}</td>
                  <td>{formatAttendanceMinutes(prior.approved_minutes)}</td>
                  <td>{formatCompanyDateTime(prior.created_at)}</td>
                  <td><Link className="table-link" href={`/admin/overtime/${prior.id}`}>View</Link></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
```

- [ ] **Step 7: Run review tests and type-check**

Run:

```bash
npm test -- \
  src/features/overtime/actions.test.ts \
  src/features/overtime/migration.test.ts \
  src/features/overtime/security.test.ts \
  src/features/overtime/ui.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 8: Commit approval review**

```bash
git add \
  supabase/migrations/202607150002_overtime_holidays.sql \
  src/features/overtime \
  'src/app/(dashboard)/admin/overtime/actions.ts' \
  'src/app/(dashboard)/admin/overtime/[approvalItemId]/page.tsx' \
  src/components/overtime/overtime-review-form.tsx
git commit -m "feat: add overtime approval review"
```

---
### Task 12: Add Employee Overtime History and Attendance-Page Summaries

**Files:**
- Create: `src/app/(dashboard)/overtime/page.tsx`
- Create: `src/components/overtime/employee-overtime-history.tsx`
- Create: `src/components/overtime/attendance-overtime-summary.tsx`
- Modify: `src/features/attendance/types.ts`
- Modify: `src/features/attendance/queries.ts`
- Modify: `src/features/attendance/queries.test.ts`
- Modify: `src/app/(dashboard)/attendance/page.tsx`
- Modify: `src/app/(dashboard)/admin/attendance/page.tsx`
- Modify: `src/components/attendance/attendance-calculation-card.tsx`
- Modify: `src/components/attendance/attendance-history.tsx`
- Modify: `src/components/attendance/admin-attendance-table.tsx`
- Modify: `src/features/overtime/ui.test.ts`
- Modify: `src/features/overtime/security.test.ts`

**Interfaces:**
- Consumes: employee-safe overtime RPC/query, HR summary query, holiday-aware attendance calculations.
- Produces: `/overtime`, employee-safe superseded history, and per-day overtime/holiday-work summaries on employee and HR attendance pages.

- [ ] **Step 1: Write failing employee visibility and attendance-integration tests**

Append to `src/features/overtime/ui.test.ts`:

```ts
const employeePage = await readFile(
  new URL("../../app/(dashboard)/overtime/page.tsx", import.meta.url),
  "utf8",
).catch(() => "");
const employeeHistory = await readFile(
  new URL("../../components/overtime/employee-overtime-history.tsx", import.meta.url),
  "utf8",
).catch(() => "");
const attendanceSummary = await readFile(
  new URL("../../components/overtime/attendance-overtime-summary.tsx", import.meta.url),
  "utf8",
).catch(() => "");
const attendanceHistory = await readFile(
  new URL("../../components/attendance/attendance-history.tsx", import.meta.url),
  "utf8",
);
const adminAttendance = await readFile(
  new URL("../../components/attendance/admin-attendance-table.tsx", import.meta.url),
  "utf8",
);

test("employee overtime page authenticates as employee and loads only safe history", () => {
  const authAt = employeePage.indexOf("await requireAttendanceEmployee()");
  const queryAt = employeePage.indexOf("getOwnOvertimeHistory(");
  assert.ok(authAt >= 0);
  assert.ok(queryAt > authAt);
  assert.doesNotMatch(employeePage, /getOvertimeApprovalDetail|getAdminOvertime/);
});

test("employee overtime history shows approved safe fields and superseded state", () => {
  for (const label of [
    "Attendance date",
    "Segment",
    "Detected",
    "Approved",
    "Status",
    "Approval date",
    "Holiday",
  ]) assert.match(employeeHistory, new RegExp(label));
  assert.match(employeeHistory, /Superseded/);
  assert.doesNotMatch(employeeHistory, /approval_note|rejection_reason|reviewed_by|recalculation_reason/);
});

test("attendance overtime summary includes every segment label and status", () => {
  assert.match(attendanceSummary, /overtimeSegmentLabel/);
  assert.match(attendanceSummary, /overtimeApprovalStatusLabel/);
  assert.match(attendanceSummary, /detected_minutes/);
  assert.match(attendanceHistory, /AttendanceOvertimeSummary/);
  assert.match(adminAttendance, /AttendanceOvertimeSummary/);
});
```

Append to `src/features/attendance/queries.test.ts`:

```ts
test("employee attendance history loads safe overtime summaries in parallel", () => {
  assert.match(source, /getOwnActiveOvertimeSummaryMap/);
  assert.match(source, /overtime:\s*overtimeMap\.get\(record\.attendance_date\)/);
});

test("admin attendance loads active overtime summaries by employee and date", () => {
  assert.match(source, /getAdminActiveOvertimeSummaryMap/);
  assert.match(source, /`\$\{record\.employee_id\}:\$\{record\.attendance_date\}`/);
});
```

- [ ] **Step 2: Run the tests and verify failure**

Run:

```bash
npm test -- \
  src/features/overtime/ui.test.ts \
  src/features/overtime/security.test.ts \
  src/features/attendance/queries.test.ts
```

Expected: FAIL because the employee page, summary components, and query integration do not exist.

- [ ] **Step 3: Extend attendance records with safe overtime summaries**

In `src/features/attendance/types.ts`, add:

```ts
import type { AttendanceOvertimeSummary } from "@/features/overtime/types";
```

Then add to `AttendanceRecord`:

```ts
overtime?: AttendanceOvertimeSummary[];
```

Calculation-only rows created in `attendance-days.ts` should initialize `overtime: []` so components never need to distinguish undefined from empty after query enrichment.

- [ ] **Step 4: Enrich employee and HR attendance queries**

Add imports to `src/features/attendance/queries.ts`:

```ts
import {
  getAdminActiveOvertimeSummaryMap,
  getOwnActiveOvertimeSummaryMap,
} from "@/features/overtime/queries";
```

In `getOwnAttendanceHistory`, change the parallel load to:

```ts
const [attendanceResult, calculationMap, overtimeMap] = await Promise.all([
  query,
  getOwnActiveCalculations({
    employeeId: params.employeeId,
    fromDate: params.fromDate,
    toDate: params.toDate,
  }),
  getOwnActiveOvertimeSummaryMap({
    fromDate: params.fromDate,
    toDate: params.toDate,
  }),
]);
```

After `mergeAttendanceDays`, attach summaries before filtering/pagination:

```ts
const merged = filterAttendanceDays(
  mergeAttendanceDays(records, [...calculationMap.values()]).map((record) => ({
    ...record,
    overtime: overtimeMap.get(record.attendance_date) ?? [],
  })),
  params.status,
);
```

In `getAdminAttendance`, add the overtime query to the existing `Promise.all` after calculation rows:

```ts
const [attendanceResult, calculationRows, overtimeMap] = await Promise.all([
  attendanceRequest,
  getAdminActiveCalculationRows({
    employeeIds: filteredEmployeeIds,
    fromDate: params.date || undefined,
    toDate: params.date || undefined,
  }),
  getAdminActiveOvertimeSummaryMap({
    employeeIds: filteredEmployeeIds ?? [],
    fromDate: params.date || undefined,
    toDate: params.date || undefined,
  }),
]);
```

When `filteredEmployeeIds` is `null`, derive the employee IDs from the merged records before fetching summaries. To avoid a second round trip, replace the above with this exact sequence:

```ts
const [attendanceResult, calculationRows] = await Promise.all([
  attendanceRequest,
  getAdminActiveCalculationRows({
    employeeIds: filteredEmployeeIds,
    fromDate: params.date || undefined,
    toDate: params.date || undefined,
  }),
]);
if (attendanceResult.error) throw new Error("Unable to load attendance records.");

const records = (attendanceResult.data ?? []).map((row) =>
  mapAttendance(row as unknown as Record<string, unknown>, companyDate),
);
const summaryEmployeeIds = [...new Set([
  ...records.map((record) => record.employee_id),
  ...calculationRows.map((row) => row.calculation.employee_id),
])];
const overtimeMap = await getAdminActiveOvertimeSummaryMap({
  employeeIds: summaryEmployeeIds,
  fromDate: params.date || undefined,
  toDate: params.date || undefined,
});
```

After `mergeAttendanceDays`, enrich every row:

```ts
merged = merged.map((record) => ({
  ...record,
  overtime:
    overtimeMap.get(`${record.employee_id}:${record.attendance_date}`) ?? [],
}));
```

Apply the same `getAdminActiveOvertimeSummaryMap` enrichment in `getEmployeeAttendanceHistory` so the HR employee-specific history page remains consistent.

- [ ] **Step 5: Create the reusable attendance summary component**

Create `src/components/overtime/attendance-overtime-summary.tsx`:

```tsx
import { formatAttendanceMinutes } from "@/features/attendance/calculations/presentation";
import {
  overtimeApprovalStatusLabel,
  overtimeSegmentLabel,
} from "@/features/overtime/presentation";
import type { AttendanceOvertimeSummary } from "@/features/overtime/types";

export function AttendanceOvertimeSummary({
  items,
  compact = false,
}: {
  items: AttendanceOvertimeSummary[];
  compact?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div className={`attendance-overtime-summary${compact ? " compact" : ""}`}>
      {items.map((item) => (
        <div key={`${item.segment_type}:${item.status}:${item.detected_minutes}`}>
          <span>{overtimeSegmentLabel(item.segment_type)}</span>
          <strong>
            {overtimeApprovalStatusLabel(item.status)} · {formatAttendanceMinutes(item.detected_minutes)}
          </strong>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Create the employee overtime history component**

Create `src/components/overtime/employee-overtime-history.tsx`:

```tsx
import { formatAttendanceMinutes } from "@/features/attendance/calculations/presentation";
import { formatCompanyDate, formatCompanyDateTime } from "@/features/attendance/time";
import {
  holidayTypeLabel,
  overtimeApprovalStatusLabel,
  overtimeSegmentLabel,
} from "@/features/overtime/presentation";
import type { SafeEmployeeOvertimeItem } from "@/features/overtime/types";

export function EmployeeOvertimeHistory({
  items,
}: {
  items: SafeEmployeeOvertimeItem[];
}) {
  if (items.length === 0) {
    return <div className="empty">No overtime items match these dates.</div>;
  }

  return (
    <div className="attendance-responsive-list">
      <div className="table-wrap attendance-desktop-table">
        <table>
          <thead><tr><th>Attendance date</th><th>Segment</th><th>Holiday</th><th>Detected</th><th>Approved</th><th>Status</th><th>Approval date</th></tr></thead>
          <tbody>{items.map((item, index) => (
            <tr key={`${item.attendance_date}:${item.segment_type}:${item.created_at}:${index}`}>
              <td>{formatCompanyDate(item.attendance_date)}</td>
              <td>{overtimeSegmentLabel(item.segment_type)}</td>
              <td>{item.holiday_name ? <>{item.holiday_name}<div className="muted">{holidayTypeLabel(item.holiday_type)}</div></> : "—"}</td>
              <td>{formatAttendanceMinutes(item.detected_minutes)}</td>
              <td>{formatAttendanceMinutes(item.approved_minutes)}</td>
              <td>{!item.is_active ? "Superseded" : overtimeApprovalStatusLabel(item.status)}</td>
              <td>{formatCompanyDateTime(item.approval_date)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="attendance-mobile-cards">
        {items.map((item, index) => (
          <article className="attendance-record-card" key={`${item.attendance_date}:${item.segment_type}:${item.created_at}:${index}`}>
            <div className="attendance-record-card-heading"><strong>{formatCompanyDate(item.attendance_date)}</strong><span className="badge info">{!item.is_active ? "Superseded" : overtimeApprovalStatusLabel(item.status)}</span></div>
            <dl>
              <div><dt>Segment</dt><dd>{overtimeSegmentLabel(item.segment_type)}</dd></div>
              <div><dt>Holiday</dt><dd>{item.holiday_name ?? "—"}</dd></div>
              <div><dt>Detected</dt><dd>{formatAttendanceMinutes(item.detected_minutes)}</dd></div>
              <div><dt>Approved</dt><dd>{formatAttendanceMinutes(item.approved_minutes)}</dd></div>
              <div><dt>Approval date</dt><dd>{formatCompanyDateTime(item.approval_date)}</dd></div>
            </dl>
          </article>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Build `/overtime` using only the safe query**

Create `src/app/(dashboard)/overtime/page.tsx`:

```tsx
import Link from "next/link";
import { EmployeeOvertimeHistory } from "@/components/overtime/employee-overtime-history";
import { PageHeader } from "@/components/page-header";
import { requireAttendanceEmployee } from "@/features/attendance/auth";
import { getOwnOvertimeHistory } from "@/features/overtime/queries";

function value(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] : input ?? "";
}
function pageHref(filters: Record<string, string>, page: number) {
  const search = new URLSearchParams();
  for (const [key, item] of Object.entries(filters)) if (item) search.set(key, item);
  if (page > 1) search.set("page", String(page));
  return `/overtime${search.size ? `?${search}` : ""}`;
}

export default async function OvertimePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAttendanceEmployee();
  const raw = await searchParams;
  const fromDate = value(raw.from);
  const toDate = value(raw.to);
  const page = Math.max(1, Number(value(raw.page) || "1") || 1);
  const result = await getOwnOvertimeHistory({ fromDate, toDate, page });
  const filters = { from: fromDate, to: toDate };

  return (
    <>
      <PageHeader
        title="My Overtime"
        description="Review detected, approved, rejected, and superseded overtime or holiday-work items."
        action={<Link className="btn" href="/attendance">View attendance</Link>}
      />
      <section className="card">
        <form className="toolbar" method="get">
          <input className="field" type="date" name="from" defaultValue={fromDate} aria-label="From date" />
          <input className="field" type="date" name="to" defaultValue={toDate} aria-label="To date" />
          <button className="btn" type="submit">Apply dates</button>
          {(fromDate || toDate) && <Link className="btn" href="/overtime">Clear</Link>}
        </form>
        <EmployeeOvertimeHistory items={result.items} />
        <nav className="pagination" aria-label="Overtime history pages">
          <Link aria-disabled={result.page <= 1} className={`btn${result.page <= 1 ? " disabled" : ""}`} href={pageHref(filters, Math.max(1, result.page - 1))}>Previous</Link>
          <span>Page {result.page} of {result.totalPages} · {result.total} items</span>
          <Link aria-disabled={result.page >= result.totalPages} className={`btn${result.page >= result.totalPages ? " disabled" : ""}`} href={pageHref(filters, Math.min(result.totalPages, result.page + 1))}>Next</Link>
        </nav>
      </section>
    </>
  );
}
```

- [ ] **Step 8: Show holiday context and overtime summaries on attendance cards/tables**

In `attendance-calculation-card.tsx`, import `holidayAttendanceLabel`, `holidayTypeLabel`, and `AttendanceOvertimeSummary`. Add a Holiday metric immediately after Schedule:

```tsx
{calculation.is_holiday && (
  <div>
    <span>Holiday</span>
    <strong>{calculation.holiday_name ?? holidayTypeLabel(calculation.holiday_type)}</strong>
  </div>
)}
```

For an attendance record with a calculation:

```tsx
<AttendanceOvertimeSummary items={record.overtime ?? []} compact />
```

Add that summary under Status in both desktop and mobile layouts of `attendance-history.tsx` and `admin-attendance-table.tsx`.

For holiday-specific copy in `attendance-history.tsx`:

```tsx
{record.calculation?.base_status === "holiday" && (
  <div className="muted">Worked: 0 · No approval required</div>
)}
{record.calculation?.is_holiday && record.calculation.actual_clock_out_at && (
  <div className="muted">
    {holidayTypeLabel(record.calculation.holiday_type)} · Holiday work
  </div>
)}
```

Use the same copy in the admin table mobile card. Do not expose approval/rejection reasons.

- [ ] **Step 9: Add holiday filters and cross-links**

In `/attendance`, add:

```tsx
<option value="holiday">Holiday</option>
```

and change the page-header action to:

```tsx
<div className="header-actions">
  <Link className="btn" href="/overtime">My overtime</Link>
  <Link className="btn" href="/attendance/corrections">Correction requests</Link>
</div>
```

In `/admin/attendance`, add `Holiday` to `calculation_status` and add an `Overtime approvals` header action linking to `/admin/overtime`.

- [ ] **Step 10: Run focused employee and attendance tests**

Run:

```bash
npm test -- \
  src/features/overtime/ui.test.ts \
  src/features/overtime/security.test.ts \
  src/features/attendance/queries.test.ts \
  src/features/attendance/calculations/attendance-days.test.ts \
  src/features/attendance/calculations/presentation.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 11: Commit employee and attendance integration**

```bash
git add \
  'src/app/(dashboard)/overtime/page.tsx' \
  'src/app/(dashboard)/attendance/page.tsx' \
  'src/app/(dashboard)/admin/attendance/page.tsx' \
  src/components/overtime \
  src/components/attendance \
  src/features/attendance \
  src/features/overtime/ui.test.ts \
  src/features/overtime/security.test.ts
git commit -m "feat: add employee overtime history"
```

---
### Task 13: Finish Navigation, Audit Presentation, Styling, and Documentation

**Files:**
- Modify: `src/components/sidebar.tsx`
- Modify: `src/app/(dashboard)/settings/page.tsx`
- Modify: `src/features/employees/audit/presentation.ts`
- Modify: `src/features/employees/audit/presentation.test.ts`
- Modify: `src/app/globals.css`
- Modify: `README.md`
- Modify: `src/features/overtime/ui.test.ts`

**Interfaces:**
- Consumes: completed employee, HR, policy, holiday, and recalculation routes.
- Produces: discoverable role-aware navigation, safe audit labels for all Phase 5B-2B actions, responsive styles, and deployment/acceptance documentation.

- [ ] **Step 1: Write failing navigation, audit, and documentation tests**

Append to `src/features/overtime/ui.test.ts`:

```ts
const sidebar = await readFile(
  new URL("../../components/sidebar.tsx", import.meta.url),
  "utf8",
);
const settingsPage = await readFile(
  new URL("../../app/(dashboard)/settings/page.tsx", import.meta.url),
  "utf8",
);
const readme = await readFile(new URL("../../../README.md", import.meta.url), "utf8");

test("navigation exposes employee overtime and HR administration routes by role", () => {
  assert.match(sidebar, /\["\/overtime", "My Overtime"/);
  assert.match(sidebar, /\["\/admin\/overtime", "Overtime Approvals"/);
  assert.match(sidebar, /\["\/admin\/overtime\/recalculate", "Recalculate Overtime"/);
  assert.match(sidebar, /\["\/settings\/overtime-policy", "Overtime Policy"/);
  assert.match(sidebar, /\["\/settings\/holidays", "Holidays"/);
});

test("settings cards expose overtime policy and holiday calendar to HR", () => {
  assert.match(settingsPage, /href: "\/settings\/overtime-policy"/);
  assert.match(settingsPage, /href: "\/settings\/holidays"/);
  assert.match(settingsPage, /restricted: true/);
});

test("README documents migration, routes, exclusions, and verification", () => {
  assert.match(readme, /202607150002_overtime_holidays\.sql/);
  assert.match(readme, /\/admin\/overtime\/recalculate/);
  assert.match(readme, /\/settings\/holidays\/\[holidayGroupId\]\/replace/);
  assert.match(readme, /npm test/);
  assert.match(readme, /npx tsc --noEmit/);
  assert.match(readme, /npm run build/);
});
```

Append to `src/features/employees/audit/presentation.test.ts`:

```ts
test("Phase 5B-2B audit actions have safe user-facing titles", () => {
  const actions = [
    ["overtime_policy.created", "Overtime policy created"],
    ["holiday.created", "Holiday created"],
    ["holiday.replaced", "Holiday replaced"],
    ["holiday.deactivated", "Holiday deactivated"],
    ["overtime_detection.created", "Overtime detected"],
    ["overtime_detection.recalculated", "Overtime recalculated"],
    ["overtime_detection.superseded", "Overtime detection superseded"],
    ["overtime_approval.approved", "Overtime approved"],
    ["overtime_approval.rejected", "Overtime rejected"],
    ["overtime_approval.superseded", "Overtime approval superseded"],
  ] as const;
  for (const [action, expected] of actions) {
    assert.equal(presentEmployeeAudit(makeAudit({ action })).title, expected);
  }
});

test("Phase 5B-2B safe audit fields have labels", () => {
  const entry = makeAudit({
    action: "overtime_detection.created",
    changed_fields: [
      "attendance_date",
      "segment_type",
      "holiday_type",
      "detected_minutes",
      "approved_minutes",
      "revision_number",
      "calculation_source",
    ],
  });
  const detail = presentEmployeeAudit(entry).detail ?? "";
  assert.match(detail, /Attendance date/);
  assert.match(detail, /Segment type/);
  assert.match(detail, /Holiday type/);
  assert.match(detail, /Detected minutes/);
  assert.match(detail, /Approved minutes/);
  assert.match(detail, /Revision number/);
  assert.match(detail, /Calculation source/);
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
npm test -- \
  src/features/overtime/ui.test.ts \
  src/features/employees/audit/presentation.test.ts
```

Expected: FAIL until navigation, audit labels, and README are updated.

- [ ] **Step 3: Add role-aware sidebar items without breaking longest-prefix matching**

Update `src/components/sidebar.tsx` imports to include `TimerReset` and `CalendarHeart` from `lucide-react`.

Replace `attendanceItems` with:

```tsx
const attendanceItems: readonly NavigationItem[] =
  role === "hr_admin" || role === "super_admin"
    ? [
        ["/attendance", "My Attendance", Clock3],
        ["/overtime", "My Overtime", TimerReset],
        ["/admin/attendance", "Attendance", Clock3],
        ["/admin/attendance/corrections", "Correction Requests", ClipboardCheck],
        ["/admin/attendance/recalculate", "Recalculate Attendance", CalendarRange],
        ["/admin/attendance/finalization", "Finalization Runs", CalendarDays],
        ["/admin/overtime", "Overtime Approvals", TimerReset],
        ["/admin/overtime/recalculate", "Recalculate Overtime", CalendarRange],
        ["/settings/attendance-policy", "Attendance Policy", Settings],
        ["/settings/overtime-policy", "Overtime Policy", TimerReset],
        ["/settings/holidays", "Holidays", CalendarHeart],
      ] as const
    : [
        ["/attendance", "My Attendance", Clock3],
        ["/overtime", "My Overtime", TimerReset],
      ] as const;
```

The existing longest-matching-href logic must remain unchanged so `/admin/overtime/recalculate` highlights its own entry instead of `/admin/overtime`.

- [ ] **Step 4: Add settings cards**

Update the icon import in `src/app/(dashboard)/settings/page.tsx` to include `TimerReset` and `CalendarHeart`, then add these entries after Attendance policy:

```tsx
{
  href: "/settings/overtime-policy",
  title: "Overtime policy",
  description: "Manage effective-dated minimum qualifying overtime minutes.",
  icon: TimerReset,
  status: "Available",
  restricted: true,
},
{
  href: "/settings/holidays",
  title: "Holiday calendar",
  description: "Create immutable regular, special non-working, and company holiday versions.",
  icon: CalendarHeart,
  status: "Available",
  restricted: true,
},
```

Change backend status copy to:

```tsx
<p className="muted">
  Supabase authentication, employee management, organization structure, work schedules, attendance calculations, holidays, and overtime approvals are connected. Leave, documents, payroll, and reports remain future phases.
</p>
```

- [ ] **Step 5: Add audit action and field labels**

Add these entries to `actionTitles` in `src/features/employees/audit/presentation.ts`:

```ts
"overtime_policy.created": "Overtime policy created",
"holiday.created": "Holiday created",
"holiday.replaced": "Holiday replaced",
"holiday.deactivated": "Holiday deactivated",
"overtime_detection.created": "Overtime detected",
"overtime_detection.recalculated": "Overtime recalculated",
"overtime_detection.superseded": "Overtime detection superseded",
"overtime_approval.approved": "Overtime approved",
"overtime_approval.rejected": "Overtime rejected",
"overtime_approval.superseded": "Overtime approval superseded",
```

Add these entries to `fieldLabels`:

```ts
segment_type: "Segment type",
holiday_type: "Holiday type",
detected_minutes: "Detected minutes",
approved_minutes: "Approved minutes",
revision_number: "Revision number",
policy_version_id: "Overtime policy version",
overtime_policy_version_id: "Overtime policy version",
holiday_version_id: "Holiday version",
calculation_source: "Calculation source",
minimum_qualifying_minutes: "Minimum qualifying minutes",
```

Do not add labels for any protected text field. Protected reasons and review text should never be present in the audit payload to present.

- [ ] **Step 6: Add responsive styling using existing tokens**

Append to `src/app/globals.css`:

```css
.overtime-metrics-grid {
  grid-template-columns: repeat(6, minmax(0, 1fr));
  margin-bottom: 1rem;
}

.overtime-filter-toolbar {
  display: grid;
  grid-template-columns: repeat(4, minmax(10rem, 1fr));
  align-items: end;
}

.overtime-detail-grid code {
  overflow-wrap: anywhere;
  white-space: normal;
}

.attendance-overtime-summary {
  display: grid;
  gap: 0.35rem;
  margin-top: 0.5rem;
}

.attendance-overtime-summary > div {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  color: var(--muted);
}

.attendance-overtime-summary > div strong {
  color: var(--text);
  text-align: right;
}

.attendance-overtime-summary.compact {
  font-size: 0.8125rem;
}

.holiday-version-history {
  display: grid;
  gap: 0.75rem;
}

.holiday-version-history .card {
  margin: 0;
}

@media (max-width: 1200px) {
  .overtime-metrics-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .overtime-filter-toolbar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 700px) {
  .overtime-metrics-grid,
  .overtime-filter-toolbar {
    grid-template-columns: 1fr;
  }

  .attendance-overtime-summary > div {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.1rem;
  }

  .attendance-overtime-summary > div strong {
    text-align: left;
  }
}
```

Use only variables already defined in `globals.css`; do not introduce a new color system.

- [ ] **Step 7: Document Phase 5B-2B deployment, routes, security, and verification**

Append this section to `README.md`:

````markdown
## Phase 5B-2B overtime and holidays

Apply the migration after Phase 5B-2A:

```text
supabase/migrations/202607150002_overtime_holidays.sql
```

Phase 5B-2B adds effective-dated overtime thresholds, immutable holiday versions, holiday-aware attendance revisions, immutable overtime detections, full HR approval/rejection, employee-safe history, and explicit overtime recalculation.

### Employee routes

```text
/overtime
/attendance
```

### HR Admin and Super Admin routes

```text
/settings/overtime-policy
/settings/overtime-policy/new
/settings/holidays
/settings/holidays/new
/settings/holidays/[holidayGroupId]
/settings/holidays/[holidayGroupId]/replace
/admin/overtime
/admin/overtime/[approvalItemId]
/admin/overtime/recalculate
```

### Calculation and security behavior

- The implicit overtime threshold is 30 completed whole minutes.
- Pre-shift and post-shift segments qualify independently.
- Holiday work overrides rest-day and normal scheduled overtime.
- Rest-day overtime overrides pre-shift and post-shift overtime.
- Holiday and rest-day work reuse finalized attendance worked minutes; breaks are never deducted twice.
- Approval always accepts all detected minutes; rejection accepts zero and requires a reason.
- Recalculation supersedes changed active detections and approval items while preserving history.
- Employee overtime history is provided only through `get_my_overtime_items` and excludes protected reasons, reviewer IDs, internal source IDs, and policy/holiday change reasons.
- Direct table mutation is unavailable to authenticated clients; protected writes use fixed-search-path security-definer functions.
- Holiday or policy changes never silently recalculate historical attendance or overtime.

### Verification

```bash
npm test
npx tsc --noEmit
npm run build
```
````

- [ ] **Step 8: Run focused tests and commit the presentation layer**

Run:

```bash
npm test -- \
  src/features/overtime/ui.test.ts \
  src/features/employees/audit/presentation.test.ts
npx tsc --noEmit
```

Expected: PASS.

Commit:

```bash
git add \
  src/components/sidebar.tsx \
  'src/app/(dashboard)/settings/page.tsx' \
  src/features/employees/audit/presentation.ts \
  src/features/employees/audit/presentation.test.ts \
  src/app/globals.css \
  README.md \
  src/features/overtime/ui.test.ts
git commit -m "docs: finish overtime and holiday integration"
```

---
### Task 14: Close the Migration and Run Full Security, Integration, and Production Verification

**Files:**
- Modify: `supabase/migrations/202607150002_overtime_holidays.sql`
- Modify: `src/features/overtime/migration.test.ts`
- Modify: `src/features/overtime/security.test.ts`
- Modify: `src/features/overtime/actions.test.ts`
- Modify: `src/features/overtime/queries.test.ts`
- Modify: `src/features/overtime/ui.test.ts`
- Modify: `src/features/attendance/calculations/migration.test.ts`
- Modify: `src/features/attendance/queries.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: every Phase 5B-2B database function, route, query, action, component, and migration statement.
- Produces: one atomic migration, explicit PostgREST cache refresh, complete static security coverage, and verified test/type/build output.

- [ ] **Step 1: Add final migration-closure and cross-feature tests**

Append to `src/features/overtime/migration.test.ts`:

```ts
test("Phase 5B-2B migration is one transaction and refreshes PostgREST once", () => {
  const normalized = migration.toLowerCase();
  assert.equal((normalized.match(/^begin;/gm) ?? []).length, 1);
  assert.equal((normalized.match(/^commit;/gm) ?? []).length, 1);
  assert.equal((normalized.match(/notify pgrst, 'reload schema';/g) ?? []).length, 1);
  assert.ok(normalized.lastIndexOf("notify pgrst, 'reload schema';") < normalized.lastIndexOf("commit;"));
});

test("all six required protected functions exist", () => {
  for (const name of [
    "create_overtime_policy_version",
    "create_holiday",
    "replace_holiday_version",
    "calculate_overtime_for_attendance_day",
    "recalculate_overtime_range",
    "review_overtime_approval_item",
  ]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${name}`, "i"));
  }
});

test("holiday and policy writes do not silently invoke historical recalculation", () => {
  for (const name of ["create_overtime_policy_version", "create_holiday", "replace_holiday_version"]) {
    const body = migration.match(
      new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\$\\$;`, "i"),
    )?.[0] ?? "";
    assert.doesNotMatch(body, /recalculate_overtime_range|calculate_attendance_day_internal/);
  }
});

test("active approved totals exclude superseded or inactive detection revisions", () => {
  assert.match(
    queriesSource,
    /row\.status === "approved" && row\.detection_is_active/,
  );
});
```

At the top of `migration.test.ts`, load `queriesSource` once:

```ts
const queriesSource = await readFile(
  new URL("./queries.ts", import.meta.url),
  "utf8",
);
```

Append to `src/features/overtime/security.test.ts`:

```ts
test("overtime and holiday tables have no authenticated direct mutation policies", () => {
  for (const table of [
    "overtime_policy_versions",
    "holiday_calendar_groups",
    "holiday_calendar_versions",
    "overtime_detection_groups",
    "overtime_detection_revisions",
    "overtime_approval_items",
  ]) {
    const tablePolicies = migration.match(
      new RegExp(`create policy[\\s\\S]*?on public\\.${table}[\\s\\S]*?;`, "gi"),
    ) ?? [];
    for (const policy of tablePolicies) {
      assert.doesNotMatch(policy, /for insert|for update|for delete/i);
    }
  }
});

test("every Phase 5B-2B security-definer function fixes search_path", () => {
  const functions = migration.match(
    /create or replace function public\.[\s\S]*?\$\$;/gi,
  ) ?? [];
  for (const fn of functions) {
    if (/security definer/i.test(fn)) {
      assert.match(fn, /set search_path = pg_catalog, public/i);
    }
  }
});

test("internal calculation helpers are revoked from all client roles", () => {
  for (const name of [
    "resolve_overtime_policy",
    "resolve_active_holiday",
    "write_overtime_detection_revision",
    "calculate_overtime_for_attendance_day",
    "validate_active_overtime_detection_revision",
  ]) {
    assert.match(
      migration,
      new RegExp(`revoke all on function public\\.${name}[\\s\\S]*?from public, anon, authenticated`, "i"),
    );
  }
});

test("audit JSON omits every protected overtime and holiday text field", () => {
  const auditCalls = migration.match(/perform public\.write_employee_audit\([\s\S]*?\);/gi) ?? [];
  const auditText = auditCalls.join("\n");
  for (const protectedName of [
    "p_change_reason",
    "p_recalculation_reason",
    "p_review_text",
    "approval_note",
    "rejection_reason",
  ]) {
    assert.doesNotMatch(auditText, new RegExp(protectedName, "i"));
  }
});
```

Append to `src/features/overtime/actions.test.ts`:

```ts
test("overtime actions expose no raw database text or protected input in logs and retry state", () => {
  const allActions = `${action}\n${reviewAction}`;
  assert.doesNotMatch(allActions, /console\.(log|error|warn)/);
  assert.doesNotMatch(allActions, /stack|sqlstate|constraint/i);
  assert.doesNotMatch(allActions, /values:\s*\{[^}]*(reason|reviewText|review_text)/s);
});
```

Append to `src/features/attendance/calculations/migration.test.ts`:

```ts
test("every attendance mutation path reaches overtime through the internal calculator", () => {
  const internal = phase5b2bMigration.match(
    /create or replace function public\.calculate_attendance_day_internal[\s\S]*?\$\$;/i,
  )?.[0] ?? "";
  assert.match(internal, /calculate_overtime_for_attendance_day/);
  for (const source of [
    "clock_in",
    "clock_out",
    "hr_create",
    "hr_correction",
    "correction_approval",
    "daily_finalization",
    "manual_recalculation",
    "manual_finalization",
  ]) {
    assert.match(internal, new RegExp(`'${source}'`));
  }
});
```

- [ ] **Step 2: Run all tests once before closing the migration**

Run:

```bash
npm test
```

Expected: the suite identifies any remaining implementation mismatch. Fix every failure before adding the transaction close so the final migration boundary is the last database edit.

- [ ] **Step 3: Close the migration exactly once**

At the end of `supabase/migrations/202607150002_overtime_holidays.sql`, append:

```sql
notify pgrst, 'reload schema';
commit;
```

Confirm there is exactly one `begin;` at the beginning and no earlier `commit;`.

- [ ] **Step 4: Apply the migration to a disposable Supabase database**

With the project linked to a disposable local or preview database, run:

```bash
npx supabase db reset
```

Expected:

```text
All migrations apply successfully through 202607150002_overtime_holidays.sql.
```

Then verify the new objects:

```bash
npx supabase db lint
```

Expected: no errors. Treat warnings about intentionally security-definer RPCs as review items; confirm each has fixed `search_path` and explicit grants/revokes before accepting it.

- [ ] **Step 5: Run the complete automated test suite**

Run:

```bash
npm test
```

Expected: every test passes with `0 fail`.

- [ ] **Step 6: Run strict TypeScript verification**

Run:

```bash
npx tsc --noEmit
```

Expected: command exits with code `0` and prints no TypeScript errors.

- [ ] **Step 7: Run the production build and verify all required routes compile**

Run:

```bash
npm run build
```

Expected: production build exits with code `0` and includes these routes:

```text
/settings/overtime-policy
/settings/overtime-policy/new
/settings/holidays
/settings/holidays/new
/settings/holidays/[holidayGroupId]
/settings/holidays/[holidayGroupId]/replace
/admin/overtime
/admin/overtime/[approvalItemId]
/admin/overtime/recalculate
/overtime
```

- [ ] **Step 8: Execute the manual acceptance matrix**

Use one normal scheduled day, one rest day, and one holiday date for a test employee. Record the created revision/item IDs in private test notes, not application logs.

```text
[ ] With no explicit policy, 29 completed minutes produces no item and 30 produces Pending.
[ ] A later effective policy applies only on/after its effective date.
[ ] Backdated policy creation without reason is rejected.
[ ] Duplicate policy effective date is rejected.
[ ] Regular, special non-working, and company holiday versions can be created.
[ ] Current/past holiday create or replacement without reason is rejected.
[ ] Replacement increments revision_number and leaves prior version unchanged.
[ ] Deactivation creates an inactive replacement and clears active application.
[ ] Holiday without attendance is Holiday, Worked 0, with no approval item.
[ ] Holiday missing clock-out is Missing clock-out and has no approval item.
[ ] Completed holiday attendance has no late/undertime and creates only Holiday work.
[ ] Holiday work suppresses rest-day, pre-shift, and post-shift detections.
[ ] Rest-day overtime suppresses pre-shift and post-shift detections.
[ ] Pre-shift and post-shift thresholds qualify independently.
[ ] Rest-day and holiday work reuse finalized worked_minutes with no second break deduction.
[ ] Approve sets approved_minutes exactly equal to detected_minutes.
[ ] Reject requires reason and sets approved_minutes to 0.
[ ] No UI or RPC accepts partial approved minutes.
[ ] Concurrent/stale review returns the safe stale message.
[ ] Recalculation that changes a result supersedes the old approval item.
[ ] Recalculation below threshold creates a non-qualifying revision and no new item.
[ ] Recalculation to zero creates a zero revision only for an existing group.
[ ] Unchanged recalculation creates no revision and preserves approval state.
[ ] Employee sees own active and superseded history only.
[ ] Employee cannot see notes, reasons, reviewer IDs, or internal source IDs.
[ ] HR queue filters and all six metrics use the selected result set.
[ ] Active approved total excludes superseded and inactive revisions.
[ ] Direct insert/update/delete attempts on all six tables fail.
[ ] Audit JSON contains safe IDs/minutes/status only and no protected text.
```

- [ ] **Step 9: Commit final verification and migration closure**

```bash
git add \
  supabase/migrations/202607150002_overtime_holidays.sql \
  src/features/overtime \
  src/features/attendance \
  README.md
git commit -m "test: verify overtime and holiday phase"
```

---

## Self-review result

### Spec coverage

| Approved requirement | Plan task |
|---|---:|
| Effective-dated overtime policy and implicit 30-minute default | 1, 3, 4 |
| Immutable holiday groups/versions, replacement, deactivation | 1, 3, 5 |
| Holiday-aware attendance classification | 7 |
| Pre-shift, post-shift, rest-day, holiday-work detection | 2, 6 |
| Precedence and whole-minute precision | 2, 6 |
| Below-threshold and zero-minute revision history | 6 |
| Full HR approval/rejection and stale review protection | 11 |
| Supersession after changed recalculation | 6, 8 |
| Explicit overtime recalculation | 8 |
| Employee-safe own history | 9, 12 |
| HR queue, filters, metrics, and detail | 9, 10, 11 |
| Attendance-page overtime summaries | 12 |
| Audit, RLS, fixed search path, revokes | 1, 3, 6, 9, 11, 13, 14 |
| Navigation, settings, documentation | 13 |
| Tests, TypeScript, production build | 14 |

### Design consistency checks

- Every database writer is a protected RPC; tables expose no direct client mutation.
- Attendance remains the sole source of finalized worked minutes.
- Overtime recalculation never edits attendance revisions.
- Holiday/policy changes never silently recalculate history.
- Employee queries use only safe RPC output.
- HR-only protected text never appears in employee contracts, audit payloads, query strings, logs, or retry state.
- Every new status, segment, and holiday type uses the same literal union across SQL, validation, query mapping, and UI presentation.
- Every task has a failing test, focused pass command, and commit boundary.

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-15-phase-5b2b-overtime-holidays.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — use `superpowers:subagent-driven-development`, dispatch a fresh implementation worker per task, and run specification plus code-quality review between tasks.
2. **Inline Execution** — use `superpowers:executing-plans`, execute tasks in ordered batches, and stop at the documented verification checkpoints.
