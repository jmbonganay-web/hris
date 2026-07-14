# Phase 5B-2A Attendance Policy and Daily Calculations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add effective-dated attendance policies, append-only daily calculation revisions, late/undertime/worked-minute calculations, absence and missing-clock-out finalization, manual recalculation, and employee/HR calculation interfaces.

**Architecture:** PostgreSQL owns calculation integrity and revision creation. One calculation group identifies each employee/date, while immutable revisions preserve every provisional, finalized, or recalculated result and the exact attendance, schedule, and policy sources used. Next.js Server Actions invoke protected RPCs, server-only queries expose safe active results to employees and full history to HR, and a Supabase `pg_cron` job finalizes the previous Manila date.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase PostgreSQL/Auth/RLS, PostgreSQL security-definer functions, `pg_cron`, Node built-in test runner, CSS.

## Global Constraints

- Company timezone is exactly `Asia/Manila`.
- One company-wide effective-dated attendance policy applies to all employees.
- Phase 5B-2A policy data contains only `late_grace_minutes`; overtime and holiday rules remain out of scope.
- Late grace suppresses lateness when clock-in is within the grace period; after grace is exceeded, all completed minutes after scheduled start count as late.
- There is no undertime grace period.
- All minute calculations truncate seconds and use completed whole minutes.
- Worked minutes use actual clock-in and clock-out timestamps.
- Scheduled completed attendance deducts the fixed schedule break exactly once and floors worked minutes at zero.
- Unscheduled attendance does not deduct a schedule break.
- Early clock-in and time after scheduled end remain included in worked minutes but are not labeled overtime.
- Calculation base statuses are exactly `present`, `absent`, `missing_clock_out`, `rest_day_worked`, and `unscheduled_attendance`.
- Late, undertime, corrected, and recalculated are independent flags, not combined status values.
- Clock-in creates a provisional revision; clock-out creates a finalized revision.
- Absence is created only after the Manila date ends, only for a scheduled workday, and never for an unassigned employee or rest day.
- Missing clock-out revisions may contain late minutes but must contain null worked and undertime minutes.
- Each employee/date has one calculation group and append-only immutable revisions.
- Reports and employee pages use only the active revision.
- HR cannot type arbitrary calculated totals; HR corrects source data and recalculates.
- Backdated policy versions require a reason and never silently rewrite finalized results.
- Manual recalculation requires a reason and creates a new immutable revision.
- Employee-facing projections exclude previous revisions, protected reasons, internal errors, and unnecessary actor identifiers.
- Policy change reasons, recalculation reasons, manual finalization reasons, attendance notes, and attendance correction reasons never enter general audit JSON or application logs.
- No authenticated role receives direct insert, update, or delete access to calculation groups or revisions.
- No permanent deletion workflow is added.
- Phase 5A and Phase 5B-1 behavior must remain compatible.
- No new runtime npm dependencies.

---

## Baseline and exact project assumptions

Expected baseline before implementation:

```text
Phase 5B-1 tests: 184 passed
Production build: passed
```

Existing relevant files:

```text
src/features/attendance/types.ts
src/features/attendance/time.ts
src/features/attendance/validation.ts
src/features/attendance/queries.ts
src/features/attendance/auth.ts
src/app/(dashboard)/attendance/actions.ts
src/app/(dashboard)/attendance/page.tsx
src/app/(dashboard)/admin/attendance/page.tsx
src/app/(dashboard)/admin/attendance/[employeeId]/page.tsx
src/components/attendance/attendance-clock-card.tsx
src/components/attendance/attendance-history.tsx
src/components/attendance/admin-attendance-table.tsx
src/components/attendance/dashboard-attendance-summary.tsx
src/features/schedules/queries.ts
src/features/schedules/types.ts
supabase/migrations/202607140003_attendance_mvp.sql
supabase/migrations/202607140004_work_schedules.sql
```

New migration:

```text
supabase/migrations/202607150001_attendance_policy_calculations.sql
```

---

## File map

### Create

```text
supabase/migrations/202607150001_attendance_policy_calculations.sql

src/features/attendance/calculations/types.ts
src/features/attendance/calculations/rules.ts
src/features/attendance/calculations/rules.test.ts
src/features/attendance/calculations/migration.test.ts
src/features/attendance/calculations/queries.ts
src/features/attendance/calculations/queries.test.ts
src/features/attendance/calculations/presentation.ts
src/features/attendance/calculations/presentation.test.ts
src/features/attendance/calculations/security.test.ts

src/features/attendance/policy/types.ts
src/features/attendance/policy/validation.ts
src/features/attendance/policy/validation.test.ts
src/features/attendance/policy/queries.ts
src/features/attendance/policy/queries.test.ts

src/app/(dashboard)/settings/attendance-policy/actions.ts
src/app/(dashboard)/settings/attendance-policy/page.tsx
src/app/(dashboard)/settings/attendance-policy/new/page.tsx

src/app/(dashboard)/admin/attendance/recalculate/actions.ts
src/app/(dashboard)/admin/attendance/recalculate/page.tsx
src/app/(dashboard)/admin/attendance/finalization/actions.ts
src/app/(dashboard)/admin/attendance/finalization/page.tsx
src/app/(dashboard)/admin/attendance/[employeeId]/[attendanceDate]/calculation/page.tsx

src/components/attendance/attendance-policy-form.tsx
src/components/attendance/calculation-status.tsx
src/components/attendance/attendance-calculation-card.tsx
src/components/attendance/attendance-calculation-details.tsx
src/components/attendance/recalculate-attendance-form.tsx
src/components/attendance/finalization-run-list.tsx
```

### Modify

```text
src/features/attendance/types.ts
src/features/attendance/validation.ts
src/features/attendance/queries.ts
src/features/attendance/time.ts
src/app/(dashboard)/attendance/actions.ts
src/app/(dashboard)/attendance/page.tsx
src/app/(dashboard)/admin/attendance/page.tsx
src/app/(dashboard)/admin/attendance/[employeeId]/page.tsx
src/app/(dashboard)/settings/page.tsx
src/app/(dashboard)/dashboard/page.tsx
src/components/attendance/attendance-clock-card.tsx
src/components/attendance/attendance-history.tsx
src/components/attendance/admin-attendance-table.tsx
src/components/attendance/dashboard-attendance-summary.tsx
src/components/sidebar.tsx
src/features/employees/audit/presentation.ts
src/features/employees/audit/presentation.test.ts
src/app/globals.css
README.md
docs/superpowers/specs/2026-07-15-phase-5b2a-attendance-policy-calculations-design.md
```

---

## Shared TypeScript contracts

Create these contracts in `src/features/attendance/calculations/types.ts`:

```ts
export const attendanceCalculationBaseStatuses = [
  "present",
  "absent",
  "missing_clock_out",
  "rest_day_worked",
  "unscheduled_attendance",
] as const;

export type AttendanceCalculationBaseStatus =
  (typeof attendanceCalculationBaseStatuses)[number];

export const attendanceCalculationSources = [
  "clock_in",
  "clock_out",
  "hr_create",
  "hr_correction",
  "correction_approval",
  "daily_finalization",
  "manual_recalculation",
  "manual_finalization",
] as const;

export type AttendanceCalculationSource =
  (typeof attendanceCalculationSources)[number];

export type AttendanceCalculationRevision = {
  id: string;
  calculation_group_id: string;
  revision_number: number;
  employee_id: string;
  attendance_date: string;
  attendance_record_id: string | null;
  schedule_assignment_id: string | null;
  schedule_version_id: string | null;
  policy_version_id: string | null;
  base_status: AttendanceCalculationBaseStatus;
  is_provisional: boolean;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  scheduled_minutes: number | null;
  actual_clock_in_at: string | null;
  actual_clock_out_at: string | null;
  worked_minutes: number | null;
  late_minutes: number | null;
  undertime_minutes: number | null;
  is_late: boolean;
  is_undertime: boolean;
  is_corrected: boolean;
  is_recalculated: boolean;
  calculation_source: AttendanceCalculationSource;
  calculated_at: string;
};

export type HrAttendanceCalculationRevision =
  AttendanceCalculationRevision & {
    calculated_by: string | null;
    recalculation_reason: string | null;
    calculator: {
      id: string;
      display_name: string | null;
      first_name: string;
      last_name: string;
    } | null;
  };

export type ActiveAttendanceCalculation =
  AttendanceCalculationRevision & {
    schedule_name: string | null;
    schedule_code: string | null;
  };

export type AttendanceCalculationGroup = {
  id: string;
  employee_id: string;
  attendance_date: string;
  active_revision_id: string | null;
  active_revision: ActiveAttendanceCalculation | null;
};

export type CalculationState = "provisional" | "finalized";

export type AttendanceCalculationFilters = {
  baseStatus?: string;
  late?: boolean;
  undertime?: boolean;
  provisional?: boolean;
  corrected?: boolean;
  recalculated?: boolean;
};

export type RecalculationActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
  values?: {
    scope?: "one_employee" | "all_active";
    employeeId?: string;
    startDate?: string;
    endDate?: string;
  };
};

export type FinalizationRun = {
  id: string;
  target_date: string;
  run_source: "scheduled_job" | "manual";
  status: "running" | "completed" | "completed_with_errors" | "failed";
  started_at: string;
  completed_at: string | null;
  employees_processed: number;
  absences_created: number;
  missing_clock_outs_finalized: number;
  unchanged_results_skipped: number;
  error_count: number;
  started_by: string | null;
  manual_reason: string | null;
};
```

Create policy types in `src/features/attendance/policy/types.ts`:

```ts
export type AttendancePolicyVersion = {
  id: string;
  effective_date: string;
  late_grace_minutes: number;
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

export type AttendancePolicyActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: {
    effectiveDate?: string;
    lateGraceMinutes?: string;
  };
};
```

---

### Task 1: Add policy, calculation, revision, and finalization schema

**Files:**
- Create: `supabase/migrations/202607150001_attendance_policy_calculations.sql`
- Create: `src/features/attendance/calculations/migration.test.ts`

**Interfaces:**
- Produces the four Phase 5B-2A tables.
- Adds immutable RLS and active-revision integrity.
- Enables `pg_cron`.
- Does not yet implement calculation functions.

- [ ] **Step 1: Write the failing migration source tests**

Create `src/features/attendance/calculations/migration.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL(
    "../../../../supabase/migrations/202607150001_attendance_policy_calculations.sql",
    import.meta.url,
  ),
  "utf8",
);

test("migration creates policy, groups, revisions, and finalization runs", () => {
  for (const table of [
    "attendance_policy_versions",
    "attendance_calculation_groups",
    "attendance_calculation_revisions",
    "attendance_finalization_runs",
  ]) {
    assert.match(
      sql,
      new RegExp(`create table if not exists public\\.${table}`, "i"),
    );
  }
});

test("calculation revisions are append-only and groups are not directly writable", () => {
  assert.doesNotMatch(
    sql,
    /create policy[^;]+attendance_calculation_revisions[^;]+for update/i,
  );
  assert.doesNotMatch(
    sql,
    /create policy[^;]+attendance_calculation_revisions[^;]+for delete/i,
  );
  assert.doesNotMatch(
    sql,
    /create policy[^;]+attendance_calculation_groups[^;]+for insert/i,
  );
});

test("revision constraints encode approved status combinations", () => {
  assert.match(sql, /missing_clock_out/i);
  assert.match(sql, /worked_minutes is null/i);
  assert.match(sql, /undertime_minutes is null/i);
  assert.match(sql, /base_status <> 'absent' or attendance_record_id is null/i);
  assert.match(sql, /base_status not in \('absent', 'missing_clock_out'\)/i);
});

test("policy and revisions cannot be updated or deleted through RLS", () => {
  assert.doesNotMatch(
    sql,
    /create policy[^;]+attendance_policy_versions[^;]+for update/i,
  );
  assert.doesNotMatch(
    sql,
    /create policy[^;]+attendance_policy_versions[^;]+for delete/i,
  );
});

test("migration configures a daily Manila finalization cron job", () => {
  assert.match(sql, /create extension if not exists pg_cron/i);
  assert.match(sql, /finalize-attendance-daily/i);
  assert.match(sql, /Asia\/Manila/i);
});
```

- [ ] **Step 2: Run the test and verify RED**

```bash
npm test -- src/features/attendance/calculations/migration.test.ts
```

Expected: failure because the migration does not exist.

- [ ] **Step 3: Create the four tables**

Use the exact columns from the approved spec. Important constraints:

```sql
constraint attendance_policy_grace_check
  check (late_grace_minutes between 0 and 120),

constraint attendance_policy_effective_unique
  unique (effective_date),

constraint calculation_group_employee_date_unique
  unique (employee_id, attendance_date),

constraint calculation_revision_number_unique
  unique (calculation_group_id, revision_number),

constraint calculation_nonnegative_minutes_check
  check (
    (scheduled_minutes is null or scheduled_minutes >= 0)
    and (worked_minutes is null or worked_minutes >= 0)
    and (late_minutes is null or late_minutes >= 0)
    and (undertime_minutes is null or undertime_minutes >= 0)
  ),

constraint calculation_missing_clock_out_check
  check (
    base_status <> 'missing_clock_out'
    or (worked_minutes is null and undertime_minutes is null)
  ),

constraint calculation_absent_check
  check (
    base_status <> 'absent'
    or attendance_record_id is null
  ),

constraint calculation_rest_unscheduled_check
  check (
    base_status not in ('rest_day_worked', 'unscheduled_attendance')
    or (late_minutes is null and undertime_minutes is null)
  ),

constraint calculation_provisional_status_check
  check (
    not is_provisional
    or base_status not in ('absent', 'missing_clock_out')
  )
```

Create indexes:

```sql
create index attendance_calculation_groups_employee_date_idx
  on public.attendance_calculation_groups(employee_id, attendance_date desc);

create index attendance_calculation_revisions_group_revision_idx
  on public.attendance_calculation_revisions(
    calculation_group_id,
    revision_number desc
  );

create index attendance_calculation_revisions_attendance_idx
  on public.attendance_calculation_revisions(attendance_record_id);

create index attendance_finalization_runs_target_idx
  on public.attendance_finalization_runs(target_date desc, started_at desc);

create unique index attendance_finalization_one_running_idx
  on public.attendance_finalization_runs(target_date)
  where status = 'running';
```

Create tables first without the circular `active_revision_id` foreign key, then add it after revisions exist:

```sql
alter table public.attendance_calculation_groups
  add constraint attendance_calculation_groups_active_revision_fkey
  foreign key (active_revision_id)
  references public.attendance_calculation_revisions(id)
  on delete restrict;
```

- [ ] **Step 4: Add RLS**

Policy rules:

```text
HR Admin/Super Admin:
- Read all policy versions, groups, revisions, finalization runs.

Employee:
- No direct policy-table access.
- No direct group or revision access.
- Employee access will use a safe projection RPC in Task 7.

All authenticated users:
- No direct insert/update/delete policy on groups or revisions.
- No update/delete policy on policy versions.
- No direct mutation policy on finalization runs.
```

- [ ] **Step 5: Add cron extension and idempotent schedule**

At the end of the migration, after `finalize_attendance_date` is implemented in Task 11, the same migration will contain:

```sql
create extension if not exists pg_cron with schema extensions;
```

Use an idempotent block:

```sql
do $$
declare
  v_job_id bigint;
begin
  select jobid
    into v_job_id
  from cron.job
  where jobname = 'finalize-attendance-daily';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'finalize-attendance-daily',
    '5 16 * * *',
    $cron$
      select public.finalize_attendance_date(
        ((now() at time zone 'Asia/Manila')::date - 1),
        'scheduled_job',
        null
      );
    $cron$
  );
end;
$$;
```

`16:05 UTC` is `00:05 Asia/Manila`; the target date is still computed in Manila inside the command.

- [ ] **Step 6: Run migration tests**

```bash
npm test -- src/features/attendance/calculations/migration.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/202607150001_attendance_policy_calculations.sql \
  src/features/attendance/calculations/migration.test.ts
git commit -m "feat: add attendance calculation schema"
```

---

### Task 2: Add pure minute and status calculation rules

**Files:**
- Create: `src/features/attendance/calculations/types.ts`
- Create: `src/features/attendance/calculations/rules.ts`
- Create: `src/features/attendance/calculations/rules.test.ts`
- Modify: `src/features/attendance/time.ts`

**Interfaces:**
- Produces `completedMinutesBetween`.
- Produces `calculateLateMinutes`.
- Produces `calculateUndertimeMinutes`.
- Produces `calculateWorkedMinutes`.
- Produces `classifyAttendanceCalculation`.
- Produces shared calculation types.

- [ ] **Step 1: Write failing rule tests**

Create tests covering:

```ts
test("whole minutes truncate seconds", () => {
  assert.equal(
    completedMinutesBetween(
      "2026-07-15T00:00:00.000Z",
      "2026-07-15T00:10:45.000Z",
    ),
    10,
  );
});

test("grace suppresses lateness until the threshold", () => {
  assert.equal(calculateLateMinutes(480, 488, 10), 0);
  assert.equal(calculateLateMinutes(480, 490, 10), 0);
  assert.equal(calculateLateMinutes(480, 495, 10), 15);
});

test("undertime has no grace", () => {
  assert.equal(calculateUndertimeMinutes(1020, 1015), 5);
  assert.equal(calculateUndertimeMinutes(1020, 1025), 0);
});

test("scheduled worked minutes deduct break and floor at zero", () => {
  assert.equal(calculateWorkedMinutes(470, 1040, 60), 510);
  assert.equal(calculateWorkedMinutes(480, 500, 60), 0);
});

test("unscheduled attendance does not deduct a break", () => {
  assert.equal(calculateWorkedMinutes(480, 965, 0), 485);
});
```

Also test:

```text
present
provisional present
missing clock-out
absent
rest day worked
unscheduled attendance
late + undertime flags together
corrected + recalculated flags together
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- src/features/attendance/calculations/rules.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement pure rules**

Core APIs:

```ts
export function completedMinutesBetween(
  startIso: string,
  endIso: string,
): number {
  const milliseconds =
    new Date(endIso).getTime() - new Date(startIso).getTime();

  return Math.max(0, Math.floor(milliseconds / 60_000));
}

export function calculateLateMinutes(
  scheduledStartMinute: number,
  actualClockInMinute: number,
  graceMinutes: number,
): number {
  const difference = actualClockInMinute - scheduledStartMinute;
  return difference <= graceMinutes ? 0 : Math.max(0, difference);
}

export function calculateUndertimeMinutes(
  scheduledEndMinute: number,
  actualClockOutMinute: number,
): number {
  return Math.max(0, scheduledEndMinute - actualClockOutMinute);
}

export function calculateWorkedMinutes(
  actualClockInMinute: number,
  actualClockOutMinute: number,
  breakMinutes: number,
): number {
  return Math.max(
    0,
    actualClockOutMinute - actualClockInMinute - breakMinutes,
  );
}
```

`classifyAttendanceCalculation` must consume explicit source facts rather than query the database:

```ts
export function classifyAttendanceCalculation(input: {
  hasSchedule: boolean;
  isScheduledWorkday: boolean;
  attendanceExists: boolean;
  hasClockIn: boolean;
  hasClockOut: boolean;
  dateHasEnded: boolean;
}): AttendanceCalculationBaseStatus | null;
```

Rules:

```text
No schedule + attendance = unscheduled_attendance
Schedule + rest day + attendance = rest_day_worked
Schedule + workday + completed attendance = present
Schedule + workday + open attendance + ended date = missing_clock_out
Schedule + workday + no attendance + ended date = absent
Current open workday = present provisional
No schedule + no attendance = null
Rest day + no attendance = null
```

- [ ] **Step 4: Add Manila timestamp helpers**

In `src/features/attendance/time.ts`, add:

```ts
export function companyDateTimeToUtc(
  date: string,
  time: string,
): string;
```

It must construct the correct UTC timestamp for a Manila local date/time without relying on the machine timezone.

Add tests around UTC midnight and the fixed `+08:00` offset.

- [ ] **Step 5: Run tests**

```bash
npm test -- \
  src/features/attendance/calculations/rules.test.ts \
  src/features/attendance/time.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/attendance/calculations \
  src/features/attendance/time.ts \
  src/features/attendance/time.test.ts
git commit -m "feat: add attendance calculation rules"
```

---

### Task 3: Add policy validation and protected policy queries

**Files:**
- Create: `src/features/attendance/policy/types.ts`
- Create: `src/features/attendance/policy/validation.ts`
- Create: `src/features/attendance/policy/validation.test.ts`
- Create: `src/features/attendance/policy/queries.ts`
- Create: `src/features/attendance/policy/queries.test.ts`

**Interfaces:**
- Produces `validateAttendancePolicyVersion`.
- Produces `getAttendancePolicyVersions`.
- Produces `getEffectiveAttendancePolicy`.
- Uses existing `requireAttendanceAdmin`.

- [ ] **Step 1: Write failing validation tests**

Test exact behavior:

```text
effective date required
late grace integer required
minimum 0
maximum 120
past-effective date requires reason
today/future date does not require reason
reason trimmed
reason maximum 1,000 characters
action state never echoes reason
```

Use `companyDateAt()` as the date reference.

- [ ] **Step 2: Verify RED**

```bash
npm test -- src/features/attendance/policy/validation.test.ts
```

- [ ] **Step 3: Implement validation**

Signature:

```ts
export function validateAttendancePolicyVersion(
  formData: FormData,
  companyDate?: string,
): {
  data?: {
    effectiveDate: string;
    lateGraceMinutes: number;
    changeReason: string | null;
  };
  state?: AttendancePolicyActionState;
};
```

Retry values may contain only:

```text
effectiveDate
lateGraceMinutes
```

Never include `changeReason`.

- [ ] **Step 4: Write query source tests**

Assert:

```text
server-only import
newest-first ordering
effective policy uses effective_date <= target date
creator relationship uses explicit foreign-key hint
```

- [ ] **Step 5: Implement queries**

```ts
export async function getAttendancePolicyVersions(): Promise<{
  current: AttendancePolicyVersion | null;
  upcoming: AttendancePolicyVersion[];
  history: AttendancePolicyVersion[];
}>;

export async function getEffectiveAttendancePolicy(
  attendanceDate: string,
): Promise<AttendancePolicyVersion | null>;
```

The UI query returns reasons because it is called only after HR authorization. Calculation functions resolve policy in PostgreSQL.

- [ ] **Step 6: Run focused tests**

```bash
npm test -- \
  src/features/attendance/policy/validation.test.ts \
  src/features/attendance/policy/queries.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add src/features/attendance/policy
git commit -m "feat: add attendance policy validation"
```

---

### Task 4: Implement immutable policy creation and the internal revision writer

**Files:**
- Modify: `supabase/migrations/202607150001_attendance_policy_calculations.sql`
- Modify: `src/features/attendance/calculations/migration.test.ts`

**Interfaces:**
- Produces RPC `create_attendance_policy_version`.
- Produces internal function `write_attendance_calculation_revision`.
- Produces internal policy resolver.
- These functions are consumed by Tasks 5, 10, and 11.

- [ ] **Step 1: Add failing source tests**

Assert:

```text
create_attendance_policy_version exists
past date requires non-empty reason
grace range enforced
duplicate effective date maps to safe error code
write_attendance_calculation_revision locks group
revision number uses max + 1 under lock
active_revision_id update is in the same function
recalculation reason is never passed to write_employee_audit
fixed search paths and revoked grants
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- src/features/attendance/calculations/migration.test.ts
```

- [ ] **Step 3: Implement policy creation RPC**

Required behavior:

```sql
create or replace function public.create_attendance_policy_version(
  p_effective_date date,
  p_late_grace_minutes integer,
  p_change_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
```

Validation:

```text
Authenticated HR Admin or Super Admin
Effective date required
Grace 0..120
Past date requires trimmed reason
Reason <= 1,000
Duplicate date raises POLICY_EFFECTIVE_DATE_EXISTS
```

Audit:

```text
action: attendance_policy.created
entity_type: attendance_policy
employee_id: null
safe values: effective_date, late_grace_minutes, policy_version_id
```

Never include `p_change_reason`.

- [ ] **Step 4: Implement internal effective-policy resolver**

```sql
public.resolve_attendance_policy(p_attendance_date date)
```

Return newest row on/before date. If none exists, return a synthetic record contract with:

```text
policy_version_id null
late_grace_minutes 0
```

The calculation revision stores `policy_version_id = null` for the implicit default.

- [ ] **Step 5: Implement internal revision writer**

Signature:

```sql
public.write_attendance_calculation_revision(
  p_employee_id uuid,
  p_attendance_date date,
  p_attendance_record_id uuid,
  p_schedule_assignment_id uuid,
  p_schedule_version_id uuid,
  p_policy_version_id uuid,
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
```

Algorithm:

1. Insert-or-select calculation group.
2. Lock group `FOR UPDATE`.
3. Calculate `revision_number = max(existing) + 1`.
4. Insert immutable revision.
5. Update group `active_revision_id` and `updated_at`.
6. Write safe audit event.
7. Return revision ID.

Audit action mapping:

```text
manual_recalculation -> attendance_calculation.recalculated
daily_finalization/manual_finalization -> attendance_calculation.finalized
all other sources -> attendance_calculation.created
```

Audit JSON contains only safe numeric/status/source fields.

- [ ] **Step 6: Restrict execution**

```sql
revoke all on function public.write_attendance_calculation_revision(...) 
from public, anon, authenticated;

revoke all on function public.resolve_attendance_policy(date)
from public, anon, authenticated;

revoke all on function public.create_attendance_policy_version(...)
from public, anon;

grant execute on function public.create_attendance_policy_version(...)
to authenticated;
```

- [ ] **Step 7: Run migration tests and commit**

```bash
npm test -- src/features/attendance/calculations/migration.test.ts
git add supabase/migrations/202607150001_attendance_policy_calculations.sql \
  src/features/attendance/calculations/migration.test.ts
git commit -m "feat: add policy and revision transactions"
```

---

### Task 5: Implement single-day calculation in PostgreSQL

**Files:**
- Modify: `supabase/migrations/202607150001_attendance_policy_calculations.sql`
- Modify: `src/features/attendance/calculations/migration.test.ts`

**Interfaces:**
- Produces public protected RPC `calculate_attendance_day`.
- Produces internal function `calculate_attendance_day_internal`.
- Consumes Task 4 revision writer.
- Used by event integration, manual recalculation, and finalization.

- [ ] **Step 1: Add failing source tests**

Assert the migration:

```text
resolves attendance record
resolves non-superseded assignment covering date
resolves newest schedule version effective on date
resolves policy effective on date
uses extract(epoch)/60 and floor
applies late grace threshold
deducts break only when schedule applies
does not create absence for current/future date
writes missing_clock_out with null worked/undertime
uses source-specific corrected/recalculated flags
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- src/features/attendance/calculations/migration.test.ts
```

- [ ] **Step 3: Implement internal calculator**

Signature:

```sql
public.calculate_attendance_day_internal(
  p_employee_id uuid,
  p_attendance_date date,
  p_source text,
  p_actor_profile_id uuid,
  p_recalculation_reason text default null,
  p_force_final boolean default false
)
returns uuid
```

Resolution order:

1. Employee exists.
2. Attendance row for employee/date.
3. Non-superseded assignment covering date.
4. Latest schedule version effective on date.
5. Policy effective on date.
6. Manila weekday.
7. Current Manila date.

Construct scheduled UTC timestamps with:

```sql
(p_attendance_date + v_start_time) at time zone 'Asia/Manila'
```

Status matrix:

```text
No assignment + no attendance -> return null
No assignment + attendance -> unscheduled_attendance
Assignment + no effective version -> raise SCHEDULE_VERSION_NOT_FOUND
Rest day + no attendance -> return null
Rest day + attendance -> rest_day_worked
Workday + no attendance + ended/forced -> absent
Workday + no attendance + current date -> return null
Workday + open attendance + current date and not forced -> present provisional
Workday + open attendance + ended/forced -> missing_clock_out finalized
Workday + completed attendance -> present finalized
```

Minute formulas:

```sql
floor(extract(epoch from (later - earlier)) / 60)
```

Late:

```sql
if clock_in <= scheduled_start + grace interval then 0
else full completed minutes from scheduled start
```

Worked:

```text
scheduled/rest day with schedule: elapsed - break, floored at 0
unscheduled: elapsed, floored at 0
```

- [ ] **Step 4: Implement protected wrapper**

```sql
public.calculate_attendance_day(
  p_employee_id uuid,
  p_attendance_date date,
  p_source text
)
returns uuid
```

Authorization:

- HR Admin/Super Admin may calculate any employee/date.
- Employee may calculate only their own employee record.
- Employee source is limited to `clock_in` or `clock_out`.
- Future dates rejected.
- Direct manual-recalculation source rejected from this wrapper.

- [ ] **Step 5: Restrict grants**

Grant wrapper only to `authenticated`; internal function remains unexecutable.

- [ ] **Step 6: Run migration tests and commit**

```bash
npm test -- src/features/attendance/calculations/migration.test.ts
git add supabase/migrations/202607150001_attendance_policy_calculations.sql \
  src/features/attendance/calculations/migration.test.ts
git commit -m "feat: calculate daily attendance revisions"
```

---

### Task 6: Integrate calculation into attendance mutation transactions

**Files:**
- Modify: `supabase/migrations/202607150001_attendance_policy_calculations.sql`
- Modify: `src/features/attendance/actions.test.ts`
- Modify: `src/app/(dashboard)/attendance/actions.ts`

**Interfaces:**
- Existing attendance RPC names remain unchanged.
- Each successful attendance mutation creates its calculation revision atomically.
- Server Actions continue calling one RPC per business action.

- [ ] **Step 1: Add failing regression tests**

Source tests must assert that the migration replaces:

```text
clock_in_attendance
clock_out_attendance
hr_create_attendance
hr_correct_attendance
review_attendance_correction_request
```

and each invokes the internal calculator with the exact source:

```text
clock_in
clock_out
hr_create
hr_correction
correction_approval
```

Also assert application actions do not call a second calculation RPC.

- [ ] **Step 2: Verify RED**

```bash
npm test -- src/features/attendance/actions.test.ts
```

- [ ] **Step 3: Replace existing attendance RPC definitions**

Copy the current Phase 5A function bodies exactly, then add the internal calculation call after the attendance insert/update and before return.

Examples:

```sql
perform public.calculate_attendance_day_internal(
  v_employee_id,
  v_company_date,
  'clock_in',
  auth.uid(),
  null,
  false
);
```

HR create/correct and approved correction use the affected record’s attendance date.

A calculation failure must roll back the attendance mutation.

- [ ] **Step 4: Extend cache revalidation**

Update `revalidateAttendance()`:

```ts
revalidatePath("/attendance");
revalidatePath("/dashboard");
revalidatePath("/admin/attendance");
revalidatePath("/admin/attendance/finalization");
```

HR record-specific actions also revalidate:

```ts
revalidatePath(
  `/admin/attendance/${employeeId}/${attendanceDate}/calculation`,
);
```

- [ ] **Step 5: Run focused and full attendance tests**

```bash
npm test -- \
  src/features/attendance/actions.test.ts \
  src/features/attendance/security.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/202607150001_attendance_policy_calculations.sql \
  src/features/attendance/actions.test.ts \
  'src/app/(dashboard)/attendance/actions.ts'
git commit -m "feat: calculate attendance after mutations"
```

---

### Task 7: Add policy actions and management pages

**Files:**
- Create:
  - `src/app/(dashboard)/settings/attendance-policy/actions.ts`
  - `src/app/(dashboard)/settings/attendance-policy/page.tsx`
  - `src/app/(dashboard)/settings/attendance-policy/new/page.tsx`
  - `src/components/attendance/attendance-policy-form.tsx`
- Modify: `src/app/(dashboard)/settings/page.tsx`
- Create: `src/features/attendance/policy/actions.test.ts`

**Interfaces:**
- Produces `createAttendancePolicyVersion`.
- Uses policy validation and protected RPC.
- Routes are HR-only.

- [ ] **Step 1: Write action/UI source tests**

Assert:

```text
requireAttendanceAdmin before query/action
RPC create_attendance_policy_version
reason never enters action retry state
past-date warning text
no edit/delete controls
max grace 120
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- src/features/attendance/policy/actions.test.ts
```

- [ ] **Step 3: Implement Server Action**

```ts
export async function createAttendancePolicyVersion(
  _state: AttendancePolicyActionState,
  formData: FormData,
): Promise<AttendancePolicyActionState>;
```

Map safe errors:

```text
POLICY_EFFECTIVE_DATE_EXISTS
POLICY_REASON_REQUIRED
POLICY_GRACE_OUT_OF_RANGE
```

Revalidate:

```text
/settings/attendance-policy
/admin/attendance
/attendance
/dashboard
```

Redirect to:

```text
/settings/attendance-policy?success=created
```

- [ ] **Step 4: Implement policy list**

Sections:

```text
Current policy
Upcoming versions
Policy history
```

When no row exists, show:

```text
Implicit default policy
0-minute late grace
```

Only HR sees `change_reason`.

- [ ] **Step 5: Implement form**

Fields:

```text
effective_date
late_grace_minutes
change_reason
```

The reason field is never echoed after failure. Display the backdated warning near the date field.

- [ ] **Step 6: Add settings entry**

Add **Attendance Policy** beside Work Schedules for HR/Super Admin.

- [ ] **Step 7: Run focused tests and build**

```bash
npm test -- src/features/attendance/policy/actions.test.ts
npm run build
```

- [ ] **Step 8: Commit**

```bash
git add \
  'src/app/(dashboard)/settings/attendance-policy' \
  src/components/attendance/attendance-policy-form.tsx \
  src/features/attendance/policy/actions.test.ts \
  'src/app/(dashboard)/settings/page.tsx'
git commit -m "feat: add attendance policy management"
```

---

### Task 8: Add safe active-result and HR revision queries

**Files:**
- Create:
  - `src/features/attendance/calculations/queries.ts`
  - `src/features/attendance/calculations/queries.test.ts`
- Modify:
  - `supabase/migrations/202607150001_attendance_policy_calculations.sql`
  - `src/features/attendance/queries.ts`
  - `src/features/attendance/types.ts`

**Interfaces:**
- Produces safe RPC `get_my_attendance_calculations`.
- Produces:
  - `getOwnActiveCalculations`
  - `getActiveCalculationForEmployeeDate`
  - `getCalculationRevisionHistory`
  - `getFinalizationRuns`
- Existing attendance queries attach active calculations.

- [ ] **Step 1: Write failing source tests**

Assert:

```text
safe employee RPC returns active revision only
safe RPC verifies employee ownership
safe RPC omits recalculation_reason and calculated_by
HR queries use explicit actor FK
active revision relation is used
previous revisions sorted newest first
```

- [ ] **Step 2: Implement safe employee RPC**

Return safe columns only:

```text
employee_id
attendance_date
revision_id
revision_number
base_status
is_provisional
scheduled timestamps/minutes
actual timestamps
worked/late/undertime minutes
flags
calculation source
calculated_at
schedule code/name
```

No reason fields or old revisions.

- [ ] **Step 3: Implement server-only queries**

```ts
export async function getOwnActiveCalculations(params: {
  employeeId: string;
  fromDate?: string;
  toDate?: string;
}): Promise<Map<string, ActiveAttendanceCalculation>>;

export async function getActiveCalculationForEmployeeDate(
  employeeId: string,
  attendanceDate: string,
): Promise<HrAttendanceCalculationRevision | null>;

export async function getCalculationRevisionHistory(
  employeeId: string,
  attendanceDate: string,
): Promise<HrAttendanceCalculationRevision[]>;

export async function getFinalizationRuns(
  page?: number,
): Promise<{
  runs: FinalizationRun[];
  total: number;
  page: number;
  totalPages: number;
}>;
```

Authorization occurs before calling HR queries.

- [ ] **Step 4: Attach calculations to attendance records**

Extend `AttendanceRecord`:

```ts
calculation?: ActiveAttendanceCalculation | null;
```

`getOwnAttendanceHistory`, `getAdminAttendance`, and employee-detail queries should fetch date-page records first, then fetch calculations for the returned date range/employee IDs without one query per row.

- [ ] **Step 5: Run tests**

```bash
npm test -- \
  src/features/attendance/calculations/queries.test.ts \
  src/features/attendance/queries.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add \
  supabase/migrations/202607150001_attendance_policy_calculations.sql \
  src/features/attendance/calculations/queries.ts \
  src/features/attendance/calculations/queries.test.ts \
  src/features/attendance/queries.ts \
  src/features/attendance/types.ts
git commit -m "feat: query active attendance calculations"
```

---

### Task 9: Add calculation presentation and employee UI

**Files:**
- Create:
  - `src/features/attendance/calculations/presentation.ts`
  - `src/features/attendance/calculations/presentation.test.ts`
  - `src/components/attendance/calculation-status.tsx`
  - `src/components/attendance/attendance-calculation-card.tsx`
- Modify:
  - `src/components/attendance/attendance-history.tsx`
  - `src/components/attendance/attendance-clock-card.tsx`
  - `src/components/attendance/dashboard-attendance-summary.tsx`
  - `src/app/(dashboard)/attendance/page.tsx`
  - `src/app/(dashboard)/dashboard/page.tsx`
  - `src/app/globals.css`

**Interfaces:**
- Produces safe labels and duration formatting.
- Employee sees only active calculation.

- [ ] **Step 1: Write presentation tests**

Test:

```text
base status labels
provisional/finalized labels
multiple flags render independently
null minute values render unavailable
510 -> 8h 30m
15 -> 15m
0 -> 0m
```

- [ ] **Step 2: Implement presentation helpers**

```ts
export function formatAttendanceMinutes(
  minutes: number | null,
): string;

export function attendanceBaseStatusLabel(
  status: AttendanceCalculationBaseStatus,
): string;

export function attendanceCalculationFlags(
  revision: AttendanceCalculationRevision,
): string[];
```

- [ ] **Step 3: Implement reusable status component**

Display:

```text
Base status badge
Late flag
Undertime flag
Corrected flag
Recalculated flag
Provisional/Finalized badge
```

Never rely on color alone.

- [ ] **Step 4: Extend employee history**

Add desktop columns and mobile card fields:

```text
Schedule
Worked
Late
Undertime
Status
Calculation state
```

A missing calculation displays:

```text
Calculation unavailable
```

- [ ] **Step 5: Extend clock card/dashboard**

Today card examples must match the approved design.

Do not calculate values in React; render the active server result.

- [ ] **Step 6: Add responsive CSS**

Add focused classes for:

```text
calculation metrics grid
calculation flags
revision state badges
mobile attendance calculation cards
```

- [ ] **Step 7: Run tests and build**

```bash
npm test -- \
  src/features/attendance/calculations/presentation.test.ts \
  src/features/attendance/ui.test.ts \
  src/features/attendance/dashboard-ui.test.ts
npm run build
```

- [ ] **Step 8: Commit**

```bash
git add \
  src/features/attendance/calculations/presentation.ts \
  src/features/attendance/calculations/presentation.test.ts \
  src/components/attendance \
  'src/app/(dashboard)/attendance/page.tsx' \
  'src/app/(dashboard)/dashboard/page.tsx' \
  src/app/globals.css
git commit -m "feat: show employee attendance calculations"
```

---

### Task 10: Add HR calculation filters and calculation detail route

**Files:**
- Create:
  - `src/app/(dashboard)/admin/attendance/[employeeId]/[attendanceDate]/calculation/page.tsx`
  - `src/components/attendance/attendance-calculation-details.tsx`
- Modify:
  - `src/app/(dashboard)/admin/attendance/page.tsx`
  - `src/app/(dashboard)/admin/attendance/[employeeId]/page.tsx`
  - `src/components/attendance/admin-attendance-table.tsx`
  - `src/features/attendance/queries.ts`
  - `src/features/attendance/admin-ui.test.ts`

**Interfaces:**
- HR sees active result plus complete revision history.
- Admin filters consume active revision fields only.

- [ ] **Step 1: Add failing UI/query tests**

Assert:

```text
HR authorization occurs before calculation data reads
detail page loads active result and history
history exposes reason only to HR
admin filters include base status, late, undertime, provisional, corrected, recalculated
detail links use employeeId and attendanceDate
```

- [ ] **Step 2: Extend admin query filters**

Add optional params:

```ts
calculationBaseStatus?: string;
isLate?: boolean;
isUndertime?: boolean;
isProvisional?: boolean;
isCorrectedCalculation?: boolean;
isRecalculated?: boolean;
```

Because Supabase nested filtering may not paginate correctly across a projection, query active groups/revisions first for matching employee/date keys, then constrain attendance rows. Preserve stable ordering and 20/page behavior.

- [ ] **Step 3: Implement detail page**

Route:

```text
/admin/attendance/[employeeId]/[attendanceDate]/calculation
```

Display:

```text
Active result
Source attendance
Schedule assignment/version IDs
Policy version ID
Calculated source/actor/time
Revision history newest first
Protected recalculation reason
```

No mutation controls on revisions.

- [ ] **Step 4: Update admin tables and employee detail**

Add calculation columns and a **View calculation** action.

- [ ] **Step 5: Run tests/build and commit**

```bash
npm test -- src/features/attendance/admin-ui.test.ts
npm run build
git add \
  'src/app/(dashboard)/admin/attendance' \
  src/components/attendance/admin-attendance-table.tsx \
  src/components/attendance/attendance-calculation-details.tsx \
  src/features/attendance/queries.ts \
  src/features/attendance/admin-ui.test.ts
git commit -m "feat: add HR calculation details"
```

---

### Task 11: Add manual recalculation transaction and UI

**Files:**
- Modify:
  - `supabase/migrations/202607150001_attendance_policy_calculations.sql`
  - `src/features/attendance/calculations/migration.test.ts`
- Create:
  - `src/app/(dashboard)/admin/attendance/recalculate/actions.ts`
  - `src/app/(dashboard)/admin/attendance/recalculate/page.tsx`
  - `src/components/attendance/recalculate-attendance-form.tsx`
  - `src/features/attendance/calculations/recalculation.test.ts`
- Modify: `src/features/attendance/validation.ts`

**Interfaces:**
- Produces RPC `recalculate_attendance_range`.
- Initial UI supports one employee or all active employees.
- RPC accepts nullable employee-ID array.

- [ ] **Step 1: Write failing migration/action tests**

Assert:

```text
HR-only authorization
future date rejection
start <= end
reason required and <= 1000
employee array accepted
all-active resolution supported
internal calculator called with manual_recalculation
previous revisions not updated
private reason excluded from audit
```

- [ ] **Step 2: Implement validation**

Signature:

```ts
export function validateAttendanceRecalculation(
  formData: FormData,
): {
  data?: {
    scope: "one_employee" | "all_active";
    employeeIds: string[] | null;
    startDate: string;
    endDate: string;
    reason: string;
  };
  state?: RecalculationActionState;
};
```

Do not echo reason.

- [ ] **Step 3: Implement RPC**

```sql
public.recalculate_attendance_range(
  p_employee_ids uuid[],
  p_start_date date,
  p_end_date date,
  p_reason text
)
returns jsonb
```

Rules:

- HR only.
- Dates cannot be future.
- Reason required.
- Resolve active employees when array is null.
- Validate every supplied employee before processing.
- Iterate stable employee/date order.
- Call internal calculator with:
  - source `manual_recalculation`
  - `is_recalculated = true`
  - `force_final = date < current Manila date`
- Return counts:
  - employees
  - dates evaluated
  - revisions created
  - skipped dates
  - errors
- A group may never have a revision inserted without active pointer update.

- [ ] **Step 4: Implement action/page/form**

Action maps safe error codes and revalidates attendance/calculation/finalization pages.

Confirmation must explicitly say old revisions remain.

- [ ] **Step 5: Run focused tests/build**

```bash
npm test -- \
  src/features/attendance/calculations/recalculation.test.ts \
  src/features/attendance/calculations/migration.test.ts
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add \
  supabase/migrations/202607150001_attendance_policy_calculations.sql \
  src/features/attendance/calculations \
  src/features/attendance/validation.ts \
  'src/app/(dashboard)/admin/attendance/recalculate' \
  src/components/attendance/recalculate-attendance-form.tsx
git commit -m "feat: add attendance recalculation"
```

---

### Task 12: Add daily finalization transaction, cron, and monitoring UI

**Files:**
- Modify:
  - `supabase/migrations/202607150001_attendance_policy_calculations.sql`
  - `src/features/attendance/calculations/migration.test.ts`
- Create:
  - `src/app/(dashboard)/admin/attendance/finalization/actions.ts`
  - `src/app/(dashboard)/admin/attendance/finalization/page.tsx`
  - `src/components/attendance/finalization-run-list.tsx`
  - `src/features/attendance/calculations/finalization.test.ts`

**Interfaces:**
- Produces `finalize_attendance_date`.
- Scheduled and manual invocation share one function.
- Produces finalization run metrics.

- [ ] **Step 1: Write failing tests**

Assert:

```text
scheduled target uses previous Manila date
future/current target rejected
manual requires HR and reason
scheduled job permits database-owner invocation only
one running run per date
absence only for scheduled workdays
rest days and unassigned employees skipped
open attendance becomes finalized missing_clock_out
equivalent active revision skipped
run metrics updated
private manual reason excluded from audit
```

- [ ] **Step 2: Implement finalization RPC**

```sql
public.finalize_attendance_date(
  p_target_date date,
  p_run_source text,
  p_manual_reason text default null
)
returns uuid
```

Authorization:

```text
manual -> authenticated HR Admin/Super Admin
scheduled_job -> auth.uid() is null; invoked by database cron owner
```

Algorithm:

1. Validate target date `< current Manila date`.
2. Insert `running` run row.
3. Resolve active employees deterministically.
4. For each employee:
   - resolve assignment/version
   - skip unassigned
   - skip rest day without attendance
   - call internal calculator with forced finalization
   - compare candidate/source state to current active result and skip equivalent
5. Update counters.
6. Mark completed or completed_with_errors.
7. On outer failure mark failed and write safe audit event.

Audit:

```text
attendance_finalization.started
attendance_finalization.completed
attendance_finalization.failed
```

No internal exception text in audit metadata.

- [ ] **Step 3: Finalize cron block**

Place the Task 1 cron block after the function definition.

- [ ] **Step 4: Implement manual action and monitoring page**

Manual form inputs:

```text
target_date
manual_reason
```

The page lists runs newest first with all approved counters.

- [ ] **Step 5: Run tests/build**

```bash
npm test -- \
  src/features/attendance/calculations/finalization.test.ts \
  src/features/attendance/calculations/migration.test.ts
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add \
  supabase/migrations/202607150001_attendance_policy_calculations.sql \
  src/features/attendance/calculations \
  'src/app/(dashboard)/admin/attendance/finalization' \
  src/components/attendance/finalization-run-list.tsx
git commit -m "feat: add daily attendance finalization"
```

---

### Task 13: Add audit presentation, navigation, security regressions, and revalidation

**Files:**
- Modify:
  - `src/features/employees/audit/presentation.ts`
  - `src/features/employees/audit/presentation.test.ts`
  - `src/components/sidebar.tsx`
  - `src/app/(dashboard)/settings/page.tsx`
  - `src/app/(dashboard)/admin/attendance/page.tsx`
  - `src/app/globals.css`
- Create:
  - `src/features/attendance/calculations/security.test.ts`

**Interfaces:**
- Activity timeline explains calculation/policy/finalization events safely.
- HR navigation exposes policy, recalculation, finalization.
- Employee navigation remains unchanged except enhanced attendance content.

- [ ] **Step 1: Add audit presentation tests**

Expected labels:

```text
Attendance policy created
Attendance calculation created
Attendance recalculated
Attendance finalized
Attendance finalization started
Attendance finalization completed
Attendance finalization failed
```

Details may include safe dates/status/minutes only.

- [ ] **Step 2: Implement audit descriptions**

Never read reason fields from metadata.

- [ ] **Step 3: Add navigation**

HR/Super Admin:

```text
Attendance
Correction Requests
Recalculate Attendance
Finalization Runs
Attendance Policy
```

Keep Settings → Work Schedules.

- [ ] **Step 4: Add security source tests**

Verify:

```text
no direct revision mutation policies
safe employee projection omits protected fields
reason variables never passed into audit JSON
all security-definer functions use fixed search path
internal functions revoked from authenticated
scheduled function does not permit arbitrary unauthenticated manual calls
no permanent delete actions
```

- [ ] **Step 5: Run tests/build**

```bash
npm test -- \
  src/features/employees/audit/presentation.test.ts \
  src/features/attendance/calculations/security.test.ts
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add \
  src/features/employees/audit \
  src/features/attendance/calculations/security.test.ts \
  src/components/sidebar.tsx \
  'src/app/(dashboard)/settings/page.tsx' \
  'src/app/(dashboard)/admin/attendance/page.tsx' \
  src/app/globals.css
git commit -m "feat: integrate calculation audit and navigation"
```

---

### Task 14: Documentation, migration QA, and final verification

**Files:**
- Modify: `README.md`
- Add:
  - `docs/superpowers/specs/2026-07-15-phase-5b2a-attendance-policy-calculations-design.md`
  - `docs/superpowers/plans/2026-07-15-phase-5b2a-attendance-policy-calculations.md`

**Interfaces:**
- Documents deployment order, cron verification, role QA, calculation QA, and rollback-safe checks.

- [ ] **Step 1: Document migration order**

README must state:

```text
1. Apply 202607140003_attendance_mvp.sql
2. Apply 202607140004_work_schedules.sql
3. Apply 202607150001_attendance_policy_calculations.sql
4. Reload PostgREST schema
5. Deploy application code
```

- [ ] **Step 2: Document cron verification**

SQL:

```sql
select jobid, jobname, schedule, command, active
from cron.job
where jobname = 'finalize-attendance-daily';
```

Expected one active job.

- [ ] **Step 3: Document schema/RLS verification**

SQL must inspect:

```text
attendance_policy_versions
attendance_calculation_groups
attendance_calculation_revisions
attendance_finalization_runs
```

and confirm RLS enabled.

- [ ] **Step 4: Document manual calculation QA**

Use a disposable employee and test:

```text
Within grace -> 0 late
After grace -> full late minutes
Early departure -> exact undertime
Break deduction
Early arrival included
Late departure included
Rest day worked
Unscheduled attendance
Missing clock-out
Absence after finalization
Manual recalculation creates revision 2
```

- [ ] **Step 5: Document privacy QA**

Run:

```sql
select
  action,
  changed_fields,
  before_values,
  after_values,
  metadata
from public.employee_audit_logs
where entity_type in (
  'attendance_policy',
  'attendance_calculation',
  'attendance_finalization'
)
order by created_at desc;
```

Confirm no policy reason, recalculation reason, finalization reason, attendance note, or correction reason.

- [ ] **Step 6: Run full automated verification**

```bash
npm test
npx tsc --noEmit
npm run build
```

Expected:

```text
0 failed tests
TypeScript exit code 0
Build exit code 0
```

Required routes:

```text
/settings/attendance-policy
/settings/attendance-policy/new
/admin/attendance/recalculate
/admin/attendance/finalization
/admin/attendance/[employeeId]/[attendanceDate]/calculation
```

- [ ] **Step 7: Run clean archive verification**

Create a clean ZIP excluding:

```text
.git
.next
node_modules
.env.local
.superpowers
.vercel
coverage
*.log
```

Extract it into a new directory, run:

```bash
npm install
npm test
npx tsc --noEmit
npm run build
```

- [ ] **Step 8: Commit**

```bash
git add README.md docs/superpowers
git commit -m "docs: complete attendance calculation phase"
```

---

## Final acceptance checklist

```text
[ ] Immutable effective-dated policies work
[ ] Implicit zero-grace default works before first policy
[ ] Backdated policies require reasons
[ ] Clock-in creates provisional active revision
[ ] Clock-out creates finalized active revision
[ ] Late grace behavior matches the approved threshold rule
[ ] Undertime uses no grace
[ ] Worked minutes use actual timestamps
[ ] Scheduled break is deducted exactly once
[ ] Worked minutes never go below zero
[ ] Rest-day worked is classified separately
[ ] Unscheduled attendance contains no schedule-based values
[ ] Absence is created only after the Manila date ends
[ ] Rest days and unassigned employees do not receive absence
[ ] Missing clock-out contains no worked or undertime minutes
[ ] Manual recalculation preserves old revisions
[ ] Active revision pointer updates atomically
[ ] Employee projection exposes only active safe results
[ ] HR can inspect complete revision history
[ ] Daily pg_cron finalization job exists and is active
[ ] Finalization reruns skip equivalent results
[ ] Private reasons and notes never appear in audit JSON
[ ] Direct revision updates and deletes fail
[ ] No permanent deletion workflow exists
[ ] All automated tests pass
[ ] Standalone TypeScript check passes
[ ] Production build passes
[ ] Clean extracted archive passes the same verification
```
