# Phase 5A Attendance MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mock attendance experience with a production MVP that supports server-authoritative employee clock-in/out, role-safe attendance history, direct HR corrections, employee correction requests, atomic approvals, and immutable audit coverage.

**Architecture:** Add one official daily attendance table and one correction-request table. PostgreSQL security-definer functions own all critical writes, concurrency controls, company-date calculations, and audit inserts; Next.js Server Actions parse forms and invoke those RPCs; server-rendered queries enforce role-safe filtering and pagination; client components handle only form interaction and presentation.

**Tech Stack:** Next.js 16.2.10 App Router, React 19.1.1, TypeScript 5.7, Supabase PostgreSQL/Auth/RLS, PostgreSQL PL/pgSQL, Node built-in test runner, existing `employee_audit_logs` infrastructure, existing CSS system.

## Global Constraints

- Company timezone is exactly `Asia/Manila` in both SQL and TypeScript.
- Employee clock timestamps come only from PostgreSQL `now()`.
- Store timestamps as `timestamptz`; display and derive attendance dates in `Asia/Manila`.
- One attendance record per employee per company date.
- One clock-in and one clock-out per company date; no breaks, split shifts, or overnight shifts.
- A previous open record blocks a new employee clock-in.
- An older open record is displayed as `missing_clock_out` without a midnight cron job or mutation-on-read.
- Employees see only their own records and requests.
- HR Admin and Super Admin see all attendance records and requests.
- Managers receive no direct-report attendance access.
- Employees cannot directly insert or update official attendance rows.
- Attendance records and correction requests have no permanent-delete route, action, or RLS policy.
- Direct HR creation and correction require a non-empty reason.
- Employee requests are limited to the current company date and the previous 30 calendar days.
- One pending request per employee and attendance date.
- A reviewer cannot approve or reject their own request.
- Free-text notes, reasons, and review notes are limited to 1,000 characters and never enter audit JSON or application logs.
- Approval updates official attendance and request status atomically.
- No GPS, selfie, device restriction, geofencing, schedules, late/undertime/overtime, payroll, leave reconciliation, or exports.
- No new runtime dependencies.
- Existing Phase 4B-2 behavior, tests, RLS, and audit immutability must remain intact.

---

## Baseline and migration order

The delivered Phase 4B-2 archive was previously verified with:

```text
91 tests passed
0 tests failed
TypeScript passed
Production build passed
```

Phase 5A adds this migration after Phase 4B-2:

```text
supabase/migrations/202607140003_attendance_mvp.sql
```

Apply the migration before deploying the Phase 5A application code.

---

## File map

### Create

- `supabase/migrations/202607140003_attendance_mvp.sql`
- `src/features/attendance/types.ts`
- `src/features/attendance/time.ts`
- `src/features/attendance/time.test.ts`
- `src/features/attendance/validation.ts`
- `src/features/attendance/validation.test.ts`
- `src/features/attendance/auth.ts`
- `src/features/attendance/queries.ts`
- `src/features/attendance/queries.test.ts`
- `src/features/attendance/migration.test.ts`
- `src/features/attendance/actions.test.ts`
- `src/features/attendance/presentation.ts`
- `src/features/attendance/presentation.test.ts`
- `src/app/(dashboard)/attendance/actions.ts`
- `src/app/(dashboard)/attendance/corrections/page.tsx`
- `src/app/(dashboard)/attendance/corrections/new/page.tsx`
- `src/app/(dashboard)/admin/attendance/page.tsx`
- `src/app/(dashboard)/admin/attendance/[employeeId]/page.tsx`
- `src/app/(dashboard)/admin/attendance/new/page.tsx`
- `src/app/(dashboard)/admin/attendance/[employeeId]/[recordId]/edit/page.tsx`
- `src/app/(dashboard)/admin/attendance/corrections/page.tsx`
- `src/app/(dashboard)/admin/attendance/corrections/[requestId]/page.tsx`
- `src/components/attendance/attendance-clock-card.tsx`
- `src/components/attendance/attendance-history.tsx`
- `src/components/attendance/correction-request-form.tsx`
- `src/components/attendance/correction-request-list.tsx`
- `src/components/attendance/cancel-correction-request-button.tsx`
- `src/components/attendance/admin-attendance-form.tsx`
- `src/components/attendance/admin-attendance-table.tsx`
- `src/components/attendance/correction-review-form.tsx`
- `src/components/attendance/attendance-status.tsx`
- `src/components/attendance/dashboard-attendance-summary.tsx`

### Modify

- `src/app/(dashboard)/attendance/page.tsx`
- `src/app/(dashboard)/dashboard/page.tsx`
- `src/app/(dashboard)/layout.tsx`
- `src/components/app-shell.tsx`
- `src/components/sidebar.tsx`
- `src/lib/utils.ts`
- `src/features/employees/audit/types.ts`
- `src/features/employees/audit/presentation.ts`
- `src/features/employees/audit/presentation.test.ts`
- `src/app/globals.css`
- `README.md`
- `docs/superpowers/specs/2026-07-14-phase-5a-attendance-mvp-design.md`
- `docs/superpowers/plans/2026-07-14-phase-5a-attendance-mvp.md`

---

## Shared interfaces

Create these exact public contracts in `src/features/attendance/types.ts` during Task 2 and use them unchanged in later tasks:

```ts
export const COMPANY_TIME_ZONE = "Asia/Manila" as const;

export const attendanceStoredStatuses = ["clocked_in", "completed"] as const;
export type AttendanceStoredStatus = typeof attendanceStoredStatuses[number];

export const attendanceEffectiveStatuses = [
  "clocked_in",
  "completed",
  "missing_clock_out",
] as const;
export type AttendanceEffectiveStatus = typeof attendanceEffectiveStatuses[number];

export const correctionRequestTypes = [
  "add_missing_clock_in",
  "add_missing_clock_out",
  "change_clock_in",
  "change_clock_out",
] as const;
export type CorrectionRequestType = typeof correctionRequestTypes[number];

export const correctionRequestStatuses = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
] as const;
export type CorrectionRequestStatus = typeof correctionRequestStatuses[number];

export type AttendanceActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

export type AttendanceEmployeeSummary = {
  id: string;
  profile_id: string | null;
  employee_number: string;
  first_name: string;
  last_name: string;
  department_id: string | null;
  department: { id: string; name: string } | null;
};

export type AttendanceRecord = {
  id: string;
  employee_id: string;
  attendance_date: string;
  clock_in_at: string;
  clock_out_at: string | null;
  clock_in_note: string | null;
  clock_out_note: string | null;
  status: AttendanceStoredStatus;
  effective_status: AttendanceEffectiveStatus;
  is_corrected: boolean;
  last_corrected_at: string | null;
  last_corrected_by: string | null;
  last_correction_reason: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  employee?: AttendanceEmployeeSummary | null;
};

export type AttendanceCorrectionRequest = {
  id: string;
  employee_id: string;
  attendance_record_id: string | null;
  attendance_date: string;
  request_type: CorrectionRequestType;
  requested_clock_in_at: string | null;
  requested_clock_out_at: string | null;
  reason: string;
  employee_note: string | null;
  status: CorrectionRequestStatus;
  requested_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
  employee?: AttendanceEmployeeSummary | null;
  attendance_record?: AttendanceRecord | null;
  reviewer?: {
    id: string;
    display_name: string | null;
    first_name: string;
    last_name: string;
  } | null;
};

export type PaginatedAttendance = {
  records: AttendanceRecord[];
  page: number;
  pageSize: 20;
  total: number;
  totalPages: number;
};

export type PaginatedCorrectionRequests = {
  requests: AttendanceCorrectionRequest[];
  page: number;
  pageSize: 20;
  total: number;
  totalPages: number;
};

export type TodayAttendanceContext = {
  companyDate: string;
  employee: AttendanceEmployeeSummary;
  todayRecord: AttendanceRecord | null;
  previousOpenRecord: AttendanceRecord | null;
};
```

---

### Task 1: Add attendance tables, constraints, RLS, and migration source tests

**Files:**
- Create: `supabase/migrations/202607140003_attendance_mvp.sql`
- Create: `src/features/attendance/migration.test.ts`

**Interfaces:**
- Produces tables `public.attendance_records` and `public.attendance_correction_requests`.
- Produces helper `public.company_attendance_date(p_timestamp timestamptz default now()) returns date`.
- Reuses `public.is_hr_admin()`, `public.current_user_role()`, and `public.write_employee_audit(...)`.

- [ ] **Step 1: Write the failing migration source tests**

Create `src/features/attendance/migration.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL(
    "../../../supabase/migrations/202607140003_attendance_mvp.sql",
    import.meta.url,
  ),
  "utf8",
);

test("migration creates attendance and correction request tables", () => {
  assert.match(sql, /create table if not exists public\.attendance_records/i);
  assert.match(sql, /create table if not exists public\.attendance_correction_requests/i);
  assert.match(sql, /unique \(employee_id, attendance_date\)/i);
  assert.match(sql, /where status = 'pending'/i);
});

test("attendance constraints reject invalid timestamps and long private text", () => {
  assert.match(sql, /clock_out_at is null or clock_out_at > clock_in_at/i);
  assert.match(sql, /char_length\(clock_in_note\) <= 1000/i);
  assert.match(sql, /char_length\(clock_out_note\) <= 1000/i);
  assert.match(sql, /char_length\(last_correction_reason\) <= 1000/i);
  assert.match(sql, /char_length\(reason\) <= 1000/i);
  assert.match(sql, /char_length\(review_note\) <= 1000/i);
});

test("RLS allows own or HR reads but no direct attendance writes or deletes", () => {
  assert.match(sql, /alter table public\.attendance_records enable row level security/i);
  assert.match(sql, /alter table public\.attendance_correction_requests enable row level security/i);
  assert.match(sql, /employee\.profile_id = auth\.uid\(\)/i);
  assert.match(sql, /public\.is_hr_admin\(\)/i);
  assert.doesNotMatch(
    sql,
    /create policy[^;]+on public\.attendance_records[^;]+for delete/i,
  );
  assert.doesNotMatch(
    sql,
    /create policy[^;]+on public\.attendance_records[^;]+for update/i,
  );
  assert.doesNotMatch(
    sql,
    /create policy[^;]+on public\.attendance_correction_requests[^;]+for delete/i,
  );
});

test("company date is fixed to Asia Manila", () => {
  assert.match(sql, /create or replace function public\.company_attendance_date/i);
  assert.match(sql, /at time zone 'Asia\/Manila'/i);
});

test("privileged functions use a fixed search path and restricted grants", () => {
  assert.match(sql, /set search_path = pg_catalog, public/i);
  assert.match(sql, /revoke all on function public\./i);
  assert.match(sql, /from public, anon/i);
});

test("attendance audit builders never include private text fields", () => {
  assert.doesNotMatch(
    sql,
    /write_employee_audit\([^;]+(clock_in_note|clock_out_note|last_correction_reason|reason|employee_note|review_note)/is,
  );
});
```

- [ ] **Step 2: Run the migration test and verify it fails**

Run:

```bash
npm test -- src/features/attendance/migration.test.ts
```

Expected: FAIL with `ENOENT` for `202607140003_attendance_mvp.sql`.

- [ ] **Step 3: Create the schema and indexes**

Start `supabase/migrations/202607140003_attendance_mvp.sql` with:

```sql
begin;

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  attendance_date date not null,
  clock_in_at timestamptz not null,
  clock_out_at timestamptz,
  clock_in_note text,
  clock_out_note text,
  status text not null default 'clocked_in',
  is_corrected boolean not null default false,
  last_corrected_at timestamptz,
  last_corrected_by uuid references public.profiles(id) on delete set null,
  last_correction_reason text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_records_employee_date_unique
    unique (employee_id, attendance_date),
  constraint attendance_records_status_check
    check (status in ('clocked_in', 'completed')),
  constraint attendance_records_clock_order_check
    check (clock_out_at is null or clock_out_at > clock_in_at),
  constraint attendance_records_clock_in_note_length_check
    check (clock_in_note is null or char_length(clock_in_note) <= 1000),
  constraint attendance_records_clock_out_note_length_check
    check (clock_out_note is null or char_length(clock_out_note) <= 1000),
  constraint attendance_records_correction_reason_length_check
    check (
      last_correction_reason is null
      or char_length(last_correction_reason) <= 1000
    )
);

create index if not exists attendance_records_employee_date_idx
  on public.attendance_records(employee_id, attendance_date desc, id desc);
create index if not exists attendance_records_open_idx
  on public.attendance_records(employee_id, attendance_date)
  where clock_out_at is null;
create index if not exists attendance_records_date_status_idx
  on public.attendance_records(attendance_date, status);

create table if not exists public.attendance_correction_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  attendance_record_id uuid references public.attendance_records(id) on delete set null,
  attendance_date date not null,
  request_type text not null,
  requested_clock_in_at timestamptz,
  requested_clock_out_at timestamptz,
  reason text not null,
  employee_note text,
  status text not null default 'pending',
  requested_by uuid not null references public.profiles(id) on delete restrict,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_correction_request_type_check
    check (request_type in (
      'add_missing_clock_in',
      'add_missing_clock_out',
      'change_clock_in',
      'change_clock_out'
    )),
  constraint attendance_correction_request_status_check
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  constraint attendance_correction_reason_required_check
    check (char_length(btrim(reason)) between 1 and 1000),
  constraint attendance_correction_employee_note_length_check
    check (employee_note is null or char_length(employee_note) <= 1000),
  constraint attendance_correction_review_note_length_check
    check (review_note is null or char_length(review_note) <= 1000)
);

create unique index if not exists attendance_correction_one_pending_per_day_idx
  on public.attendance_correction_requests(employee_id, attendance_date)
  where status = 'pending';
create index if not exists attendance_correction_employee_created_idx
  on public.attendance_correction_requests(employee_id, created_at desc, id desc);
create index if not exists attendance_correction_status_created_idx
  on public.attendance_correction_requests(status, created_at, id);
```

- [ ] **Step 4: Add the canonical company-date helper**

Append:

```sql
create or replace function public.company_attendance_date(
  p_timestamp timestamptz default now()
)
returns date
language sql
stable
set search_path = pg_catalog, public
as $$
  select (p_timestamp at time zone 'Asia/Manila')::date;
$$;

revoke all on function public.company_attendance_date(timestamptz)
  from public, anon;
grant execute on function public.company_attendance_date(timestamptz)
  to authenticated;
```

- [ ] **Step 5: Add RLS read policies and intentionally omit direct write policies**

Append:

```sql
alter table public.attendance_records enable row level security;
alter table public.attendance_correction_requests enable row level security;

drop policy if exists "Employees view own attendance and HR views all"
  on public.attendance_records;
create policy "Employees view own attendance and HR views all"
on public.attendance_records
for select to authenticated
using (
  public.is_hr_admin()
  or exists (
    select 1
    from public.employees as employee
    where employee.id = attendance_records.employee_id
      and employee.profile_id = auth.uid()
  )
);

drop policy if exists "Employees view own corrections and HR views all"
  on public.attendance_correction_requests;
create policy "Employees view own corrections and HR views all"
on public.attendance_correction_requests
for select to authenticated
using (
  public.is_hr_admin()
  or requested_by = auth.uid()
);

-- No direct INSERT, UPDATE, or DELETE policy is created for either table.
-- All writes use protected attendance RPC functions.
```

- [ ] **Step 6: Finish the migration transaction**

Append:

```sql
notify pgrst, 'reload schema';
commit;
```

- [ ] **Step 7: Run the migration source tests**

Run:

```bash
npm test -- src/features/attendance/migration.test.ts
```

Expected: all tests in `migration.test.ts` PASS.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/202607140003_attendance_mvp.sql \
  src/features/attendance/migration.test.ts
git commit -m "feat: add attendance MVP schema"
```

---

### Task 2: Add attendance types, company-time utilities, and validation

**Files:**
- Create: `src/features/attendance/types.ts`
- Create: `src/features/attendance/time.ts`
- Create: `src/features/attendance/time.test.ts`
- Create: `src/features/attendance/validation.ts`
- Create: `src/features/attendance/validation.test.ts`

**Interfaces:**
- Produces all Shared interfaces.
- Produces `companyDateAt(date?: Date): string`.
- Produces `effectiveAttendanceStatus(record, companyDate)`.
- Produces `formatCompanyDate`, `formatCompanyTime`, and `formatCompanyDateTime`.
- Produces form validators used by all Server Actions.

- [ ] **Step 1: Create attendance types**

Create `src/features/attendance/types.ts` with the exact Shared interfaces at the start of this plan.

- [ ] **Step 2: Write failing company-time tests**

Create `src/features/attendance/time.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  companyDateAt,
  effectiveAttendanceStatus,
  formatCompanyTime,
} from "./time.ts";

const baseRecord = {
  attendance_date: "2026-07-14",
  clock_out_at: null,
  status: "clocked_in" as const,
};

test("company date uses Asia Manila around UTC midnight", () => {
  assert.equal(companyDateAt(new Date("2026-07-13T15:59:59.000Z")), "2026-07-13");
  assert.equal(companyDateAt(new Date("2026-07-13T16:00:00.000Z")), "2026-07-14");
});

test("an older open record is effectively missing a clock-out", () => {
  assert.equal(
    effectiveAttendanceStatus(baseRecord, "2026-07-15"),
    "missing_clock_out",
  );
  assert.equal(
    effectiveAttendanceStatus(baseRecord, "2026-07-14"),
    "clocked_in",
  );
});

test("a record with a clock-out is completed", () => {
  assert.equal(
    effectiveAttendanceStatus(
      { ...baseRecord, clock_out_at: "2026-07-14T09:00:00.000Z", status: "completed" },
      "2026-07-15",
    ),
    "completed",
  );
});

test("company time formatting renders Manila time", () => {
  assert.match(formatCompanyTime("2026-07-14T00:03:00.000Z"), /8:03\s*AM/i);
});
```

- [ ] **Step 3: Run the time tests and verify failure**

```bash
npm test -- src/features/attendance/time.test.ts
```

Expected: FAIL because `time.ts` does not exist.

- [ ] **Step 4: Implement company-time utilities**

Create `src/features/attendance/time.ts`:

```ts
import {
  COMPANY_TIME_ZONE,
  type AttendanceEffectiveStatus,
  type AttendanceStoredStatus,
} from "./types.ts";

function parts(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: COMPANY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
}

export function companyDateAt(date = new Date()) {
  const values = Object.fromEntries(parts(date).map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function effectiveAttendanceStatus(
  record: {
    attendance_date: string;
    clock_out_at: string | null;
    status: AttendanceStoredStatus;
  },
  companyDate: string,
): AttendanceEffectiveStatus {
  if (record.clock_out_at) return "completed";
  if (record.attendance_date < companyDate) return "missing_clock_out";
  return "clocked_in";
}

export function formatCompanyDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: COMPANY_TIME_ZONE,
    dateStyle: "medium",
  }).format(new Date(`${value}T00:00:00+08:00`));
}

export function formatCompanyTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: COMPANY_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatCompanyDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: COMPANY_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
```

- [ ] **Step 5: Write failing validation tests**

Create `src/features/attendance/validation.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  validateClockNote,
  validateCorrectionRequest,
  validateHrAttendance,
  validateReviewDecision,
} from "./validation.ts";

function data(values: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

test("optional clock notes trim to null and reject more than 1000 characters", () => {
  assert.equal(validateClockNote(data({ note: "   " })).data?.note, null);
  assert.equal(validateClockNote(data({ note: "  handoff complete  " })).data?.note, "handoff complete");
  assert.equal(
    validateClockNote(data({ note: "x".repeat(1001) })).state?.fieldErrors?.note,
    "Note must be 1,000 characters or fewer.",
  );
});

test("HR attendance requires date, clock-in, and a correction reason", () => {
  const result = validateHrAttendance(data({
    attendance_date: "",
    clock_in_local: "",
    clock_out_local: "",
    reason: "",
  }));
  assert.equal(result.data, undefined);
  assert.equal(result.state?.fieldErrors?.attendance_date, "Attendance date is required.");
  assert.equal(result.state?.fieldErrors?.clock_in_local, "Clock-in time is required.");
  assert.equal(result.state?.fieldErrors?.reason, "A correction reason is required.");
});

test("correction request fields follow the selected request type", () => {
  const result = validateCorrectionRequest(data({
    attendance_date: "2026-07-14",
    request_type: "add_missing_clock_out",
    requested_clock_in_local: "",
    requested_clock_out_local: "",
    reason: "Forgot to clock out",
    employee_note: "",
  }));
  assert.equal(
    result.state?.fieldErrors?.requested_clock_out_local,
    "Requested clock-out time is required.",
  );
});

test("review decision accepts approve or reject and never echoes review text in errors", () => {
  assert.equal(validateReviewDecision(data({ decision: "approve", review_note: "" })).data?.decision, "approve");
  const sentinel = "DO_NOT_LOG_REVIEW_TEXT";
  const invalid = validateReviewDecision(data({ decision: "hold", review_note: sentinel }));
  assert.doesNotMatch(JSON.stringify(invalid.state), new RegExp(sentinel));
});
```

- [ ] **Step 6: Implement form validation**

Create `src/features/attendance/validation.ts`:

```ts
import {
  correctionRequestTypes,
  type AttendanceActionState,
  type CorrectionRequestType,
} from "./types.ts";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function optionalText(value: string) {
  return value || null;
}

function privateTextError(value: string, required: boolean, requiredMessage: string) {
  if (required && !value) return requiredMessage;
  if (value.length > 1000) return "Must be 1,000 characters or fewer.";
  return null;
}

export function validateClockNote(formData: FormData): {
  data?: { note: string | null };
  state?: AttendanceActionState;
} {
  const note = text(formData, "note");
  if (note.length > 1000) {
    return { state: { fieldErrors: { note: "Note must be 1,000 characters or fewer." } } };
  }
  return { data: { note: optionalText(note) } };
}

export function validateHrAttendance(formData: FormData): {
  data?: {
    attendanceDate: string;
    clockInLocal: string;
    clockOutLocal: string | null;
    reason: string;
  };
  state?: AttendanceActionState;
} {
  const attendanceDate = text(formData, "attendance_date");
  const clockInLocal = text(formData, "clock_in_local");
  const clockOutLocal = text(formData, "clock_out_local");
  const reason = text(formData, "reason");
  const fieldErrors: Record<string, string> = {};

  if (!/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate)) {
    fieldErrors.attendance_date = "Attendance date is required.";
  }
  if (!clockInLocal) fieldErrors.clock_in_local = "Clock-in time is required.";
  const reasonError = privateTextError(reason, true, "A correction reason is required.");
  if (reasonError) {
    fieldErrors.reason = reasonError === "Must be 1,000 characters or fewer."
      ? "Correction reason must be 1,000 characters or fewer."
      : reasonError;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      state: {
        error: "Please correct the highlighted fields.",
        fieldErrors,
        values: { attendance_date: attendanceDate, clock_in_local: clockInLocal, clock_out_local: clockOutLocal },
      },
    };
  }

  return {
    data: {
      attendanceDate,
      clockInLocal,
      clockOutLocal: optionalText(clockOutLocal),
      reason,
    },
  };
}

export function validateCorrectionRequest(formData: FormData): {
  data?: {
    attendanceDate: string;
    requestType: CorrectionRequestType;
    requestedClockInLocal: string | null;
    requestedClockOutLocal: string | null;
    reason: string;
    employeeNote: string | null;
  };
  state?: AttendanceActionState;
} {
  const attendanceDate = text(formData, "attendance_date");
  const requestType = text(formData, "request_type");
  const requestedClockInLocal = text(formData, "requested_clock_in_local");
  const requestedClockOutLocal = text(formData, "requested_clock_out_local");
  const reason = text(formData, "reason");
  const employeeNote = text(formData, "employee_note");
  const fieldErrors: Record<string, string> = {};

  if (!/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate)) {
    fieldErrors.attendance_date = "Attendance date is required.";
  }
  if (!correctionRequestTypes.includes(requestType as CorrectionRequestType)) {
    fieldErrors.request_type = "Choose a valid correction type.";
  }
  if (["add_missing_clock_in", "change_clock_in"].includes(requestType) && !requestedClockInLocal) {
    fieldErrors.requested_clock_in_local = "Requested clock-in time is required.";
  }
  if (["add_missing_clock_out", "change_clock_out"].includes(requestType) && !requestedClockOutLocal) {
    fieldErrors.requested_clock_out_local = "Requested clock-out time is required.";
  }
  const reasonError = privateTextError(reason, true, "A reason is required.");
  if (reasonError) fieldErrors.reason = reasonError;
  const noteError = privateTextError(employeeNote, false, "");
  if (noteError) fieldErrors.employee_note = noteError;

  if (Object.keys(fieldErrors).length > 0) {
    return {
      state: {
        error: "Please correct the highlighted fields.",
        fieldErrors,
        values: {
          attendance_date: attendanceDate,
          request_type: requestType,
          requested_clock_in_local: requestedClockInLocal,
          requested_clock_out_local: requestedClockOutLocal,
        },
      },
    };
  }

  return {
    data: {
      attendanceDate,
      requestType: requestType as CorrectionRequestType,
      requestedClockInLocal: optionalText(requestedClockInLocal),
      requestedClockOutLocal: optionalText(requestedClockOutLocal),
      reason,
      employeeNote: optionalText(employeeNote),
    },
  };
}

export function validateReviewDecision(formData: FormData): {
  data?: { decision: "approve" | "reject"; reviewNote: string | null };
  state?: AttendanceActionState;
} {
  const decision = text(formData, "decision");
  const reviewNote = text(formData, "review_note");
  const fieldErrors: Record<string, string> = {};

  if (decision !== "approve" && decision !== "reject") {
    fieldErrors.decision = "Choose approve or reject.";
  }
  if (reviewNote.length > 1000) {
    fieldErrors.review_note = "Review note must be 1,000 characters or fewer.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { state: { error: "Unable to review this request.", fieldErrors } };
  }
  return {
    data: {
      decision: decision as "approve" | "reject",
      reviewNote: optionalText(reviewNote),
    },
  };
}
```

- [ ] **Step 7: Run unit tests**

```bash
npm test -- src/features/attendance/time.test.ts \
  src/features/attendance/validation.test.ts
```

Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/features/attendance/types.ts \
  src/features/attendance/time.ts \
  src/features/attendance/time.test.ts \
  src/features/attendance/validation.ts \
  src/features/attendance/validation.test.ts
git commit -m "feat: add attendance domain utilities"
```

---

### Task 3: Add atomic employee clock-in and clock-out RPCs

**Files:**
- Modify: `supabase/migrations/202607140003_attendance_mvp.sql`
- Modify: `src/features/attendance/migration.test.ts`

**Interfaces:**
- Produces `public.clock_in_attendance(p_note text default null) returns uuid`.
- Produces `public.clock_out_attendance(p_note text default null) returns uuid`.
- Both RPCs are executable by `authenticated` only.

- [ ] **Step 1: Add failing RPC source tests**

Append to `src/features/attendance/migration.test.ts`:

```ts
test("employee clock RPCs use PostgreSQL time and lock employee state", () => {
  assert.match(sql, /create or replace function public\.clock_in_attendance/i);
  assert.match(sql, /create or replace function public\.clock_out_attendance/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /clock_in_at[\s\S]+now\(\)/i);
  assert.match(sql, /clock_out_at[\s\S]+now\(\)/i);
  assert.match(sql, /attendance\.clocked_in/i);
  assert.match(sql, /attendance\.clocked_out/i);
});

test("clock-in blocks older open records and duplicate company dates", () => {
  assert.match(sql, /attendance_date < v_company_date[\s\S]+clock_out_at is null/i);
  assert.match(sql, /attendance_records_employee_date_unique/i);
});

test("clock RPC audit payloads exclude employee notes", () => {
  assert.doesNotMatch(
    sql,
    /attendance\.clocked_(in|out)[\s\S]+(clock_in_note|clock_out_note)/i,
  );
});
```

- [ ] **Step 2: Run the test and verify failure**

```bash
npm test -- src/features/attendance/migration.test.ts
```

Expected: FAIL because the clock RPC definitions are absent.

- [ ] **Step 3: Add a shared private-text normalizer**

Insert before the final `notify` in the migration:

```sql
create or replace function public.normalize_attendance_private_text(
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
    raise exception using errcode = 'P0001', message = 'REQUIRED_PRIVATE_TEXT';
  end if;
  if v_value is not null and char_length(v_value) > 1000 then
    raise exception using errcode = 'P0001', message = 'PRIVATE_TEXT_TOO_LONG';
  end if;
  return v_value;
end;
$$;

revoke all on function public.normalize_attendance_private_text(text, boolean)
  from public, anon, authenticated;
```

- [ ] **Step 4: Implement atomic clock-in**

Append before `notify`:

```sql
create or replace function public.clock_in_attendance(
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_employee public.employees%rowtype;
  v_company_date date := public.company_attendance_date(now());
  v_note text := public.normalize_attendance_private_text(p_note, false);
  v_record_id uuid;
begin
  if v_actor is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  select * into v_employee
  from public.employees
  where profile_id = v_actor
    and archived_at is null
    and employment_status not in ('inactive', 'terminated')
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'ACTIVE_EMPLOYEE_NOT_FOUND';
  end if;

  if exists (
    select 1
    from public.attendance_records
    where employee_id = v_employee.id
      and attendance_date < v_company_date
      and clock_out_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'PREVIOUS_OPEN_ATTENDANCE';
  end if;

  if exists (
    select 1
    from public.attendance_records
    where employee_id = v_employee.id
      and attendance_date = v_company_date
  ) then
    raise exception using errcode = 'P0001', message = 'ALREADY_CLOCKED_IN';
  end if;

  insert into public.attendance_records (
    employee_id,
    attendance_date,
    clock_in_at,
    clock_in_note,
    status,
    created_by
  ) values (
    v_employee.id,
    v_company_date,
    now(),
    v_note,
    'clocked_in',
    v_actor
  )
  returning id into v_record_id;

  perform public.write_employee_audit(
    v_employee.id,
    'attendance.clocked_in',
    'attendance',
    v_record_id,
    jsonb_build_array('attendance_date', 'clock_in_at', 'status'),
    '{}'::jsonb,
    jsonb_build_object(
      'attendance_date', v_company_date,
      'clock_in_at', now(),
      'status', 'clocked_in'
    ),
    '{}'::jsonb,
    'application',
    v_actor
  );

  return v_record_id;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'ALREADY_CLOCKED_IN';
end;
$$;

revoke all on function public.clock_in_attendance(text) from public, anon;
grant execute on function public.clock_in_attendance(text) to authenticated;
```

- [ ] **Step 5: Implement atomic clock-out**

Append before `notify`:

```sql
create or replace function public.clock_out_attendance(
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_employee public.employees%rowtype;
  v_company_date date := public.company_attendance_date(now());
  v_note text := public.normalize_attendance_private_text(p_note, false);
  v_record public.attendance_records%rowtype;
  v_clock_out timestamptz := now();
begin
  if v_actor is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  select * into v_employee
  from public.employees
  where profile_id = v_actor
    and archived_at is null
    and employment_status not in ('inactive', 'terminated')
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'ACTIVE_EMPLOYEE_NOT_FOUND';
  end if;

  select * into v_record
  from public.attendance_records
  where employee_id = v_employee.id
    and attendance_date = v_company_date
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'NO_TODAY_ATTENDANCE';
  end if;
  if v_record.clock_out_at is not null then
    raise exception using errcode = 'P0001', message = 'ALREADY_CLOCKED_OUT';
  end if;

  update public.attendance_records
  set
    clock_out_at = v_clock_out,
    clock_out_note = v_note,
    status = 'completed',
    updated_at = v_clock_out
  where id = v_record.id;

  perform public.write_employee_audit(
    v_employee.id,
    'attendance.clocked_out',
    'attendance',
    v_record.id,
    jsonb_build_array('clock_out_at', 'status'),
    jsonb_build_object(
      'clock_out_at', null,
      'status', v_record.status
    ),
    jsonb_build_object(
      'clock_out_at', v_clock_out,
      'status', 'completed'
    ),
    '{}'::jsonb,
    'application',
    v_actor
  );

  return v_record.id;
end;
$$;

revoke all on function public.clock_out_attendance(text) from public, anon;
grant execute on function public.clock_out_attendance(text) to authenticated;
```

- [ ] **Step 6: Run migration tests**

```bash
npm test -- src/features/attendance/migration.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/202607140003_attendance_mvp.sql \
  src/features/attendance/migration.test.ts
git commit -m "feat: add atomic attendance clock actions"
```

---

### Task 4: Add attendance authorization and role-safe query layer

**Files:**
- Create: `src/features/attendance/auth.ts`
- Create: `src/features/attendance/queries.ts`
- Create: `src/features/attendance/queries.test.ts`

**Interfaces:**
- Produces `requireAttendanceEmployee()`.
- Produces `requireAttendanceAdmin()`.
- Produces `getTodayAttendanceContext()`.
- Produces `getOwnAttendanceHistory(params)`.
- Produces `getOwnCorrectionRequests(params)`.
- Produces `getAdminAttendance(params)` and `getAdminCorrectionRequests(params)`.

- [ ] **Step 1: Create attendance authorization helpers**

Create `src/features/attendance/auth.ts`:

```ts
import { redirect } from "next/navigation";
import { requireHrAdmin, requireUser } from "@/features/employees/auth";
import type { AttendanceEmployeeSummary } from "./types";

const employeeSelect = `
  id,
  profile_id,
  employee_number,
  first_name,
  last_name,
  department_id,
  department:departments!employees_department_id_fkey(id,name)
`;

export async function requireAttendanceEmployee() {
  const { supabase, user } = await requireUser();
  const { data: employee, error } = await supabase
    .from("employees")
    .select(employeeSelect)
    .eq("profile_id", user.id)
    .is("archived_at", null)
    .maybeSingle();

  if (error || !employee) {
    redirect("/dashboard?error=attendance_profile_missing");
  }

  return {
    supabase,
    user,
    employee: employee as unknown as AttendanceEmployeeSummary,
  };
}

export async function requireAttendanceAdmin() {
  const context = await requireHrAdmin();
  return context;
}
```

- [ ] **Step 2: Write query source tests**

Create `src/features/attendance/queries.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./queries.ts", import.meta.url), "utf8");

test("attendance queries are server-only and use stable pagination", () => {
  assert.match(source, /import "server-only"/);
  assert.match(source, /const pageSize = 20/);
  assert.match(source, /\.order\("attendance_date", \{ ascending: false \}\)/);
  assert.match(source, /\.order\("id", \{ ascending: false \}\)/);
  assert.match(source, /\.range\(from, to\)/);
});

test("effective missing clock-out is derived with the company date", () => {
  assert.match(source, /effectiveAttendanceStatus/);
  assert.match(source, /companyDateAt/);
});

test("employee and reviewer relationships use explicit foreign-key hints", () => {
  assert.match(source, /employee:employees!attendance_records_employee_id_fkey/);
  assert.match(source, /reviewer:profiles!attendance_correction_requests_reviewed_by_fkey/);
});

test("admin missing-clock-out filtering uses date and null clock-out", () => {
  assert.match(source, /\.lt\("attendance_date", companyDate\)/);
  assert.match(source, /\.is\("clock_out_at", null\)/);
});
```

- [ ] **Step 3: Run query tests and verify failure**

```bash
npm test -- src/features/attendance/queries.test.ts
```

Expected: FAIL because `queries.ts` does not exist.

- [ ] **Step 4: Implement shared record mapping and employee queries**

Create `src/features/attendance/queries.ts` with:

```ts
import "server-only";

import { createClient } from "@/lib/supabase/server";
import { companyDateAt, effectiveAttendanceStatus } from "./time";
import type {
  AttendanceCorrectionRequest,
  AttendanceEffectiveStatus,
  AttendanceRecord,
  CorrectionRequestStatus,
  PaginatedAttendance,
  PaginatedCorrectionRequests,
  TodayAttendanceContext,
} from "./types";

const attendanceSelect = `
  id,
  employee_id,
  attendance_date,
  clock_in_at,
  clock_out_at,
  clock_in_note,
  clock_out_note,
  status,
  is_corrected,
  last_corrected_at,
  last_corrected_by,
  last_correction_reason,
  created_by,
  created_at,
  updated_at,
  employee:employees!attendance_records_employee_id_fkey(
    id,profile_id,employee_number,first_name,last_name,department_id,
    department:departments!employees_department_id_fkey(id,name)
  )
`;

const correctionSelect = `
  id,
  employee_id,
  attendance_record_id,
  attendance_date,
  request_type,
  requested_clock_in_at,
  requested_clock_out_at,
  reason,
  employee_note,
  status,
  requested_by,
  reviewed_by,
  reviewed_at,
  review_note,
  created_at,
  updated_at,
  employee:employees!attendance_correction_requests_employee_id_fkey(
    id,profile_id,employee_number,first_name,last_name,department_id,
    department:departments!employees_department_id_fkey(id,name)
  ),
  attendance_record:attendance_records!attendance_correction_requests_attendance_record_id_fkey(
    id,employee_id,attendance_date,clock_in_at,clock_out_at,status,is_corrected,
    last_corrected_at,last_corrected_by,last_correction_reason,created_by,created_at,updated_at,
    clock_in_note,clock_out_note
  ),
  reviewer:profiles!attendance_correction_requests_reviewed_by_fkey(
    id,display_name,first_name,last_name
  )
`;

function mapAttendance(
  row: Record<string, unknown>,
  companyDate: string,
): AttendanceRecord {
  const record = row as unknown as Omit<AttendanceRecord, "effective_status">;
  return {
    ...record,
    effective_status: effectiveAttendanceStatus(record, companyDate),
  };
}

function mapCorrection(
  row: Record<string, unknown>,
  companyDate: string,
): AttendanceCorrectionRequest {
  const request = row as unknown as AttendanceCorrectionRequest;
  return {
    ...request,
    attendance_record: request.attendance_record
      ? mapAttendance(
          request.attendance_record as unknown as Record<string, unknown>,
          companyDate,
        )
      : null,
  };
}

export async function getTodayAttendanceContext(
  employee: TodayAttendanceContext["employee"],
): Promise<TodayAttendanceContext> {
  const supabase = await createClient();
  const companyDate = companyDateAt();
  const [todayResult, previousResult] = await Promise.all([
    supabase
      .from("attendance_records")
      .select(attendanceSelect)
      .eq("employee_id", employee.id)
      .eq("attendance_date", companyDate)
      .maybeSingle(),
    supabase
      .from("attendance_records")
      .select(attendanceSelect)
      .eq("employee_id", employee.id)
      .lt("attendance_date", companyDate)
      .is("clock_out_at", null)
      .order("attendance_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (todayResult.error || previousResult.error) {
    throw new Error("Unable to load today’s attendance.");
  }

  return {
    companyDate,
    employee,
    todayRecord: todayResult.data
      ? mapAttendance(todayResult.data as unknown as Record<string, unknown>, companyDate)
      : null,
    previousOpenRecord: previousResult.data
      ? mapAttendance(previousResult.data as unknown as Record<string, unknown>, companyDate)
      : null,
  };
}

export async function getOwnAttendanceHistory(params: {
  employeeId: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
}): Promise<PaginatedAttendance> {
  const supabase = await createClient();
  const companyDate = companyDateAt();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("attendance_records")
    .select(attendanceSelect, { count: "exact" })
    .eq("employee_id", params.employeeId)
    .order("attendance_date", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  if (params.fromDate) query = query.gte("attendance_date", params.fromDate);
  if (params.toDate) query = query.lte("attendance_date", params.toDate);
  if (params.status === "missing_clock_out") {
    query = query.lt("attendance_date", companyDate).is("clock_out_at", null);
  } else if (params.status === "clocked_in") {
    query = query.eq("attendance_date", companyDate).is("clock_out_at", null);
  } else if (params.status === "completed") {
    query = query.not("clock_out_at", "is", null);
  } else if (params.status === "corrected") {
    query = query.eq("is_corrected", true);
  }

  const { data, count, error } = await query;
  if (error) throw new Error("Unable to load attendance history.");
  const total = count ?? 0;
  return {
    records: (data ?? []).map((row) =>
      mapAttendance(row as unknown as Record<string, unknown>, companyDate),
    ),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
```

- [ ] **Step 5: Add correction and admin queries**

Append to `queries.ts`:

```ts
export async function getOwnCorrectionRequests(params: {
  employeeId: string;
  status?: CorrectionRequestStatus | "all";
  page?: number;
}): Promise<PaginatedCorrectionRequests> {
  const supabase = await createClient();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("attendance_correction_requests")
    .select(correctionSelect, { count: "exact" })
    .eq("employee_id", params.employeeId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  if (params.status && params.status !== "all") query = query.eq("status", params.status);
  const { data, count, error } = await query;
  if (error) throw new Error("Unable to load correction requests.");
  const total = count ?? 0;
  const companyDate = companyDateAt();
  return {
    requests: (data ?? []).map((row) =>
      mapCorrection(row as unknown as Record<string, unknown>, companyDate),
    ),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getAdminAttendance(params: {
  query?: string;
  department?: string;
  status?: string;
  date?: string;
  page?: number;
}): Promise<PaginatedAttendance> {
  const supabase = await createClient();
  const companyDate = companyDateAt();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const q = params.query?.trim();
  let filteredEmployeeIds: string[] | null = null;

  if (q || params.department) {
    let employees = supabase
      .from("employees")
      .select("id")
      .is("archived_at", null);

    if (params.department) employees = employees.eq("department_id", params.department);
    if (q) {
      employees = employees.or(
        `first_name.ilike.%${q}%,last_name.ilike.%${q}%,employee_number.ilike.%${q}%,work_email.ilike.%${q}%`,
      );
    }

    const { data: employeeRows, error: employeeError } = await employees;
    if (employeeError) throw new Error("Unable to filter attendance employees.");
    filteredEmployeeIds = (employeeRows ?? []).map((employee) => employee.id);

    if (filteredEmployeeIds.length === 0) {
      return { records: [], page, pageSize, total: 0, totalPages: 1 };
    }
  }

  let request = supabase
    .from("attendance_records")
    .select(attendanceSelect, { count: "exact" })
    .order("attendance_date", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  if (filteredEmployeeIds) request = request.in("employee_id", filteredEmployeeIds);
  if (params.date) request = request.eq("attendance_date", params.date);
  if (params.status === "missing_clock_out") {
    request = request.lt("attendance_date", companyDate).is("clock_out_at", null);
  } else if (params.status === "clocked_in") {
    request = request.eq("attendance_date", companyDate).is("clock_out_at", null);
  } else if (params.status === "completed") {
    request = request.not("clock_out_at", "is", null);
  } else if (params.status === "corrected") {
    request = request.eq("is_corrected", true);
  }

  const { data, count, error } = await request;
  if (error) throw new Error("Unable to load attendance records.");
  const total = count ?? 0;
  return {
    records: (data ?? []).map((row) =>
      mapAttendance(row as unknown as Record<string, unknown>, companyDate),
    ),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getAdminCorrectionRequests(params: {
  status?: CorrectionRequestStatus | "all";
  page?: number;
}): Promise<PaginatedCorrectionRequests> {
  const supabase = await createClient();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let request = supabase
    .from("attendance_correction_requests")
    .select(correctionSelect, { count: "exact" })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(from, to);

  if (params.status && params.status !== "all") {
    request = request.eq("status", params.status);
  }

  const { data, count, error } = await request;
  if (error) throw new Error("Unable to load correction requests.");
  const total = count ?? 0;
  const companyDate = companyDateAt();
  return {
    requests: (data ?? []).map((row) =>
      mapCorrection(row as unknown as Record<string, unknown>, companyDate),
    ),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
```

- [ ] **Step 6: Run query tests**

```bash
npm test -- src/features/attendance/queries.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/attendance/auth.ts \
  src/features/attendance/queries.ts \
  src/features/attendance/queries.test.ts
git commit -m "feat: add attendance authorization and queries"
```

---

### Task 5: Add employee clock Server Actions and the reusable attendance card

**Files:**
- Create: `src/app/(dashboard)/attendance/actions.ts`
- Create: `src/features/attendance/actions.test.ts`
- Create: `src/components/attendance/attendance-clock-card.tsx`
- Create: `src/components/attendance/attendance-status.tsx`

**Interfaces:**
- Produces `clockIn(state, formData)` and `clockOut(state, formData)`.
- Produces `AttendanceClockCard({ context })`.
- Produces `AttendanceStatus({ status, corrected? })`.

- [ ] **Step 1: Write action source-security tests**

Create `src/features/attendance/actions.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../../app/(dashboard)/attendance/actions.ts", import.meta.url),
  "utf8",
);

test("employee clock actions invoke protected RPCs and never accept timestamps", () => {
  assert.match(source, /\.rpc\("clock_in_attendance"/);
  assert.match(source, /\.rpc\("clock_out_attendance"/);
  assert.doesNotMatch(source, /clock_in_at|clock_out_at|datetime-local/);
});

test("clock actions validate private notes without logging them", () => {
  assert.match(source, /validateClockNote/);
  assert.doesNotMatch(source, /console\.(log|error)\([^)]*note/);
});

test("attendance paths are revalidated after successful clock actions", () => {
  assert.match(source, /revalidatePath\("\/attendance"\)/);
  assert.match(source, /revalidatePath\("\/dashboard"\)/);
});
```

- [ ] **Step 2: Run tests and verify failure**

```bash
npm test -- src/features/attendance/actions.test.ts
```

Expected: FAIL because `actions.ts` does not exist.

- [ ] **Step 3: Implement safe RPC error mapping and actions**

Create `src/app/(dashboard)/attendance/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAttendanceEmployee } from "@/features/attendance/auth";
import type { AttendanceActionState } from "@/features/attendance/types";
import { validateClockNote } from "@/features/attendance/validation";

function clockError(message: string) {
  if (message.includes("ALREADY_CLOCKED_IN")) return "You already clocked in today.";
  if (message.includes("ALREADY_CLOCKED_OUT")) return "You already clocked out today.";
  if (message.includes("PREVIOUS_OPEN_ATTENDANCE")) {
    return "Resolve your previous missing clock-out before clocking in again.";
  }
  if (message.includes("NO_TODAY_ATTENDANCE")) {
    return "No active attendance record was found for today.";
  }
  if (message.includes("PRIVATE_TEXT_TOO_LONG")) {
    return "Note must be 1,000 characters or fewer.";
  }
  return "Attendance could not be saved. Please try again.";
}

function revalidateAttendance() {
  revalidatePath("/attendance");
  revalidatePath("/attendance/corrections");
  revalidatePath("/dashboard");
  revalidatePath("/admin/attendance");
}

export async function clockIn(
  _state: AttendanceActionState,
  formData: FormData,
): Promise<AttendanceActionState> {
  const { supabase } = await requireAttendanceEmployee();
  const validation = validateClockNote(formData);
  if (!validation.data) return validation.state ?? { error: "Invalid note." };

  const { error } = await supabase.rpc("clock_in_attendance", {
    p_note: validation.data.note,
  });
  if (error) return { error: clockError(error.message) };

  revalidateAttendance();
  redirect("/attendance?success=clocked_in");
}

export async function clockOut(
  _state: AttendanceActionState,
  formData: FormData,
): Promise<AttendanceActionState> {
  const { supabase } = await requireAttendanceEmployee();
  const validation = validateClockNote(formData);
  if (!validation.data) return validation.state ?? { error: "Invalid note." };

  const { error } = await supabase.rpc("clock_out_attendance", {
    p_note: validation.data.note,
  });
  if (error) return { error: clockError(error.message) };

  revalidateAttendance();
  redirect("/attendance?success=clocked_out");
}
```

- [ ] **Step 4: Implement attendance status presentation**

Create `src/components/attendance/attendance-status.tsx`:

```tsx
import type { AttendanceEffectiveStatus } from "@/features/attendance/types";

const labels: Record<AttendanceEffectiveStatus, string> = {
  clocked_in: "Clocked in",
  completed: "Completed",
  missing_clock_out: "Missing clock-out",
};

export function AttendanceStatus({
  status,
  corrected = false,
}: {
  status: AttendanceEffectiveStatus;
  corrected?: boolean;
}) {
  const tone = status === "completed"
    ? "success"
    : status === "missing_clock_out"
      ? "warning"
      : "info";

  return (
    <span className="attendance-badges">
      <span className={`badge ${tone}`}>{labels[status]}</span>
      {corrected && <span className="badge info">Corrected</span>}
    </span>
  );
}
```

- [ ] **Step 5: Implement the clock card**

Create `src/components/attendance/attendance-clock-card.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useActionState } from "react";
import { clockIn, clockOut } from "@/app/(dashboard)/attendance/actions";
import { formatCompanyDate, formatCompanyTime } from "@/features/attendance/time";
import type { AttendanceActionState, TodayAttendanceContext } from "@/features/attendance/types";
import { AttendanceStatus } from "./attendance-status";

const initialState: AttendanceActionState = {};

function ClockForm({ mode }: { mode: "in" | "out" }) {
  const action = mode === "in" ? clockIn : clockOut;
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form action={formAction} className="attendance-clock-form">
      <label>
        <span>{mode === "in" ? "Clock-in note" : "Clock-out note"} <span className="muted">(optional)</span></span>
        <textarea name="note" maxLength={1000} rows={3} />
      </label>
      {state.fieldErrors?.note && <p className="field-error">{state.fieldErrors.note}</p>}
      {state.error && <p className="form-error">{state.error}</p>}
      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? "Saving…" : mode === "in" ? "Clock in" : "Clock out"}
      </button>
    </form>
  );
}

export function AttendanceClockCard({ context }: { context: TodayAttendanceContext }) {
  const { companyDate, todayRecord, previousOpenRecord } = context;

  if (previousOpenRecord) {
    return (
      <section className="card attendance-clock-card attendance-warning-card">
        <div>
          <p className="eyebrow">Attendance action required</p>
          <h2>Missing clock-out</h2>
          <p>
            Your attendance for {formatCompanyDate(previousOpenRecord.attendance_date)}
            {" "}is still open. Resolve it before clocking in again.
          </p>
        </div>
        <Link
          className="btn primary"
          href={`/attendance/corrections/new?record=${previousOpenRecord.id}`}
        >
          Request correction
        </Link>
      </section>
    );
  }

  return (
    <section className="card attendance-clock-card">
      <div className="attendance-clock-heading">
        <div>
          <p className="eyebrow">Today’s attendance</p>
          <h2>{formatCompanyDate(companyDate)}</h2>
          <p className="muted">Company timezone: Asia/Manila</p>
        </div>
        {todayRecord
          ? <AttendanceStatus status={todayRecord.effective_status} corrected={todayRecord.is_corrected} />
          : <span className="badge info">Not clocked in</span>}
      </div>

      {!todayRecord && <ClockForm mode="in" />}
      {todayRecord?.effective_status === "clocked_in" && (
        <>
          <div className="attendance-time-grid">
            <div><span>Clock in</span><strong>{formatCompanyTime(todayRecord.clock_in_at)}</strong></div>
          </div>
          <ClockForm mode="out" />
        </>
      )}
      {todayRecord?.effective_status === "completed" && (
        <div className="attendance-time-grid">
          <div><span>Clock in</span><strong>{formatCompanyTime(todayRecord.clock_in_at)}</strong></div>
          <div><span>Clock out</span><strong>{formatCompanyTime(todayRecord.clock_out_at)}</strong></div>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 6: Run action tests**

```bash
npm test -- src/features/attendance/actions.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add 'src/app/(dashboard)/attendance/actions.ts' \
  src/features/attendance/actions.test.ts \
  src/components/attendance/attendance-clock-card.tsx \
  src/components/attendance/attendance-status.tsx
git commit -m "feat: add employee clock controls"
```

---

### Task 6: Replace the employee attendance mock page with production history

**Files:**
- Modify: `src/app/(dashboard)/attendance/page.tsx`
- Create: `src/components/attendance/attendance-history.tsx`

**Interfaces:**
- Consumes `requireAttendanceEmployee`, `getTodayAttendanceContext`, and `getOwnAttendanceHistory`.
- Produces the production `/attendance` route.

- [ ] **Step 1: Create the responsive attendance history component**

Create `src/components/attendance/attendance-history.tsx`:

```tsx
import Link from "next/link";
import { formatCompanyDate, formatCompanyTime } from "@/features/attendance/time";
import type { AttendanceRecord } from "@/features/attendance/types";
import { AttendanceStatus } from "./attendance-status";

export function AttendanceHistory({ records }: { records: AttendanceRecord[] }) {
  if (records.length === 0) {
    return <div className="empty">No attendance records match these filters.</div>;
  }

  return (
    <div className="attendance-responsive-list">
      <div className="table-wrap attendance-desktop-table">
        <table>
          <thead><tr><th>Date</th><th>Clock in</th><th>Clock out</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id}>
                <td>{formatCompanyDate(record.attendance_date)}</td>
                <td>{formatCompanyTime(record.clock_in_at)}</td>
                <td>{formatCompanyTime(record.clock_out_at)}</td>
                <td><AttendanceStatus status={record.effective_status} corrected={record.is_corrected} /></td>
                <td>
                  <Link className="table-link" href={`/attendance/corrections/new?record=${record.id}`}>
                    Request correction
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="attendance-mobile-cards">
        {records.map((record) => (
          <article className="attendance-record-card" key={record.id}>
            <div className="attendance-record-card-heading">
              <strong>{formatCompanyDate(record.attendance_date)}</strong>
              <AttendanceStatus status={record.effective_status} corrected={record.is_corrected} />
            </div>
            <dl>
              <div><dt>Clock in</dt><dd>{formatCompanyTime(record.clock_in_at)}</dd></div>
              <div><dt>Clock out</dt><dd>{formatCompanyTime(record.clock_out_at)}</dd></div>
            </dl>
            <Link className="btn" href={`/attendance/corrections/new?record=${record.id}`}>
              Request correction
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace the `/attendance` page**

Replace `src/app/(dashboard)/attendance/page.tsx` with:

```tsx
import Link from "next/link";
import { AttendanceClockCard } from "@/components/attendance/attendance-clock-card";
import { AttendanceHistory } from "@/components/attendance/attendance-history";
import { PageHeader } from "@/components/page-header";
import { requireAttendanceEmployee } from "@/features/attendance/auth";
import {
  getOwnAttendanceHistory,
  getTodayAttendanceContext,
} from "@/features/attendance/queries";

function value(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] : input ?? "";
}

function pageHref(filters: Record<string, string>, page: number) {
  const search = new URLSearchParams();
  for (const [key, item] of Object.entries(filters)) if (item) search.set(key, item);
  if (page > 1) search.set("page", String(page));
  return `/attendance${search.size ? `?${search}` : ""}`;
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const status = value(query.status);
  const fromDate = value(query.from);
  const toDate = value(query.to);
  const page = Math.max(1, Number(value(query.page) || "1") || 1);
  const success = value(query.success);
  const { employee } = await requireAttendanceEmployee();

  const [context, history] = await Promise.all([
    getTodayAttendanceContext(employee),
    getOwnAttendanceHistory({ employeeId: employee.id, status, fromDate, toDate, page }),
  ]);

  const filters = { status, from: fromDate, to: toDate };

  return (
    <>
      <PageHeader
        title="My Attendance"
        description="Clock in, clock out, review your attendance, and request corrections."
        action={<Link className="btn" href="/attendance/corrections">Correction requests</Link>}
      />

      {success === "clocked_in" && <p className="form-success">You clocked in successfully.</p>}
      {success === "clocked_out" && <p className="form-success">You clocked out successfully.</p>}

      <AttendanceClockCard context={context} />

      <section className="card attendance-history-section">
        <div className="section-heading-row">
          <div><h2 className="card-title">Attendance history</h2><p className="muted">Times are shown in Asia/Manila.</p></div>
          <Link className="btn" href={`/attendance/corrections/new?date=${context.companyDate}`}>Request missing day</Link>
        </div>
        <form className="toolbar attendance-filter-toolbar" method="get">
          <select className="field" name="status" defaultValue={status}>
            <option value="">All statuses</option>
            <option value="clocked_in">Clocked in</option>
            <option value="completed">Completed</option>
            <option value="missing_clock_out">Missing clock-out</option>
            <option value="corrected">Corrected</option>
          </select>
          <input className="field" type="date" name="from" defaultValue={fromDate} aria-label="From date" />
          <input className="field" type="date" name="to" defaultValue={toDate} aria-label="To date" />
          <button className="btn" type="submit">Apply filters</button>
          {(status || fromDate || toDate) && <Link className="btn" href="/attendance">Clear</Link>}
        </form>
        <AttendanceHistory records={history.records} />
        <nav className="pagination" aria-label="Attendance pages">
          <Link className={`btn${history.page <= 1 ? " disabled" : ""}`} href={pageHref(filters, Math.max(1, history.page - 1))}>Previous</Link>
          <span>Page {history.page} of {history.totalPages} · {history.total} records</span>
          <Link className={`btn${history.page >= history.totalPages ? " disabled" : ""}`} href={pageHref(filters, Math.min(history.totalPages, history.page + 1))}>Next</Link>
        </nav>
      </section>
    </>
  );
}
```

- [ ] **Step 3: Run the production build**

```bash
npm run build
```

Expected: `/attendance` compiles and no mock attendance import remains in that route.

- [ ] **Step 4: Commit**

```bash
git add 'src/app/(dashboard)/attendance/page.tsx' \
  src/components/attendance/attendance-history.tsx
git commit -m "feat: add employee attendance history"
```

---

### Task 7: Add correction-request, cancellation, and review RPCs

**Files:**
- Modify: `supabase/migrations/202607140003_attendance_mvp.sql`
- Modify: `src/features/attendance/migration.test.ts`

**Interfaces:**
- Produces `public.create_attendance_correction_request(...) returns uuid`.
- Produces `public.cancel_attendance_correction_request(p_request_id uuid) returns void`.
- Produces `public.review_attendance_correction_request(...) returns void`.

- [ ] **Step 1: Add failing correction workflow source tests**

Append:

```ts
test("correction RPCs enforce the 30-day window, ownership, and self-review rule", () => {
  assert.match(sql, /create or replace function public\.create_attendance_correction_request/i);
  assert.match(sql, /create or replace function public\.cancel_attendance_correction_request/i);
  assert.match(sql, /create or replace function public\.review_attendance_correction_request/i);
  assert.match(sql, /v_company_date - 30/i);
  assert.match(sql, /requested_by = v_actor/i);
  assert.match(sql, /v_request\.requested_by = v_actor/i);
});

test("approval writes both official attendance and request audit events atomically", () => {
  assert.match(sql, /attendance\.corrected/i);
  assert.match(sql, /attendance_correction\.approved/i);
  assert.match(sql, /for update/i);
});

test("correction audit payloads exclude request reason and review text", () => {
  assert.doesNotMatch(
    sql,
    /write_employee_audit\([^;]+(reason|employee_note|review_note)/is,
  );
});
```

- [ ] **Step 2: Run and verify failure**

```bash
npm test -- src/features/attendance/migration.test.ts
```

Expected: FAIL because correction RPCs are absent.

- [ ] **Step 3: Add request creation RPC**

Append before `notify` in the migration. The implementation must:

```sql
create or replace function public.create_attendance_correction_request(
  p_attendance_date date,
  p_request_type text,
  p_requested_clock_in_local timestamp default null,
  p_requested_clock_out_local timestamp default null,
  p_reason text default null,
  p_employee_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_employee public.employees%rowtype;
  v_record public.attendance_records%rowtype;
  v_record_exists boolean := false;
  v_company_date date := public.company_attendance_date(now());
  v_reason text := public.normalize_attendance_private_text(p_reason, true);
  v_note text := public.normalize_attendance_private_text(p_employee_note, false);
  v_clock_in timestamptz;
  v_clock_out timestamptz;
  v_request_id uuid;
begin
  if v_actor is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  select * into v_employee
  from public.employees
  where profile_id = v_actor
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'EMPLOYEE_NOT_FOUND';
  end if;

  if p_attendance_date > v_company_date
    or p_attendance_date < v_company_date - 30 then
    raise exception using errcode = 'P0001', message = 'REQUEST_DATE_OUT_OF_RANGE';
  end if;

  if p_request_type not in (
    'add_missing_clock_in', 'add_missing_clock_out', 'change_clock_in', 'change_clock_out'
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_REQUEST_TYPE';
  end if;

  select * into v_record
  from public.attendance_records
  where employee_id = v_employee.id
    and attendance_date = p_attendance_date
  for update;
  v_record_exists := found;

  if p_requested_clock_in_local is not null then
    v_clock_in := p_requested_clock_in_local at time zone 'Asia/Manila';
    if public.company_attendance_date(v_clock_in) <> p_attendance_date then
      raise exception using errcode = 'P0001', message = 'CLOCK_IN_DATE_MISMATCH';
    end if;
  end if;
  if p_requested_clock_out_local is not null then
    v_clock_out := p_requested_clock_out_local at time zone 'Asia/Manila';
    if public.company_attendance_date(v_clock_out) <> p_attendance_date then
      raise exception using errcode = 'P0001', message = 'CLOCK_OUT_DATE_MISMATCH';
    end if;
  end if;

  if p_request_type = 'add_missing_clock_in' then
    if v_record_exists then raise exception using errcode = 'P0001', message = 'ATTENDANCE_ALREADY_EXISTS'; end if;
    if v_clock_in is null then raise exception using errcode = 'P0001', message = 'CLOCK_IN_REQUIRED'; end if;
  elsif p_request_type = 'add_missing_clock_out' then
    if not v_record_exists or v_record.clock_out_at is not null then
      raise exception using errcode = 'P0001', message = 'OPEN_ATTENDANCE_REQUIRED';
    end if;
    if v_clock_out is null then raise exception using errcode = 'P0001', message = 'CLOCK_OUT_REQUIRED'; end if;
  elsif p_request_type = 'change_clock_in' then
    if not v_record_exists then raise exception using errcode = 'P0001', message = 'ATTENDANCE_REQUIRED'; end if;
    if v_clock_in is null then raise exception using errcode = 'P0001', message = 'CLOCK_IN_REQUIRED'; end if;
  else
    if not v_record_exists or v_record.clock_out_at is null then
      raise exception using errcode = 'P0001', message = 'COMPLETED_ATTENDANCE_REQUIRED';
    end if;
    if v_clock_out is null then raise exception using errcode = 'P0001', message = 'CLOCK_OUT_REQUIRED'; end if;
  end if;

  if coalesce(v_clock_in, v_record.clock_in_at) is not null
    and coalesce(v_clock_out, v_record.clock_out_at) is not null
    and coalesce(v_clock_out, v_record.clock_out_at) <= coalesce(v_clock_in, v_record.clock_in_at) then
    raise exception using errcode = 'P0001', message = 'INVALID_CLOCK_ORDER';
  end if;

  insert into public.attendance_correction_requests (
    employee_id, attendance_record_id, attendance_date, request_type,
    requested_clock_in_at, requested_clock_out_at, reason, employee_note,
    status, requested_by
  ) values (
    v_employee.id, v_record.id, p_attendance_date, p_request_type,
    v_clock_in, v_clock_out, v_reason, v_note, 'pending', v_actor
  ) returning id into v_request_id;

  perform public.write_employee_audit(
    v_employee.id,
    'attendance_correction.requested',
    'attendance_correction',
    v_request_id,
    jsonb_build_array('request_type', 'request_status'),
    '{}'::jsonb,
    jsonb_build_object('request_type', p_request_type, 'request_status', 'pending'),
    jsonb_build_object('attendance_date', p_attendance_date),
    'application',
    v_actor
  );

  return v_request_id;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'PENDING_REQUEST_EXISTS';
end;
$$;

revoke all on function public.create_attendance_correction_request(
  date, text, timestamp, timestamp, text, text
) from public, anon;
grant execute on function public.create_attendance_correction_request(
  date, text, timestamp, timestamp, text, text
) to authenticated;
```

- [ ] **Step 4: Add request cancellation RPC**

Append:

```sql
create or replace function public.cancel_attendance_correction_request(
  p_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_request public.attendance_correction_requests%rowtype;
begin
  select * into v_request
  from public.attendance_correction_requests
  where id = p_request_id
  for update;

  if not found or v_request.requested_by <> v_actor then
    raise exception using errcode = 'P0001', message = 'REQUEST_NOT_FOUND';
  end if;
  if v_request.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'REQUEST_NOT_PENDING';
  end if;

  update public.attendance_correction_requests
  set status = 'cancelled', updated_at = now()
  where id = v_request.id;

  perform public.write_employee_audit(
    v_request.employee_id,
    'attendance_correction.cancelled',
    'attendance_correction',
    v_request.id,
    jsonb_build_array('request_status'),
    jsonb_build_object('request_status', 'pending'),
    jsonb_build_object('request_status', 'cancelled'),
    jsonb_build_object('attendance_date', v_request.attendance_date),
    'application',
    v_actor
  );
end;
$$;

revoke all on function public.cancel_attendance_correction_request(uuid)
  from public, anon;
grant execute on function public.cancel_attendance_correction_request(uuid)
  to authenticated;
```

- [ ] **Step 5: Add atomic approve/reject RPC**

Implement `public.review_attendance_correction_request(p_request_id uuid, p_decision text, p_review_note text default null) returns void` with these exact branches:

```sql
create or replace function public.review_attendance_correction_request(
  p_request_id uuid,
  p_decision text,
  p_review_note text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_request public.attendance_correction_requests%rowtype;
  v_record public.attendance_records%rowtype;
  v_record_exists boolean := false;
  v_note text := public.normalize_attendance_private_text(p_review_note, false);
  v_record_id uuid;
  v_new_clock_in timestamptz;
  v_new_clock_out timestamptz;
  v_new_status text;
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception using errcode = 'P0001', message = 'INVALID_DECISION';
  end if;

  select * into v_request
  from public.attendance_correction_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'REQUEST_NOT_FOUND';
  end if;
  if v_request.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'REQUEST_NOT_PENDING';
  end if;
  if v_request.requested_by = v_actor then
    raise exception using errcode = 'P0001', message = 'SELF_REVIEW_NOT_ALLOWED';
  end if;

  if p_decision = 'reject' then
    update public.attendance_correction_requests
    set status = 'rejected', reviewed_by = v_actor, reviewed_at = now(),
        review_note = v_note, updated_at = now()
    where id = v_request.id;

    perform public.write_employee_audit(
      v_request.employee_id,
      'attendance_correction.rejected',
      'attendance_correction',
      v_request.id,
      jsonb_build_array('request_status'),
      jsonb_build_object('request_status', 'pending'),
      jsonb_build_object('request_status', 'rejected'),
      jsonb_build_object('attendance_date', v_request.attendance_date),
      'application',
      v_actor
    );
    return;
  end if;

  select * into v_record
  from public.attendance_records
  where employee_id = v_request.employee_id
    and attendance_date = v_request.attendance_date
  for update;
  v_record_exists := found;

  if v_request.request_type = 'add_missing_clock_in' then
    if v_record_exists then raise exception using errcode = 'P0001', message = 'ATTENDANCE_ALREADY_EXISTS'; end if;
    v_new_clock_in := v_request.requested_clock_in_at;
    v_new_clock_out := v_request.requested_clock_out_at;
    v_new_status := case when v_new_clock_out is null then 'clocked_in' else 'completed' end;

    insert into public.attendance_records (
      employee_id, attendance_date, clock_in_at, clock_out_at, status,
      is_corrected, last_corrected_at, last_corrected_by,
      last_correction_reason, created_by
    ) values (
      v_request.employee_id, v_request.attendance_date,
      v_new_clock_in, v_new_clock_out, v_new_status,
      true, now(), v_actor, v_request.reason, v_actor
    ) returning id into v_record_id;
  else
    if not v_record_exists then raise exception using errcode = 'P0001', message = 'ATTENDANCE_REQUIRED'; end if;
    v_new_clock_in := case
      when v_request.request_type = 'change_clock_in' then v_request.requested_clock_in_at
      else v_record.clock_in_at
    end;
    v_new_clock_out := case
      when v_request.request_type in ('add_missing_clock_out', 'change_clock_out')
        then v_request.requested_clock_out_at
      else v_record.clock_out_at
    end;
    if v_new_clock_out is not null and v_new_clock_out <= v_new_clock_in then
      raise exception using errcode = 'P0001', message = 'INVALID_CLOCK_ORDER';
    end if;
    v_new_status := case when v_new_clock_out is null then 'clocked_in' else 'completed' end;
    v_record_id := v_record.id;

    update public.attendance_records
    set clock_in_at = v_new_clock_in,
        clock_out_at = v_new_clock_out,
        status = v_new_status,
        is_corrected = true,
        last_corrected_at = now(),
        last_corrected_by = v_actor,
        last_correction_reason = v_request.reason,
        updated_at = now()
    where id = v_record.id;
  end if;

  update public.attendance_correction_requests
  set status = 'approved', reviewed_by = v_actor, reviewed_at = now(),
      review_note = v_note, attendance_record_id = v_record_id, updated_at = now()
  where id = v_request.id;

  perform public.write_employee_audit(
    v_request.employee_id,
    'attendance.corrected',
    'attendance',
    v_record_id,
    jsonb_build_array('clock_in_at', 'clock_out_at', 'status', 'is_corrected'),
    case
      when v_record_exists then jsonb_build_object(
        'clock_in_at', v_record.clock_in_at,
        'clock_out_at', v_record.clock_out_at,
        'status', v_record.status,
        'is_corrected', v_record.is_corrected
      )
      else jsonb_build_object(
        'clock_in_at', null,
        'clock_out_at', null,
        'status', null,
        'is_corrected', false
      )
    end,
    jsonb_build_object(
      'clock_in_at', v_new_clock_in,
      'clock_out_at', v_new_clock_out,
      'status', v_new_status,
      'is_corrected', true
    ),
    jsonb_build_object('attendance_date', v_request.attendance_date),
    'application',
    v_actor
  );

  perform public.write_employee_audit(
    v_request.employee_id,
    'attendance_correction.approved',
    'attendance_correction',
    v_request.id,
    jsonb_build_array('request_status'),
    jsonb_build_object('request_status', 'pending'),
    jsonb_build_object('request_status', 'approved'),
    jsonb_build_object('attendance_date', v_request.attendance_date),
    'application',
    v_actor
  );
end;
$$;

revoke all on function public.review_attendance_correction_request(uuid, text, text)
  from public, anon;
grant execute on function public.review_attendance_correction_request(uuid, text, text)
  to authenticated;
```

- [ ] **Step 6: Run migration tests**

```bash
npm test -- src/features/attendance/migration.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/202607140003_attendance_mvp.sql \
  src/features/attendance/migration.test.ts
git commit -m "feat: add attendance correction workflow"
```

---

### Task 8: Add employee correction-request actions and pages

**Files:**
- Modify: `src/app/(dashboard)/attendance/actions.ts`
- Create: `src/components/attendance/correction-request-form.tsx`
- Create: `src/components/attendance/correction-request-list.tsx`
- Create: `src/components/attendance/cancel-correction-request-button.tsx`
- Create: `src/app/(dashboard)/attendance/corrections/page.tsx`
- Create: `src/app/(dashboard)/attendance/corrections/new/page.tsx`
- Modify: `src/features/attendance/actions.test.ts`

**Interfaces:**
- Produces `createCorrectionRequest`, `cancelCorrectionRequest`.
- Produces employee request history and request form routes.

- [ ] **Step 1: Extend action tests**

Append:

```ts
test("employee correction actions use protected request RPCs", () => {
  assert.match(source, /\.rpc\("create_attendance_correction_request"/);
  assert.match(source, /\.rpc\("cancel_attendance_correction_request"/);
  assert.match(source, /validateCorrectionRequest/);
});

test("correction action state never echoes private reason or employee note", () => {
  assert.doesNotMatch(source, /values:[\s\S]+(reason|employee_note)/);
  assert.doesNotMatch(source, /console\.(log|error)\([^)]*(reason|employeeNote)/);
});
```

- [ ] **Step 2: Implement employee request actions**

Append to `attendance/actions.ts`:

```ts
import { validateCorrectionRequest } from "@/features/attendance/validation";

function correctionError(message: string) {
  if (message.includes("REQUEST_DATE_OUT_OF_RANGE")) return "You can only request changes for the previous 30 calendar days.";
  if (message.includes("PENDING_REQUEST_EXISTS")) return "A pending request already exists for this attendance date.";
  if (message.includes("INVALID_CLOCK_ORDER")) return "The requested clock-out must be later than the clock-in.";
  if (message.includes("REQUEST_NOT_PENDING")) return "This correction request is no longer pending.";
  if (message.includes("ATTENDANCE_ALREADY_EXISTS")) return "Attendance already exists for this date.";
  return "The correction request could not be saved. Please try again.";
}

export async function createCorrectionRequest(
  _state: AttendanceActionState,
  formData: FormData,
): Promise<AttendanceActionState> {
  const { supabase } = await requireAttendanceEmployee();
  const validation = validateCorrectionRequest(formData);
  if (!validation.data) return validation.state ?? { error: "Invalid correction request." };

  const { error } = await supabase.rpc("create_attendance_correction_request", {
    p_attendance_date: validation.data.attendanceDate,
    p_request_type: validation.data.requestType,
    p_requested_clock_in_local: validation.data.requestedClockInLocal,
    p_requested_clock_out_local: validation.data.requestedClockOutLocal,
    p_reason: validation.data.reason,
    p_employee_note: validation.data.employeeNote,
  });
  if (error) return { error: correctionError(error.message) };

  revalidateAttendance();
  redirect("/attendance/corrections?success=requested");
}

export async function cancelCorrectionRequest(requestId: string) {
  const { supabase } = await requireAttendanceEmployee();
  const { error } = await supabase.rpc("cancel_attendance_correction_request", {
    p_request_id: requestId,
  });
  if (error) redirect("/attendance/corrections?error=cancel_failed");
  revalidateAttendance();
  redirect("/attendance/corrections?success=cancelled");
}
```

- [ ] **Step 3: Create request form and cancellation control**

`CorrectionRequestForm` must:

- use `useActionState(createCorrectionRequest, {})`;
- expose `attendance_date`, `request_type`, requested clock-in/out `datetime-local` fields, required `reason`, and optional `employee_note`;
- hide irrelevant requested-time fields using client state;
- apply `maxLength={1000}` to private text;
- label local timestamp fields `Asia/Manila`;
- keep reason and employee note out of action-state `values`.

Use this signature:

```tsx
export function CorrectionRequestForm({
  initialDate,
  initialRecord,
}: {
  initialDate: string;
  initialRecord: AttendanceRecord | null;
}) {}
```

`CancelCorrectionRequestButton` must bind `cancelCorrectionRequest(requestId)` and require this confirmation:

```text
Cancel this pending correction request?

The official attendance record will remain unchanged.
```

- [ ] **Step 4: Create request list component**

Use this signature:

```tsx
export function CorrectionRequestList({
  requests,
}: {
  requests: AttendanceCorrectionRequest[];
}) {}
```

Display request type, attendance date, requested values, status, submitted date, reviewer, review note, and cancellation only for `pending` requests. Private reason and note are visible only on this employee-owned page and the HR review page.

- [ ] **Step 5: Create employee request history page**

Route `/attendance/corrections` must:

- call `requireAttendanceEmployee()` first;
- parse status and page;
- call `getOwnCorrectionRequests`;
- render status filter links for all/pending/approved/rejected/cancelled;
- show success/error feedback;
- provide a `New correction request` button;
- paginate at 20 records.

- [ ] **Step 6: Create new request page**

Route `/attendance/corrections/new` must:

- call `requireAttendanceEmployee()`;
- accept either `record=<uuid>` or `date=YYYY-MM-DD`;
- when `record` is supplied, query that row through RLS and verify it belongs to the current employee;
- default the date to the record date or current company date;
- render `CorrectionRequestForm`;
- return `notFound()` for an inaccessible record.

- [ ] **Step 7: Run tests and build**

```bash
npm test -- src/features/attendance/actions.test.ts \
  src/features/attendance/validation.test.ts
npm run build
```

Expected: tests and build PASS; `/attendance/corrections` and `/attendance/corrections/new` compile.

- [ ] **Step 8: Commit**

```bash
git add 'src/app/(dashboard)/attendance' \
  src/components/attendance \
  src/features/attendance/actions.test.ts
git commit -m "feat: add employee correction requests"
```

---

### Task 9: Add direct HR attendance creation and correction RPCs

**Files:**
- Modify: `supabase/migrations/202607140003_attendance_mvp.sql`
- Modify: `src/features/attendance/migration.test.ts`

**Interfaces:**
- Produces `public.hr_create_attendance(...) returns uuid`.
- Produces `public.hr_correct_attendance(...) returns void`.

- [ ] **Step 1: Add failing HR RPC tests**

Append:

```ts
test("HR create and correct RPCs require HR role and private reasons", () => {
  assert.match(sql, /create or replace function public\.hr_create_attendance/i);
  assert.match(sql, /create or replace function public\.hr_correct_attendance/i);
  assert.match(sql, /not public\.is_hr_admin\(\)/i);
  assert.match(sql, /normalize_attendance_private_text\(p_reason, true\)/i);
});

test("HR timestamp validation uses Asia Manila and rejects overnight values", () => {
  assert.match(sql, /p_clock_in_local at time zone 'Asia\/Manila'/i);
  assert.match(sql, /company_attendance_date\(v_clock_in\) <> p_attendance_date/i);
  assert.match(sql, /company_attendance_date\(v_clock_out\) <> p_attendance_date/i);
});
```

- [ ] **Step 2: Run and verify failure**

```bash
npm test -- src/features/attendance/migration.test.ts
```

Expected: FAIL because HR RPCs are absent.

- [ ] **Step 3: Implement HR record creation**

Add `public.hr_create_attendance(p_employee_id uuid, p_attendance_date date, p_clock_in_local timestamp, p_clock_out_local timestamp default null, p_reason text default null) returns uuid`.

The function must:

```sql
-- Authorization and normalization
if auth.uid() is null or not public.is_hr_admin() then
  raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
end if;
v_reason := public.normalize_attendance_private_text(p_reason, true);

-- Convert local inputs
v_clock_in := p_clock_in_local at time zone 'Asia/Manila';
v_clock_out := case when p_clock_out_local is null then null
                    else p_clock_out_local at time zone 'Asia/Manila' end;

-- Validate no future date, same company date, and ordering
if p_attendance_date > public.company_attendance_date(now()) then
  raise exception using errcode = 'P0001', message = 'FUTURE_ATTENDANCE_NOT_ALLOWED';
end if;
if public.company_attendance_date(v_clock_in) <> p_attendance_date then
  raise exception using errcode = 'P0001', message = 'CLOCK_IN_DATE_MISMATCH';
end if;
if v_clock_out is not null and public.company_attendance_date(v_clock_out) <> p_attendance_date then
  raise exception using errcode = 'P0001', message = 'CLOCK_OUT_DATE_MISMATCH';
end if;
if v_clock_out is not null and v_clock_out <= v_clock_in then
  raise exception using errcode = 'P0001', message = 'INVALID_CLOCK_ORDER';
end if;

-- Lock employee, insert corrected record, and audit
select id from public.employees where id = p_employee_id for update;
insert into public.attendance_records (
  employee_id, attendance_date, clock_in_at, clock_out_at, status,
  is_corrected, last_corrected_at, last_corrected_by,
  last_correction_reason, created_by
) values (
  p_employee_id, p_attendance_date, v_clock_in, v_clock_out,
  case when v_clock_out is null then 'clocked_in' else 'completed' end,
  true, now(), auth.uid(), v_reason, auth.uid()
) returning id into v_record_id;

perform public.write_employee_audit(
  p_employee_id,
  'attendance.created_by_hr',
  'attendance',
  v_record_id,
  jsonb_build_array('attendance_date', 'clock_in_at', 'clock_out_at', 'status', 'is_corrected'),
  '{}'::jsonb,
  jsonb_build_object(
    'attendance_date', p_attendance_date,
    'clock_in_at', v_clock_in,
    'clock_out_at', v_clock_out,
    'status', case when v_clock_out is null then 'clocked_in' else 'completed' end,
    'is_corrected', true
  ),
  '{}'::jsonb,
  'application',
  auth.uid()
);
```

Map unique violations to `ATTENDANCE_ALREADY_EXISTS`. Revoke from `public, anon`; grant to `authenticated`.

- [ ] **Step 4: Implement HR correction**

Add `public.hr_correct_attendance(p_attendance_id uuid, p_attendance_date date, p_clock_in_local timestamp, p_clock_out_local timestamp default null, p_reason text default null) returns void`.

It must:

- verify HR role;
- normalize required reason;
- lock the record;
- reject a changed date if another row already exists for employee/date;
- convert local inputs with `at time zone 'Asia/Manila'`;
- reject future, cross-date, and invalid-order values;
- update `attendance_date`, `clock_in_at`, `clock_out_at`, `status`, `is_corrected`, correction metadata, and `updated_at`;
- write `attendance.corrected` with safe before/after values;
- exclude the reason from audit JSON;
- revoke from `public, anon`, then grant to `authenticated`.

Use exact safe audit fields:

```sql
jsonb_build_array(
  'attendance_date', 'clock_in_at', 'clock_out_at', 'status', 'is_corrected'
)
```

- [ ] **Step 5: Run migration tests**

```bash
npm test -- src/features/attendance/migration.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/202607140003_attendance_mvp.sql \
  src/features/attendance/migration.test.ts
git commit -m "feat: add HR attendance corrections"
```

---

### Task 10: Add HR attendance actions, forms, list, and employee detail pages

**Files:**
- Modify: `src/app/(dashboard)/attendance/actions.ts`
- Create: `src/components/attendance/admin-attendance-form.tsx`
- Create: `src/components/attendance/admin-attendance-table.tsx`
- Create: `src/app/(dashboard)/admin/attendance/page.tsx`
- Create: `src/app/(dashboard)/admin/attendance/new/page.tsx`
- Create: `src/app/(dashboard)/admin/attendance/[employeeId]/page.tsx`
- Create: `src/app/(dashboard)/admin/attendance/[employeeId]/[recordId]/edit/page.tsx`
- Modify: `src/features/attendance/actions.test.ts`

**Interfaces:**
- Produces `createAttendanceByHr` and `correctAttendanceByHr`.
- Produces HR attendance management routes.

- [ ] **Step 1: Add action tests for HR RPCs and route protection**

Append:

```ts
test("HR actions require attendance admin authorization and protected RPCs", () => {
  assert.match(source, /requireAttendanceAdmin/);
  assert.match(source, /\.rpc\("hr_create_attendance"/);
  assert.match(source, /\.rpc\("hr_correct_attendance"/);
  assert.match(source, /validateHrAttendance/);
});

test("HR correction reasons are never logged or returned in retry values", () => {
  assert.doesNotMatch(source, /console\.(log|error)\([^)]*reason/);
  assert.doesNotMatch(source, /values:[\s\S]+reason/);
});
```

- [ ] **Step 2: Implement HR Server Actions**

Append to `attendance/actions.ts`:

```ts
import { requireAttendanceAdmin } from "@/features/attendance/auth";
import { validateHrAttendance, validateReviewDecision } from "@/features/attendance/validation";

function hrAttendanceError(message: string) {
  if (message.includes("ATTENDANCE_ALREADY_EXISTS")) return "Attendance already exists for this employee and date.";
  if (message.includes("INVALID_CLOCK_ORDER")) return "Clock-out must be later than clock-in.";
  if (message.includes("CLOCK_IN_DATE_MISMATCH") || message.includes("CLOCK_OUT_DATE_MISMATCH")) {
    return "Both timestamps must belong to the selected Asia/Manila attendance date.";
  }
  if (message.includes("FUTURE_ATTENDANCE_NOT_ALLOWED")) return "Future attendance dates are not allowed.";
  return "Attendance could not be saved. Please try again.";
}

export async function createAttendanceByHr(
  employeeId: string,
  _state: AttendanceActionState,
  formData: FormData,
): Promise<AttendanceActionState> {
  const { supabase } = await requireAttendanceAdmin();
  const validation = validateHrAttendance(formData);
  if (!validation.data) return validation.state ?? { error: "Invalid attendance record." };

  const { error } = await supabase.rpc("hr_create_attendance", {
    p_employee_id: employeeId,
    p_attendance_date: validation.data.attendanceDate,
    p_clock_in_local: validation.data.clockInLocal,
    p_clock_out_local: validation.data.clockOutLocal,
    p_reason: validation.data.reason,
  });
  if (error) return { error: hrAttendanceError(error.message) };

  revalidateAttendance();
  revalidatePath(`/admin/attendance/${employeeId}`);
  redirect(`/admin/attendance/${employeeId}?success=created`);
}

export async function correctAttendanceByHr(
  employeeId: string,
  recordId: string,
  _state: AttendanceActionState,
  formData: FormData,
): Promise<AttendanceActionState> {
  const { supabase } = await requireAttendanceAdmin();
  const validation = validateHrAttendance(formData);
  if (!validation.data) return validation.state ?? { error: "Invalid attendance record." };

  const { error } = await supabase.rpc("hr_correct_attendance", {
    p_attendance_id: recordId,
    p_attendance_date: validation.data.attendanceDate,
    p_clock_in_local: validation.data.clockInLocal,
    p_clock_out_local: validation.data.clockOutLocal,
    p_reason: validation.data.reason,
  });
  if (error) return { error: hrAttendanceError(error.message) };

  revalidateAttendance();
  revalidatePath(`/admin/attendance/${employeeId}`);
  redirect(`/admin/attendance/${employeeId}?success=corrected`);
}
```

- [ ] **Step 3: Create the HR form**

`AdminAttendanceForm` must:

- use `datetime-local` fields labeled `Asia/Manila`;
- require attendance date and clock-in;
- allow blank clock-out;
- require correction reason;
- keep reason out of action-state values;
- support create and edit through a passed action;
- prefill existing UTC timestamps converted to `YYYY-MM-DDTHH:mm` in Asia/Manila using a helper `toCompanyDateTimeLocal` added to `time.ts` and unit-tested.

Use this signature:

```tsx
export function AdminAttendanceForm({
  employeeId,
  action,
  initialRecord,
  submitLabel,
}: {
  employeeId: string;
  action: (state: AttendanceActionState, formData: FormData) => Promise<AttendanceActionState>;
  initialRecord: AttendanceRecord | null;
  submitLabel: string;
}) {}
```

- [ ] **Step 4: Create admin attendance table**

`AdminAttendanceTable` displays employee, date, clock-in/out, effective status, corrected badge, and view/edit actions. Use responsive cards on mobile and this signature:

```tsx
export function AdminAttendanceTable({ records }: { records: AttendanceRecord[] }) {}
```

- [ ] **Step 5: Create `/admin/attendance`**

The page must:

- call `requireAttendanceAdmin()` before any attendance query;
- load departments using `getEmployeeOptions()`;
- parse date, employee search, department, status, and page;
- call `getAdminAttendance`;
- show `Create attendance record` and `Correction requests` actions;
- render server-side filters and 20-row pagination;
- use current company date as default only when the user has not supplied a date filter.

- [ ] **Step 6: Create HR new-record flow**

`/admin/attendance/new` accepts an employee query parameter or presents an employee selector loaded from active employees. After selection, bind `createAttendanceByHr(employeeId, state, formData)` and render `AdminAttendanceForm`.

- [ ] **Step 7: Create employee attendance detail page**

`/admin/attendance/[employeeId]` must:

- require HR role;
- load the employee and attendance history;
- show open/missing records first;
- show correction metadata only to HR;
- link to create and edit routes;
- link to the employee Activity page for audit history.

- [ ] **Step 8: Create edit route**

`/admin/attendance/[employeeId]/[recordId]/edit` must:

- require HR role;
- query the record by both employee ID and record ID;
- return `notFound()` when mismatched;
- bind `correctAttendanceByHr(employeeId, recordId, state, formData)`;
- render `AdminAttendanceForm` with prefilled values.

- [ ] **Step 9: Run tests and build**

```bash
npm test -- src/features/attendance/actions.test.ts \
  src/features/attendance/time.test.ts
npm run build
```

Expected: admin attendance routes compile and tests PASS.

- [ ] **Step 10: Commit**

```bash
git add 'src/app/(dashboard)/admin/attendance' \
  'src/app/(dashboard)/attendance/actions.ts' \
  src/components/attendance \
  src/features/attendance
git commit -m "feat: add HR attendance management"
```

---

### Task 11: Add HR correction queue and atomic review UI

**Files:**
- Modify: `src/app/(dashboard)/attendance/actions.ts`
- Create: `src/components/attendance/correction-review-form.tsx`
- Create: `src/app/(dashboard)/admin/attendance/corrections/page.tsx`
- Create: `src/app/(dashboard)/admin/attendance/corrections/[requestId]/page.tsx`
- Modify: `src/features/attendance/actions.test.ts`

**Interfaces:**
- Produces `reviewCorrectionRequest(requestId, state, formData)`.
- Produces HR correction queue and review route.

- [ ] **Step 1: Add review action tests**

Append:

```ts
test("review action invokes one atomic review RPC", () => {
  assert.match(source, /\.rpc\("review_attendance_correction_request"/);
  assert.match(source, /validateReviewDecision/);
  assert.doesNotMatch(source, /\.from\("attendance_records"\)[\s\S]+\.update/);
});
```

- [ ] **Step 2: Implement review action**

Append:

```ts
export async function reviewCorrectionRequest(
  requestId: string,
  _state: AttendanceActionState,
  formData: FormData,
): Promise<AttendanceActionState> {
  const { supabase } = await requireAttendanceAdmin();
  const validation = validateReviewDecision(formData);
  if (!validation.data) return validation.state ?? { error: "Invalid review decision." };

  const { error } = await supabase.rpc("review_attendance_correction_request", {
    p_request_id: requestId,
    p_decision: validation.data.decision,
    p_review_note: validation.data.reviewNote,
  });
  if (error) {
    if (error.message.includes("SELF_REVIEW_NOT_ALLOWED")) {
      return { error: "You cannot review your own correction request." };
    }
    if (error.message.includes("REQUEST_NOT_PENDING")) {
      return { error: "This correction request is no longer pending." };
    }
    return { error: "The correction request could not be reviewed. Please try again." };
  }

  revalidateAttendance();
  revalidatePath("/admin/attendance/corrections");
  redirect(`/admin/attendance/corrections?success=${validation.data.decision === "approve" ? "approved" : "rejected"}`);
}
```

- [ ] **Step 3: Create review form**

`CorrectionReviewForm` must render:

- optional review note limited to 1,000 characters;
- one submit button named `decision` with value `approve`;
- one submit button named `decision` with value `reject`;
- explicit confirmation for approval because it changes official attendance;
- state errors without echoing review text.

- [ ] **Step 4: Create correction queue**

`/admin/attendance/corrections` must:

- require HR role;
- default to `pending`;
- sort pending oldest first;
- show all/pending/approved/rejected/cancelled filters;
- display employee, attendance date, request type, requested values, submitted date, and status;
- paginate at 20;
- link each row to the review page.

- [ ] **Step 5: Create request review page**

`/admin/attendance/corrections/[requestId]` must:

- require HR role before query;
- query the request with employee, official record, and reviewer;
- show current and requested timestamps side by side;
- display private reason and optional employee note to HR;
- show a visible self-review warning and disable controls when `requested_by` equals the current authenticated user;
- show read-only outcome when status is not pending;
- bind `reviewCorrectionRequest` only when pending and reviewable.

- [ ] **Step 6: Run tests and build**

```bash
npm test -- src/features/attendance/actions.test.ts
npm run build
```

Expected: PASS and both correction admin routes compile.

- [ ] **Step 7: Commit**

```bash
git add 'src/app/(dashboard)/admin/attendance/corrections' \
  'src/app/(dashboard)/attendance/actions.ts' \
  src/components/attendance/correction-review-form.tsx \
  src/features/attendance/actions.test.ts
git commit -m "feat: add attendance correction review queue"
```

---

### Task 12: Make dashboard and sidebar attendance role-aware

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`
- Modify: `src/components/app-shell.tsx`
- Modify: `src/components/sidebar.tsx`
- Modify: `src/app/(dashboard)/dashboard/page.tsx`
- Create: `src/components/attendance/dashboard-attendance-summary.tsx`
- Modify: `src/features/attendance/queries.ts`
- Modify: `src/features/attendance/queries.test.ts`

**Interfaces:**
- `AppShell` passes role to `Sidebar`.
- Employee sidebar links to `/attendance` as **My Attendance**.
- HR sidebar links to `/admin/attendance` and `/admin/attendance/corrections`.
- Dashboard replaces mock attendance with production data.

- [ ] **Step 1: Pass the role to the sidebar**

Change `AppShell`:

```tsx
<Sidebar role={user.role} />
```

Change `Sidebar` signature:

```tsx
export function Sidebar({ role }: { role: string }) {}
```

Build attendance items with:

```tsx
const attendanceItems = role === "hr_admin" || role === "super_admin"
  ? [
      ["/admin/attendance", "Attendance", Clock3],
      ["/admin/attendance/corrections", "Correction Requests", ClipboardCheck],
    ] as const
  : [["/attendance", "My Attendance", Clock3]] as const;
```

Place these items after Employees and before Leave. Use a path-active helper that prefers the most specific matching href so both HR links are not highlighted simultaneously.

- [ ] **Step 2: Add dashboard attendance summary query**

Add to `queries.ts`:

```ts
export async function getAdminAttendanceSummary() {
  const supabase = await createClient();
  const companyDate = companyDateAt();
  const [today, open, pending] = await Promise.all([
    supabase
      .from("attendance_records")
      .select("id", { count: "exact", head: true })
      .eq("attendance_date", companyDate),
    supabase
      .from("attendance_records")
      .select("id", { count: "exact", head: true })
      .lt("attendance_date", companyDate)
      .is("clock_out_at", null),
    supabase
      .from("attendance_correction_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  return {
    companyDate,
    presentToday: today.count ?? 0,
    missingClockOut: open.count ?? 0,
    pendingCorrections: pending.count ?? 0,
  };
}
```

- [ ] **Step 3: Create HR dashboard summary component**

`DashboardAttendanceSummary` displays real present-today, missing-clock-out, and pending-correction counts with links to the corresponding admin filters. It must not load data client-side.

- [ ] **Step 4: Replace mock dashboard attendance**

Make `DashboardPage` async. Use `getCurrentRole()`:

- Employee: call `requireAttendanceEmployee()` and `getTodayAttendanceContext(employee)`, then render `AttendanceClockCard`.
- HR/Super Admin: call `getAdminAttendanceSummary()` and render `DashboardAttendanceSummary`.
- Replace mock `Present today` with the real summary count for HR; for employee dashboard, omit the workforce count or label the card `My attendance`.
- Remove `attendance` from `@/data/mock` imports.
- Keep unrelated leave and recently-added mock sections unchanged until their own phases.

- [ ] **Step 5: Run tests and build**

```bash
npm test -- src/features/attendance/queries.test.ts
npm run build
```

Expected: no dashboard or attendance route imports mock attendance data; build PASS.

- [ ] **Step 6: Commit**

```bash
git add 'src/app/(dashboard)/layout.tsx' \
  'src/app/(dashboard)/dashboard/page.tsx' \
  src/components/app-shell.tsx \
  src/components/sidebar.tsx \
  src/components/attendance/dashboard-attendance-summary.tsx \
  src/features/attendance/queries.ts \
  src/features/attendance/queries.test.ts
git commit -m "feat: integrate attendance into dashboard navigation"
```

---

### Task 13: Extend employee Activity with attendance audit presentation

**Files:**
- Modify: `src/features/employees/audit/types.ts`
- Modify: `src/features/employees/audit/presentation.ts`
- Modify: `src/features/employees/audit/presentation.test.ts`

**Interfaces:**
- Adds `attendance` filter to existing Activity timeline.
- Safely formats attendance timestamps and statuses.

- [ ] **Step 1: Add failing attendance presentation tests**

Append to `presentation.test.ts`:

```ts
test("attendance correction shows only safe timestamp changes", () => {
  const result = describeAuditEntry(entry({
    action: "attendance.corrected",
    entity_type: "attendance",
    changed_fields: ["clock_out_at", "is_corrected"],
    before_values: { clock_out_at: null, is_corrected: false },
    after_values: { clock_out_at: "2026-07-14T09:00:00.000Z", is_corrected: true },
  }));
  assert.equal(result.title, "Attendance corrected");
  assert.match(result.detail ?? "", /Clock out/);
  assert.doesNotMatch(result.detail ?? "", /reason|note/i);
});

test("correction request actions use readable titles", () => {
  for (const [action, title] of [
    ["attendance_correction.requested", "Attendance correction requested"],
    ["attendance_correction.approved", "Attendance correction approved"],
    ["attendance_correction.rejected", "Attendance correction rejected"],
    ["attendance_correction.cancelled", "Attendance correction cancelled"],
  ]) {
    assert.equal(describeAuditEntry(entry({ action })).title, title);
  }
});
```

- [ ] **Step 2: Add attendance Activity filter**

In `types.ts`, extend `activityFilters` with `attendance` and map it:

```ts
attendance: ["attendance", "attendance_correction"],
```

Update the Activity page label map:

```ts
attendance: "Attendance",
```

- [ ] **Step 3: Extend safe labels and titles**

Add titles:

```ts
"attendance.clocked_in": "Clocked in",
"attendance.clocked_out": "Clocked out",
"attendance.created_by_hr": "Attendance created by HR",
"attendance.corrected": "Attendance corrected",
"attendance_correction.requested": "Attendance correction requested",
"attendance_correction.approved": "Attendance correction approved",
"attendance_correction.rejected": "Attendance correction rejected",
"attendance_correction.cancelled": "Attendance correction cancelled",
```

Add field labels:

```ts
attendance_date: "Attendance date",
clock_in_at: "Clock in",
clock_out_at: "Clock out",
status: "Status",
is_corrected: "Corrected",
request_type: "Request type",
request_status: "Request status",
```

Add these fields to the before/after allowlist:

```ts
"attendance_date",
"clock_in_at",
"clock_out_at",
"status",
"is_corrected",
"request_type",
"request_status",
```

Format ISO timestamps through `formatCompanyDateTime` rather than raw ISO when the field is `clock_in_at` or `clock_out_at`.

- [ ] **Step 4: Run presentation tests**

```bash
npm test -- src/features/employees/audit/presentation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/employees/audit \
  'src/app/(dashboard)/employees/[id]/activity/page.tsx'
git commit -m "feat: add attendance audit presentation"
```

---

### Task 14: Add responsive styles, documentation, security regression tests, and final verification

**Files:**
- Modify: `src/app/globals.css`
- Create: `src/features/attendance/security.test.ts`
- Modify: `README.md`
- Add: `docs/superpowers/specs/2026-07-14-phase-5a-attendance-mvp-design.md`
- Add: `docs/superpowers/plans/2026-07-14-phase-5a-attendance-mvp.md`

**Interfaces:**
- Provides final responsive behavior and deployment instructions.

- [ ] **Step 1: Add security regression tests**

Create `src/features/attendance/security.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../../../supabase/migrations/202607140003_attendance_mvp.sql", import.meta.url),
  "utf8",
);
const actions = await readFile(
  new URL("../../app/(dashboard)/attendance/actions.ts", import.meta.url),
  "utf8",
);

test("attendance audit calls never include private text columns", () => {
  assert.doesNotMatch(
    migration,
    /write_employee_audit\([^;]+(clock_in_note|clock_out_note|last_correction_reason|reason|employee_note|review_note)/is,
  );
});

test("attendance actions do not log private form values", () => {
  assert.doesNotMatch(actions, /console\.(log|error)\([^)]*(note|reason|review)/i);
  assert.doesNotMatch(actions, /localStorage|sessionStorage/);
});

test("no permanent delete workflow exists", () => {
  assert.doesNotMatch(actions, /\.delete\(\)/);
  assert.doesNotMatch(
    migration,
    /create policy[^;]+on public\.(attendance_records|attendance_correction_requests)[^;]+for delete/i,
  );
});

test("employee clock actions cannot accept official timestamps", () => {
  const clockSection = actions.slice(
    actions.indexOf("export async function clockIn"),
    actions.indexOf("export async function createCorrectionRequest"),
  );
  assert.doesNotMatch(clockSection, /clock_in_at|clock_out_at|clockInLocal|clockOutLocal/);
});
```

- [ ] **Step 2: Add attendance styles**

Append a dedicated `/* Phase 5A: attendance MVP */` section to `globals.css` covering:

```css
.eyebrow { margin: 0 0 5px; color: var(--primary); font-size: 12px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
.attendance-clock-card { display: grid; gap: 18px; margin-bottom: 18px; }
.attendance-clock-heading,
.section-heading-row,
.attendance-record-card-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.attendance-clock-form { display: grid; gap: 12px; max-width: 680px; }
.attendance-clock-form label { display: grid; gap: 8px; font-size: 13px; font-weight: 700; }
.attendance-clock-form textarea { resize: vertical; min-height: 88px; }
.attendance-time-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.attendance-time-grid > div { display: grid; gap: 5px; padding: 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface-2); }
.attendance-time-grid span { color: var(--muted); font-size: 12px; }
.attendance-badges { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.attendance-warning-card { border-color: #f59e0b; background: #fffbeb; }
.attendance-history-section { margin-top: 18px; }
.attendance-filter-toolbar { margin: 16px 0; }
.attendance-mobile-cards { display: none; }
.attendance-record-card { display: grid; gap: 14px; padding: 16px; border: 1px solid var(--border); border-radius: 14px; }
.attendance-record-card dl { display: grid; gap: 10px; margin: 0; }
.attendance-record-card dl div { display: flex; justify-content: space-between; gap: 16px; }
.attendance-record-card dt { color: var(--muted); }
.attendance-record-card dd { margin: 0; font-weight: 700; }
.attendance-review-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
.attendance-private-text { white-space: pre-wrap; overflow-wrap: anywhere; }

@media (max-width: 760px) {
  .attendance-clock-heading,
  .section-heading-row,
  .attendance-record-card-heading { align-items: stretch; flex-direction: column; }
  .attendance-time-grid,
  .attendance-review-grid { grid-template-columns: 1fr; }
  .attendance-desktop-table { display: none; }
  .attendance-mobile-cards { display: grid; gap: 12px; }
  .attendance-filter-toolbar { align-items: stretch; flex-direction: column; }
  .attendance-filter-toolbar .field,
  .attendance-filter-toolbar .btn,
  .attendance-clock-form .btn,
  .attendance-record-card .btn { width: 100%; min-height: 44px; justify-content: center; }
}
```

- [ ] **Step 3: Update README**

Document:

```text
Migration: supabase/migrations/202607140003_attendance_mvp.sql
Company timezone: Asia/Manila
Employee routes:
  /attendance
  /attendance/corrections
  /attendance/corrections/new
HR routes:
  /admin/attendance
  /admin/attendance/new
  /admin/attendance/[employeeId]
  /admin/attendance/[employeeId]/[recordId]/edit
  /admin/attendance/corrections
  /admin/attendance/corrections/[requestId]
```

Include migration-before-code deployment order, role matrix, audit privacy requirements, and manual QA checklist.

- [ ] **Step 4: Run complete automated verification**

```bash
npm test
npx tsc --noEmit
npm run build
```

Expected:

- zero failed tests;
- TypeScript exits with code 0;
- production build succeeds;
- routes include all employee and HR attendance pages;
- no attendance page imports mock attendance data.

- [ ] **Step 5: Apply the migration to development Supabase**

Run the full migration, then verify:

```sql
select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('attendance_records', 'attendance_correction_requests');

select routine_name, security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'clock_in_attendance',
    'clock_out_attendance',
    'create_attendance_correction_request',
    'cancel_attendance_correction_request',
    'review_attendance_correction_request',
    'hr_create_attendance',
    'hr_correct_attendance'
  )
order by routine_name;
```

- [ ] **Step 6: Run manual role and concurrency QA**

Employee:

```text
[ ] First clock-in creates one record and one audit row
[ ] Double-click or two-tab clock-in produces one record
[ ] Clock-out completes the record and creates one audit row
[ ] Previous open record blocks a new clock-in
[ ] Employee sees only personal records and requests
[ ] Employee can create and cancel a pending request
[ ] Employee cannot access any /admin/attendance route
```

HR Admin and Super Admin:

```text
[ ] Can view all attendance
[ ] Can create a missing record with a required reason
[ ] Can correct an existing record with a required reason
[ ] Can approve or reject another person's request
[ ] Cannot review their own request
[ ] Approval writes one attendance correction audit and one request approval audit
[ ] No permanent-delete control exists
```

Security:

```text
[ ] Notes and reasons are absent from employee_audit_logs
[ ] Direct UPDATE/DELETE attempts on attendance tables fail
[ ] Employee RPC timestamps match PostgreSQL time, not browser-submitted values
[ ] Cross-date and overnight timestamps are rejected
[ ] 30-day request boundaries work at day 0 and day 30; day 31 fails
```

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat: complete Phase 5A attendance MVP"
```

---

## Final acceptance checklist

```text
[ ] One attendance record per employee and company date
[ ] PostgreSQL generates employee clock timestamps
[ ] Asia/Manila is used consistently
[ ] Previous open records block clock-in
[ ] Missing clock-out is derived without cron mutation
[ ] Employee sees only own attendance and requests
[ ] HR sees all records and requests
[ ] HR creation and correction require a reason
[ ] Employee requests enforce the 30-day window
[ ] One pending request per employee/date
[ ] Self-review is blocked
[ ] Approval is atomic
[ ] Audit events are complete and not duplicated
[ ] Audit JSON contains no notes or reasons
[ ] No delete workflow or delete policy exists
[ ] Dashboard and sidebar are role-aware
[ ] Mock attendance UI is removed
[ ] Responsive mobile layouts work
[ ] All tests pass
[ ] TypeScript passes
[ ] Production build passes
[ ] Supabase role and concurrency QA pass
```
