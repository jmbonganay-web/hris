# Phase 5B-1 Work Schedules and Employee Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reusable versioned work schedules, effective-dated individual and bulk employee assignments, employee schedule visibility, and schedule-aware attendance presentation without recalculating historical attendance.

**Architecture:** Store schedule identity, immutable effective-dated rule versions, and employee assignment ranges in three focused tables. PostgreSQL security-definer functions own all mutations, temporal locking, overlap prevention, archive rules, and audit inserts; Next.js Server Actions validate forms and invoke those RPCs; server-rendered queries resolve the applicable assignment and version for a target company date.

**Tech Stack:** Next.js 16.2.10 App Router, React 19.1.1, TypeScript 5.7, Supabase PostgreSQL/Auth/RLS, PostgreSQL PL/pgSQL, Node built-in test runner, existing `employee_audit_logs`, existing `Asia/Manila` attendance time utilities, and the existing CSS system.

## Global Constraints

- Company timezone remains exactly `Asia/Manila`.
- Schedule templates are reusable identities; schedule rules live in immutable effective-dated versions.
- Weekly schedules use one repeating weekday pattern and the same hours on every selected workday.
- At least one workday is required.
- Start time must be earlier than end time; overnight schedules are rejected.
- Break duration is unpaid, stored in minutes, zero or greater, and shorter than the total shift.
- Schedule versions are insert-only and cannot be updated or deleted.
- Template code, name, and description may change without rewriting versions.
- Template descriptions, version reasons, and assignment reasons are limited to 1,000 characters.
- A past-effective schedule version requires a change reason.
- Employee assignments are effective-dated, may have gaps, and cannot overlap while non-superseded.
- A new assignment ends the preceding assignment one day earlier and supersedes assignments starting on or after the new start date.
- Backdated employee assignments require a reason.
- Individual and bulk assignment operations are atomic and lock employee rows in deterministic order.
- Archived templates remain historically resolvable but cannot receive new assignments.
- Employees may continue clocking in and out without an assigned schedule.
- Phase 5B-1 displays scheduled workday, rest day, unassigned, or unavailable states only.
- Phase 5B-1 does not calculate late, undertime, overtime, absence, holiday, or payroll values.
- Historical attendance rows are never rewritten or recalculated by schedule changes.
- Employee self-service reads use a protected safe-projection RPC that excludes template descriptions, version reasons, assignment reasons, and creator metadata.
- Employees receive no direct base-table schedule access; HR Admin and Super Admin read base schedule tables through RLS.
- HR Admin and Super Admin can read all schedule data and invoke protected schedule RPCs.
- No authenticated role receives direct insert, update, or delete policies for schedule data.
- There is no permanent-delete route, action, RPC, or RLS policy for templates, versions, or assignments.
- Audit JSON may contain safe schedule and date fields but never descriptions, change reasons, or assignment reasons.
- `employee_audit_logs.employee_id` becomes nullable only to support organization-level template/version events; employee assignment events retain the affected employee ID.
- No new runtime dependencies.
- Existing Phase 5A attendance behavior, 145 passing tests, RLS, concurrency controls, and audit privacy must remain intact.

---

## Baseline and migration order

The inspected Phase 5A archive contains:

```text
Next.js 16.2.10
React 19.1.1
TypeScript 5.7
145 tests in the verified Phase 5A delivery
```

Phase 5B-1 adds this migration after Phase 5A:

```text
supabase/migrations/202607140004_work_schedules.sql
```

Apply migrations in numeric order. Deploy the application code only after the new migration succeeds.

---

## File map

### Create

- `supabase/migrations/202607140004_work_schedules.sql`
- `src/features/schedules/types.ts`
- `src/features/schedules/validation.ts`
- `src/features/schedules/validation.test.ts`
- `src/features/schedules/resolution.ts`
- `src/features/schedules/resolution.test.ts`
- `src/features/schedules/auth.ts`
- `src/features/schedules/queries.ts`
- `src/features/schedules/queries.test.ts`
- `src/features/schedules/migration.test.ts`
- `src/features/schedules/actions.test.ts`
- `src/features/schedules/security.test.ts`
- `src/app/(dashboard)/settings/work-schedules/actions.ts`
- `src/app/(dashboard)/settings/work-schedules/page.tsx`
- `src/app/(dashboard)/settings/work-schedules/new/page.tsx`
- `src/app/(dashboard)/settings/work-schedules/[id]/page.tsx`
- `src/app/(dashboard)/settings/work-schedules/[id]/edit/page.tsx`
- `src/app/(dashboard)/settings/work-schedules/[id]/versions/new/page.tsx`
- `src/app/(dashboard)/settings/work-schedules/assign/page.tsx`
- `src/app/(dashboard)/settings/work-schedules/assign/bulk/page.tsx`
- `src/app/(dashboard)/employees/[id]/schedule/page.tsx`
- `src/app/(dashboard)/my-schedule/page.tsx`
- `src/components/schedules/schedule-template-form.tsx`
- `src/components/schedules/schedule-version-form.tsx`
- `src/components/schedules/schedule-summary.tsx`
- `src/components/schedules/schedule-template-list.tsx`
- `src/components/schedules/archive-schedule-button.tsx`
- `src/components/schedules/individual-assignment-form.tsx`
- `src/components/schedules/bulk-assignment-form.tsx`
- `src/components/schedules/assignment-history.tsx`
- `src/components/schedules/my-schedule-card.tsx`

### Modify

- `src/features/employees/audit/types.ts`
- `src/features/employees/audit/presentation.ts`
- `src/features/employees/audit/presentation.test.ts`
- `src/app/(dashboard)/employees/[id]/activity/page.tsx`
- `src/features/attendance/types.ts`
- `src/features/attendance/queries.ts`
- `src/features/attendance/queries.test.ts`
- `src/components/attendance/attendance-clock-card.tsx`
- `src/app/(dashboard)/attendance/page.tsx`
- `src/app/(dashboard)/dashboard/page.tsx`
- `src/components/sidebar.tsx`
- `src/components/employees/profile/profile-tabs.tsx`
- `src/app/globals.css`
- `README.md`
- `docs/superpowers/specs/2026-07-14-phase-5b1-work-schedules-design.md`
- `docs/superpowers/plans/2026-07-14-phase-5b1-work-schedules.md`

---

## Shared interfaces

Create these public contracts in `src/features/schedules/types.ts` during Task 2 and use the same names in later tasks:

```ts
export const scheduleWeekdays = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type ScheduleWeekday = typeof scheduleWeekdays[number];

export type ScheduleActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

export type ScheduleVersionRecord = {
  id: string;
  schedule_template_id: string;
  effective_date: string;
  working_days: ScheduleWeekday[];
  start_time: string;
  end_time: string;
  break_minutes: number;
  change_reason: string | null;
  created_by: string;
  created_at: string;
  creator?: {
    id: string;
    display_name: string | null;
    first_name: string;
    last_name: string;
  } | null;
};

export type ScheduleTemplateRecord = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_archived: boolean;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
  archived_by: string | null;
  archived_at: string | null;
  current_version?: ScheduleVersionRecord | null;
  upcoming_versions?: ScheduleVersionRecord[];
  version_history?: ScheduleVersionRecord[];
  assigned_employee_count?: number;
};

export type ScheduleEmployeeOption = {
  id: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  department_id: string | null;
  department: { id: string; name: string } | null;
};

export type EmployeeScheduleAssignment = {
  id: string;
  employee_id: string;
  schedule_template_id: string;
  effective_start_date: string;
  effective_end_date: string | null;
  assignment_reason: string | null;
  is_superseded: boolean;
  superseded_at: string | null;
  superseded_by_assignment_id: string | null;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
  template?: ScheduleTemplateRecord | null;
  employee?: ScheduleEmployeeOption | null;
  creator?: {
    id: string;
    display_name: string | null;
    first_name: string;
    last_name: string;
  } | null;
};


export type EmployeeScheduleAssignmentSummary = {
  id: string;
  employee_id: string;
  schedule_template_id: string;
  effective_start_date: string;
  effective_end_date: string | null;
  is_superseded: false;
  template: Pick<
    ScheduleTemplateRecord,
    "id" | "code" | "name" | "is_archived"
  >;
};

export type ScheduleResolutionState =
  | "scheduled_workday"
  | "rest_day"
  | "unassigned"
  | "unavailable";

export type ResolvedEmployeeSchedule = {
  companyDate: string;
  state: ScheduleResolutionState;
  assignment: EmployeeScheduleAssignmentSummary | null;
  template: Pick<ScheduleTemplateRecord, "id" | "code" | "name" | "is_archived"> | null;
  version: ScheduleVersionRecord | null;
  weekday: ScheduleWeekday;
  upcomingAssignment: EmployeeScheduleAssignmentSummary | null;
};

export type ScheduleTemplateInput = {
  code: string;
  name: string;
  description: string | null;
};

export type ScheduleVersionInput = {
  effective_date: string;
  working_days: ScheduleWeekday[];
  start_time: string;
  end_time: string;
  break_minutes: number;
  change_reason: string | null;
};

export type ScheduleAssignmentInput = {
  employee_ids: string[];
  schedule_template_id: string;
  effective_start_date: string;
  effective_end_date: string | null;
  assignment_reason: string | null;
};
```

---

### Task 1: Add schedule schema, RLS, immutable versions, and migration source tests

**Files:**
- Create: `supabase/migrations/202607140004_work_schedules.sql`
- Create: `src/features/schedules/migration.test.ts`

**Interfaces:**
- Produces tables `work_schedule_templates`, `work_schedule_versions`, and `employee_schedule_assignments`.
- Makes `employee_audit_logs.employee_id` nullable.
- Produces private SQL helpers `normalize_schedule_code`, `normalize_schedule_private_text`, and `validate_schedule_rules`.
- Base schedule tables are HR-readable only; Task 10 adds the employee safe-projection RPC.
- Does not yet create public mutation RPCs; Tasks 3 and 6 append those functions to the same migration.

- [ ] **Step 1: Write the failing migration source tests**

Create `src/features/schedules/migration.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL(
    "../../../supabase/migrations/202607140004_work_schedules.sql",
    import.meta.url,
  ),
  "utf8",
);

test("migration creates the three schedule tables", () => {
  assert.match(sql, /create table if not exists public\.work_schedule_templates/i);
  assert.match(sql, /create table if not exists public\.work_schedule_versions/i);
  assert.match(sql, /create table if not exists public\.employee_schedule_assignments/i);
});

test("schedule versions are unique by template and effective date", () => {
  assert.match(
    sql,
    /unique \(schedule_template_id, effective_date\)/i,
  );
  assert.match(sql, /prevent_work_schedule_version_mutation/i);
  assert.match(sql, /raise exception[^;]+SCHEDULE_VERSION_IMMUTABLE/is);
});

test("active employee schedule assignment ranges cannot overlap", () => {
  assert.match(sql, /create extension if not exists btree_gist/i);
  assert.match(sql, /exclude using gist/i);
  assert.match(sql, /daterange\(/i);
  assert.match(sql, /where \(not is_superseded\)/i);
});

test("base schedule tables are HR-only and have no direct writes", () => {
  assert.match(sql, /HR views all schedule templates/i);
  assert.match(sql, /HR views all schedule versions/i);
  assert.match(sql, /HR views all employee schedule assignments/i);
  assert.doesNotMatch(sql, /Employees view own schedule assignments/i);
  assert.doesNotMatch(sql, /Employees view referenced schedule templates/i);
  assert.doesNotMatch(sql, /Employees view referenced schedule versions/i);
  assert.doesNotMatch(
    sql,
    /create policy[^;]+on public\.(work_schedule_templates|work_schedule_versions|employee_schedule_assignments)[^;]+for (insert|update|delete)/i,
  );
});

test("organization-level audit entries may have no employee", () => {
  assert.match(
    sql,
    /alter table public\.employee_audit_logs alter column employee_id drop not null/i,
  );
});

test("schedule descriptions and reasons never enter audit builder calls", () => {
  assert.doesNotMatch(
    sql,
    /write_employee_audit\([^;]+(description|change_reason|assignment_reason)/is,
  );
});
```

- [ ] **Step 2: Run the test and verify the missing migration failure**

Run:

```bash
npm test -- src/features/schedules/migration.test.ts
```

Expected: FAIL with `ENOENT` for `202607140004_work_schedules.sql`.

- [ ] **Step 3: Create the migration tables and constraints**

Create `supabase/migrations/202607140004_work_schedules.sql` beginning with:

```sql
begin;

create extension if not exists btree_gist;

alter table public.employee_audit_logs
  alter column employee_id drop not null;

create table if not exists public.work_schedule_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text,
  is_archived boolean not null default false,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  archived_by uuid references public.profiles(id) on delete set null,
  archived_at timestamptz,
  constraint work_schedule_templates_code_unique unique (code),
  constraint work_schedule_templates_name_required
    check (char_length(btrim(name)) between 1 and 100),
  constraint work_schedule_templates_description_length
    check (description is null or char_length(description) <= 1000),
  constraint work_schedule_templates_archive_consistency
    check (
      (is_archived and archived_at is not null)
      or (not is_archived and archived_at is null and archived_by is null)
    )
);

create table if not exists public.work_schedule_versions (
  id uuid primary key default gen_random_uuid(),
  schedule_template_id uuid not null
    references public.work_schedule_templates(id) on delete restrict,
  effective_date date not null,
  working_days text[] not null,
  start_time time not null,
  end_time time not null,
  break_minutes integer not null default 0,
  change_reason text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint work_schedule_versions_template_date_unique
    unique (schedule_template_id, effective_date),
  constraint work_schedule_versions_workdays_required
    check (cardinality(working_days) >= 1),
  constraint work_schedule_versions_workdays_allowed
    check (
      working_days <@ array[
        'monday','tuesday','wednesday','thursday',
        'friday','saturday','sunday'
      ]::text[]
    ),
  constraint work_schedule_versions_same_day_shift
    check (end_time > start_time),
  constraint work_schedule_versions_break_nonnegative
    check (break_minutes >= 0),
  constraint work_schedule_versions_break_shorter_than_shift
    check (
      break_minutes < extract(epoch from (end_time - start_time)) / 60
    ),
  constraint work_schedule_versions_reason_length
    check (change_reason is null or char_length(change_reason) <= 1000)
);

create table if not exists public.employee_schedule_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  schedule_template_id uuid not null
    references public.work_schedule_templates(id) on delete restrict,
  effective_start_date date not null,
  effective_end_date date,
  assignment_reason text,
  is_superseded boolean not null default false,
  superseded_at timestamptz,
  superseded_by_assignment_id uuid
    references public.employee_schedule_assignments(id) on delete set null
    deferrable initially deferred,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint employee_schedule_assignment_date_order
    check (
      effective_end_date is null
      or effective_end_date >= effective_start_date
    ),
  constraint employee_schedule_assignment_reason_length
    check (assignment_reason is null or char_length(assignment_reason) <= 1000),
  constraint employee_schedule_assignment_superseded_consistency
    check (
      (not is_superseded and superseded_at is null and superseded_by_assignment_id is null)
      or (is_superseded and superseded_at is not null and superseded_by_assignment_id is not null)
    ),
  constraint employee_schedule_assignment_no_active_overlap
    exclude using gist (
      employee_id with =,
      daterange(
        effective_start_date,
        coalesce(effective_end_date, 'infinity'::date),
        '[]'
      ) with &&
    ) where (not is_superseded)
);

create index if not exists work_schedule_templates_status_name_idx
  on public.work_schedule_templates(is_archived, name, id);
create index if not exists work_schedule_versions_template_effective_idx
  on public.work_schedule_versions(schedule_template_id, effective_date desc, id desc);
create index if not exists employee_schedule_assignments_employee_start_idx
  on public.employee_schedule_assignments(employee_id, effective_start_date desc, id desc);
create index if not exists employee_schedule_assignments_template_idx
  on public.employee_schedule_assignments(schedule_template_id, effective_start_date, id);
```

- [ ] **Step 4: Add SQL normalization and rule-validation helpers**

Append:

```sql
create or replace function public.normalize_schedule_code(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select trim(both '-' from regexp_replace(
    upper(btrim(coalesce(p_value, ''))),
    '[^A-Z0-9]+',
    '-',
    'g'
  ));
$$;

create or replace function public.normalize_schedule_private_text(
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
    raise exception using errcode = 'P0001', message = 'SCHEDULE_REASON_REQUIRED';
  end if;
  if v_value is not null and char_length(v_value) > 1000 then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_PRIVATE_TEXT_TOO_LONG';
  end if;
  return v_value;
end;
$$;

create or replace function public.validate_schedule_rules(
  p_effective_date date,
  p_working_days text[],
  p_start_time time,
  p_end_time time,
  p_break_minutes integer,
  p_change_reason text default null
)
returns text
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_reason text := public.normalize_schedule_private_text(p_change_reason, false);
  v_shift_minutes integer;
begin
  if p_effective_date is null then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_EFFECTIVE_DATE_REQUIRED';
  end if;
  if p_working_days is null or cardinality(p_working_days) = 0 then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_WORKDAYS_REQUIRED';
  end if;
  if exists (
    select 1
    from unnest(p_working_days) as day_name
    where day_name not in (
      'monday','tuesday','wednesday','thursday',
      'friday','saturday','sunday'
    )
  ) then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_WORKDAY_INVALID';
  end if;
  if (select count(*) from unnest(p_working_days))
    <> (select count(distinct day_name) from unnest(p_working_days) as day_name) then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_WORKDAY_DUPLICATE';
  end if;
  if p_start_time is null or p_end_time is null or p_end_time <= p_start_time then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_TIME_ORDER_INVALID';
  end if;
  if p_break_minutes is null or p_break_minutes < 0 then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_BREAK_INVALID';
  end if;
  v_shift_minutes := extract(epoch from (p_end_time - p_start_time))::integer / 60;
  if p_break_minutes >= v_shift_minutes then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_BREAK_TOO_LONG';
  end if;
  if p_effective_date < public.company_attendance_date(now()) and v_reason is null then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_REASON_REQUIRED';
  end if;
  return v_reason;
end;
$$;

revoke all on function public.normalize_schedule_code(text)
  from public, anon, authenticated;
revoke all on function public.normalize_schedule_private_text(text, boolean)
  from public, anon, authenticated;
revoke all on function public.validate_schedule_rules(date, text[], time, time, integer, text)
  from public, anon, authenticated;
```

- [ ] **Step 5: Add immutable-version protection**

Append:

```sql
create or replace function public.prevent_work_schedule_version_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception using errcode = 'P0001', message = 'SCHEDULE_VERSION_IMMUTABLE';
end;
$$;

revoke all on function public.prevent_work_schedule_version_mutation()
  from public, anon, authenticated;

drop trigger if exists prevent_work_schedule_version_update
  on public.work_schedule_versions;
create trigger prevent_work_schedule_version_update
before update or delete on public.work_schedule_versions
for each row execute function public.prevent_work_schedule_version_mutation();
```

- [ ] **Step 6: Add RLS read policies with no direct writes**

Append:

```sql
alter table public.work_schedule_templates enable row level security;
alter table public.work_schedule_versions enable row level security;
alter table public.employee_schedule_assignments enable row level security;

drop policy if exists "HR views all schedule templates"
  on public.work_schedule_templates;
create policy "HR views all schedule templates"
on public.work_schedule_templates
for select to authenticated
using (public.is_hr_admin());

drop policy if exists "HR views all schedule versions"
  on public.work_schedule_versions;
create policy "HR views all schedule versions"
on public.work_schedule_versions
for select to authenticated
using (public.is_hr_admin());

drop policy if exists "HR views all employee schedule assignments"
  on public.employee_schedule_assignments;
create policy "HR views all employee schedule assignments"
on public.employee_schedule_assignments
for select to authenticated
using (public.is_hr_admin());

-- Employees do not receive direct base-table schedule SELECT policies.
-- Employee self-service uses the protected get_my_schedule RPC added in Task 10.
-- No INSERT, UPDATE, or DELETE policies are created for schedule tables.
```

- [ ] **Step 7: Temporarily close the migration and run the focused test**

Append:

```sql
notify pgrst, 'reload schema';
commit;
```

Run:

```bash
npm test -- src/features/schedules/migration.test.ts
```

Expected: all Task 1 migration tests PASS. Later tasks insert RPC definitions before the final `notify` and `commit` lines.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/202607140004_work_schedules.sql \
  src/features/schedules/migration.test.ts
git commit -m "feat: add work schedule schema"
```

---

### Task 2: Add schedule types, normalization, rule validation, and resolution utilities

**Files:**
- Create: `src/features/schedules/types.ts`
- Create: `src/features/schedules/validation.ts`
- Create: `src/features/schedules/validation.test.ts`
- Create: `src/features/schedules/resolution.ts`
- Create: `src/features/schedules/resolution.test.ts`

**Interfaces:**
- Produces all Shared interfaces.
- Produces `normalizeScheduleCode(value: string): string`.
- Produces `scheduledMinutes(startTime, endTime, breakMinutes): number`.
- Produces `validateScheduleTemplate`, `validateScheduleVersion`, and `validateScheduleAssignment`.
- Produces `weekdayForCompanyDate` and `resolveScheduleState`.

- [ ] **Step 1: Write failing validation and resolution tests**

Create `src/features/schedules/validation.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeScheduleCode,
  scheduledMinutes,
  validateScheduleAssignment,
  validateScheduleTemplate,
  validateScheduleVersion,
} from "./validation.ts";

function templateForm() {
  const form = new FormData();
  form.set("code", " regular day ");
  form.set("name", "Regular Day Shift");
  form.set("description", "Weekday office schedule");
  return form;
}

function versionForm(date = "2026-08-01") {
  const form = new FormData();
  form.set("effective_date", date);
  for (const day of ["monday", "tuesday", "wednesday", "thursday", "friday"]) {
    form.append("working_days", day);
  }
  form.set("start_time", "08:00");
  form.set("end_time", "17:00");
  form.set("break_minutes", "60");
  return form;
}

test("schedule codes normalize to uppercase hyphenated values", () => {
  assert.equal(normalizeScheduleCode(" regular day "), "REGULAR-DAY");
  assert.equal(normalizeScheduleCode("Morning__Shift"), "MORNING-SHIFT");
});

test("scheduled minutes subtract the unpaid break", () => {
  assert.equal(scheduledMinutes("08:00", "17:00", 60), 480);
});

test("template validation normalizes safe retry values", () => {
  const result = validateScheduleTemplate(templateForm());
  assert.deepEqual(result.data, {
    code: "REGULAR-DAY",
    name: "Regular Day Shift",
    description: "Weekday office schedule",
  });
});

test("version validation accepts one weekly pattern and rejects overnight shifts", () => {
  const valid = validateScheduleVersion(versionForm(), "2026-07-14");
  assert.equal(valid.data?.break_minutes, 60);
  assert.equal(valid.data?.working_days.length, 5);

  const invalid = versionForm();
  invalid.set("start_time", "22:00");
  invalid.set("end_time", "06:00");
  const result = validateScheduleVersion(invalid, "2026-07-14");
  assert.equal(result.data, undefined);
  assert.equal(result.state?.fieldErrors?.end_time, "End time must be later than start time.");
});

test("past-effective versions and assignments require private reasons", () => {
  const version = validateScheduleVersion(versionForm("2026-07-01"), "2026-07-14");
  assert.equal(version.state?.fieldErrors?.change_reason, "A reason is required for a backdated version.");

  const assignment = new FormData();
  assignment.set("schedule_template_id", "11111111-1111-4111-8111-111111111111");
  assignment.set("effective_start_date", "2026-07-01");
  assignment.append("employee_ids", "22222222-2222-4222-8222-222222222222");
  const assignmentResult = validateScheduleAssignment(assignment, "2026-07-14");
  assert.equal(
    assignmentResult.state?.fieldErrors?.assignment_reason,
    "A reason is required for a backdated assignment.",
  );
});

test("private reasons are never echoed into action state", () => {
  const sentinel = "DO_NOT_ECHO_SCHEDULE_REASON";
  const form = versionForm("2026-07-01");
  form.set("change_reason", sentinel.repeat(100));
  const result = validateScheduleVersion(form, "2026-07-14");
  assert.doesNotMatch(JSON.stringify(result.state), /DO_NOT_ECHO_SCHEDULE_REASON/);
});
```

Create `src/features/schedules/resolution.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { resolveScheduleState, weekdayForCompanyDate } from "./resolution.ts";

const version = {
  id: "version",
  schedule_template_id: "template",
  effective_date: "2026-01-01",
  working_days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
  start_time: "08:00:00",
  end_time: "17:00:00",
  break_minutes: 60,
  change_reason: null,
  created_by: "profile",
  created_at: "2026-01-01T00:00:00Z",
} as const;

test("weekday resolution uses the company calendar date", () => {
  assert.equal(weekdayForCompanyDate("2026-07-13"), "monday");
  assert.equal(weekdayForCompanyDate("2026-07-19"), "sunday");
});

test("resolution distinguishes workdays, rest days, unassigned, and unavailable", () => {
  assert.equal(resolveScheduleState("2026-07-13", {}, version), "scheduled_workday");
  assert.equal(resolveScheduleState("2026-07-19", {}, version), "rest_day");
  assert.equal(resolveScheduleState("2026-07-13", null, null), "unassigned");
  assert.equal(resolveScheduleState("2026-07-13", {}, null), "unavailable");
});
```

- [ ] **Step 2: Verify both files fail because production modules are missing**

```bash
npm test -- src/features/schedules/validation.test.ts \
  src/features/schedules/resolution.test.ts
```

Expected: FAIL with module-not-found errors.

- [ ] **Step 3: Create the shared types file**

Create `src/features/schedules/types.ts` with the complete Shared interfaces block from this plan.

- [ ] **Step 4: Implement validation**

Create `src/features/schedules/validation.ts`:

```ts
import {
  scheduleWeekdays,
  type ScheduleActionState,
  type ScheduleAssignmentInput,
  type ScheduleTemplateInput,
  type ScheduleVersionInput,
  type ScheduleWeekday,
} from "./types.ts";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function safeValues(values: Record<string, string>) {
  return values;
}

function invalid(
  fieldErrors: Record<string, string>,
  values: Record<string, string> = {},
) {
  return {
    state: {
      error: "Please correct the highlighted fields.",
      fieldErrors,
      values: safeValues(values),
    } satisfies ScheduleActionState,
  };
}

export function normalizeScheduleCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function minutes(value: string) {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function scheduledMinutes(
  startTime: string,
  endTime: string,
  breakMinutes: number,
) {
  const start = minutes(startTime);
  const end = minutes(endTime);
  if (start === null || end === null || end <= start || breakMinutes < 0) return 0;
  return end - start - breakMinutes;
}

export function validateScheduleTemplate(formData: FormData): {
  data?: ScheduleTemplateInput;
  state?: ScheduleActionState;
} {
  const code = normalizeScheduleCode(text(formData, "code"));
  const name = text(formData, "name");
  const description = text(formData, "description") || null;
  const fieldErrors: Record<string, string> = {};

  if (!code) fieldErrors.code = "Schedule code is required.";
  else if (code.length > 30) fieldErrors.code = "Schedule code must be 30 characters or fewer.";
  if (!name) fieldErrors.name = "Schedule name is required.";
  else if (name.length > 100) fieldErrors.name = "Schedule name must be 100 characters or fewer.";
  if (description && description.length > 1000) {
    fieldErrors.description = "Description must be 1,000 characters or fewer.";
  }

  if (Object.keys(fieldErrors).length) {
    return invalid(fieldErrors, { code, name });
  }
  return { data: { code, name, description } };
}

export function validateScheduleVersion(
  formData: FormData,
  companyDate: string,
): { data?: ScheduleVersionInput; state?: ScheduleActionState } {
  const effectiveDate = text(formData, "effective_date");
  const workingDays = formData
    .getAll("working_days")
    .map(String)
    .filter((day): day is ScheduleWeekday =>
      scheduleWeekdays.includes(day as ScheduleWeekday),
    );
  const uniqueDays = [...new Set(workingDays)];
  const startTime = text(formData, "start_time");
  const endTime = text(formData, "end_time");
  const breakText = text(formData, "break_minutes");
  const breakMinutes = Number(breakText);
  const changeReason = text(formData, "change_reason") || null;
  const fieldErrors: Record<string, string> = {};
  const start = minutes(startTime);
  const end = minutes(endTime);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
    fieldErrors.effective_date = "Effective date is required.";
  }
  if (uniqueDays.length === 0) {
    fieldErrors.working_days = "Select at least one working day.";
  }
  if (!startTime || start === null) fieldErrors.start_time = "Start time is required.";
  if (!endTime || end === null) fieldErrors.end_time = "End time is required.";
  else if (start !== null && end <= start) {
    fieldErrors.end_time = "End time must be later than start time.";
  }
  if (!Number.isInteger(breakMinutes) || breakMinutes < 0) {
    fieldErrors.break_minutes = "Break duration must be zero or greater.";
  } else if (start !== null && end !== null && end > start && breakMinutes >= end - start) {
    fieldErrors.break_minutes = "Break duration must be shorter than the shift.";
  }
  if (effectiveDate && effectiveDate < companyDate && !changeReason) {
    fieldErrors.change_reason = "A reason is required for a backdated version.";
  }
  if (changeReason && changeReason.length > 1000) {
    fieldErrors.change_reason = "Reason must be 1,000 characters or fewer.";
  }

  if (Object.keys(fieldErrors).length) {
    return invalid(fieldErrors, {
      effective_date: effectiveDate,
      start_time: startTime,
      end_time: endTime,
      break_minutes: breakText,
    });
  }

  return {
    data: {
      effective_date: effectiveDate,
      working_days: uniqueDays,
      start_time: startTime,
      end_time: endTime,
      break_minutes: breakMinutes,
      change_reason: changeReason,
    },
  };
}

export function validateScheduleAssignment(
  formData: FormData,
  companyDate: string,
): { data?: ScheduleAssignmentInput; state?: ScheduleActionState } {
  const scheduleTemplateId = text(formData, "schedule_template_id");
  const employeeIds = [...new Set(formData.getAll("employee_ids").map(String).filter(Boolean))];
  const rawEmployeeIds = formData.getAll("employee_ids").map(String).filter(Boolean);
  const startDate = text(formData, "effective_start_date");
  const endDate = text(formData, "effective_end_date") || null;
  const assignmentReason = text(formData, "assignment_reason") || null;
  const fieldErrors: Record<string, string> = {};

  if (!uuidPattern.test(scheduleTemplateId)) {
    fieldErrors.schedule_template_id = "Select a valid schedule.";
  }
  if (employeeIds.length === 0 || employeeIds.some((id) => !uuidPattern.test(id))) {
    fieldErrors.employee_ids = "Select at least one valid employee.";
  } else if (employeeIds.length !== rawEmployeeIds.length) {
    fieldErrors.employee_ids = "Each employee may be selected only once.";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    fieldErrors.effective_start_date = "Effective start date is required.";
  }
  if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    fieldErrors.effective_end_date = "Select a valid end date.";
  } else if (endDate && startDate && endDate < startDate) {
    fieldErrors.effective_end_date = "End date must be on or after the start date.";
  }
  if (startDate && startDate < companyDate && !assignmentReason) {
    fieldErrors.assignment_reason = "A reason is required for a backdated assignment.";
  }
  if (assignmentReason && assignmentReason.length > 1000) {
    fieldErrors.assignment_reason = "Reason must be 1,000 characters or fewer.";
  }

  if (Object.keys(fieldErrors).length) {
    return invalid(fieldErrors, {
      schedule_template_id: scheduleTemplateId,
      effective_start_date: startDate,
      effective_end_date: endDate ?? "",
    });
  }

  return {
    data: {
      employee_ids: employeeIds,
      schedule_template_id: scheduleTemplateId,
      effective_start_date: startDate,
      effective_end_date: endDate,
      assignment_reason: assignmentReason,
    },
  };
}
```

- [ ] **Step 5: Implement schedule-state resolution**

Create `src/features/schedules/resolution.ts`:

```ts
import type {
  EmployeeScheduleAssignment,
  ScheduleResolutionState,
  ScheduleVersionRecord,
  ScheduleWeekday,
} from "./types.ts";

const weekdays: ScheduleWeekday[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export function weekdayForCompanyDate(value: string): ScheduleWeekday {
  const date = new Date(`${value}T00:00:00+08:00`);
  return weekdays[date.getUTCDay()];
}

export function resolveScheduleState(
  companyDate: string,
  assignment: Pick<EmployeeScheduleAssignment, "id"> | null,
  version: Pick<ScheduleVersionRecord, "working_days"> | null,
): ScheduleResolutionState {
  if (!assignment) return "unassigned";
  if (!version) return "unavailable";
  return version.working_days.includes(weekdayForCompanyDate(companyDate))
    ? "scheduled_workday"
    : "rest_day";
}
```

- [ ] **Step 6: Run focused tests**

```bash
npm test -- src/features/schedules/validation.test.ts \
  src/features/schedules/resolution.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/schedules
git commit -m "feat: add schedule validation utilities"
```

---

### Task 3: Add protected template/version mutation RPCs and action source tests

**Files:**
- Modify: `supabase/migrations/202607140004_work_schedules.sql`
- Create: `src/app/(dashboard)/settings/work-schedules/actions.ts`
- Create: `src/features/schedules/actions.test.ts`

**Interfaces:**
- Produces RPCs `create_work_schedule_template`, `update_work_schedule_template`, `create_work_schedule_version`, and `set_work_schedule_template_archived`.
- Produces Server Actions `createScheduleTemplate`, `updateScheduleTemplate`, `createScheduleVersion`, and `setScheduleArchived`.
- Uses Task 2 validation and the existing `companyDateAt()`.

- [ ] **Step 1: Write failing source-contract tests**

Create `src/features/schedules/actions.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const actionSource = await readFile(
  new URL(
    "../../app/(dashboard)/settings/work-schedules/actions.ts",
    import.meta.url,
  ),
  "utf8",
);
const migration = await readFile(
  new URL(
    "../../../supabase/migrations/202607140004_work_schedules.sql",
    import.meta.url,
  ),
  "utf8",
);

test("template actions invoke protected RPCs", () => {
  for (const rpc of [
    "create_work_schedule_template",
    "update_work_schedule_template",
    "create_work_schedule_version",
    "set_work_schedule_template_archived",
  ]) {
    assert.match(actionSource, new RegExp(`rpc\\(\\"${rpc}\\"`));
  }
});

test("template mutation RPCs require HR and fixed search paths", () => {
  assert.match(migration, /create or replace function public\.create_work_schedule_template/i);
  assert.match(migration, /create or replace function public\.update_work_schedule_template/i);
  assert.match(migration, /create or replace function public\.create_work_schedule_version/i);
  assert.match(migration, /create or replace function public\.set_work_schedule_template_archived/i);
  assert.match(migration, /set search_path = pg_catalog, public/i);
  assert.match(migration, /not public\.is_hr_admin\(\)/i);
});

test("private descriptions and reasons are not returned in retry state or logs", () => {
  assert.doesNotMatch(actionSource, /values[^}]+(description|change_reason)/s);
  assert.doesNotMatch(actionSource, /console\.(log|error)\([^)]*(description|changeReason)/s);
});
```

- [ ] **Step 2: Verify tests fail**

```bash
npm test -- src/features/schedules/actions.test.ts
```

Expected: FAIL because the actions file and RPC definitions are absent.

- [ ] **Step 3: Insert template/version RPCs before migration finalization**

In `202607140004_work_schedules.sql`, place the following before `notify pgrst` and `commit`:

```sql
create or replace function public.create_work_schedule_template(
  p_code text,
  p_name text,
  p_description text,
  p_effective_date date,
  p_working_days text[],
  p_start_time time,
  p_end_time time,
  p_break_minutes integer,
  p_change_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_code text := public.normalize_schedule_code(p_code);
  v_name text := btrim(coalesce(p_name, ''));
  v_description text := public.normalize_schedule_private_text(p_description, false);
  v_reason text;
  v_template_id uuid;
  v_version_id uuid;
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
  end if;
  if v_code = '' or char_length(v_code) > 30 then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_CODE_INVALID';
  end if;
  if v_name = '' or char_length(v_name) > 100 then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_NAME_INVALID';
  end if;

  v_reason := public.validate_schedule_rules(
    p_effective_date, p_working_days, p_start_time,
    p_end_time, p_break_minutes, p_change_reason
  );

  insert into public.work_schedule_templates (
    code, name, description, created_by, updated_by
  ) values (
    v_code, v_name, v_description, v_actor, v_actor
  ) returning id into v_template_id;

  insert into public.work_schedule_versions (
    schedule_template_id, effective_date, working_days,
    start_time, end_time, break_minutes, change_reason, created_by
  ) values (
    v_template_id, p_effective_date, p_working_days,
    p_start_time, p_end_time, p_break_minutes, v_reason, v_actor
  ) returning id into v_version_id;

  perform public.write_employee_audit(
    null,
    'schedule_template.created',
    'schedule_template',
    v_template_id,
    jsonb_build_array('code', 'name'),
    '{}'::jsonb,
    jsonb_build_object('code', v_code, 'name', v_name),
    '{}'::jsonb,
    'application',
    v_actor
  );

  perform public.write_employee_audit(
    null,
    'schedule_version.created',
    'schedule_version',
    v_version_id,
    jsonb_build_array(
      'effective_date','working_days','start_time','end_time','break_minutes'
    ),
    '{}'::jsonb,
    jsonb_build_object(
      'schedule_template_id', v_template_id,
      'effective_date', p_effective_date,
      'working_days', to_jsonb(p_working_days),
      'start_time', p_start_time,
      'end_time', p_end_time,
      'break_minutes', p_break_minutes
    ),
    '{}'::jsonb,
    'application',
    v_actor
  );

  return v_template_id;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_CODE_EXISTS';
end;
$$;

create or replace function public.update_work_schedule_template(
  p_template_id uuid,
  p_code text,
  p_name text,
  p_description text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_existing public.work_schedule_templates%rowtype;
  v_code text := public.normalize_schedule_code(p_code);
  v_name text := btrim(coalesce(p_name, ''));
  v_description text := public.normalize_schedule_private_text(p_description, false);
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
  end if;
  if v_code = '' or char_length(v_code) > 30 then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_CODE_INVALID';
  end if;
  if v_name = '' or char_length(v_name) > 100 then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_NAME_INVALID';
  end if;

  select * into v_existing
  from public.work_schedule_templates
  where id = p_template_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_NOT_FOUND';
  end if;

  update public.work_schedule_templates
  set code = v_code,
      name = v_name,
      description = v_description,
      updated_by = v_actor,
      updated_at = now()
  where id = p_template_id;

  perform public.write_employee_audit(
    null,
    'schedule_template.updated',
    'schedule_template',
    p_template_id,
    jsonb_build_array('code', 'name'),
    jsonb_build_object('code', v_existing.code, 'name', v_existing.name),
    jsonb_build_object('code', v_code, 'name', v_name),
    '{}'::jsonb,
    'application',
    v_actor
  );
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_CODE_EXISTS';
end;
$$;

create or replace function public.create_work_schedule_version(
  p_template_id uuid,
  p_effective_date date,
  p_working_days text[],
  p_start_time time,
  p_end_time time,
  p_break_minutes integer,
  p_change_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_reason text;
  v_version_id uuid;
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
  end if;

  perform 1
  from public.work_schedule_templates
  where id = p_template_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_NOT_FOUND';
  end if;

  v_reason := public.validate_schedule_rules(
    p_effective_date, p_working_days, p_start_time,
    p_end_time, p_break_minutes, p_change_reason
  );

  insert into public.work_schedule_versions (
    schedule_template_id, effective_date, working_days,
    start_time, end_time, break_minutes, change_reason, created_by
  ) values (
    p_template_id, p_effective_date, p_working_days,
    p_start_time, p_end_time, p_break_minutes, v_reason, v_actor
  ) returning id into v_version_id;

  perform public.write_employee_audit(
    null,
    'schedule_version.created',
    'schedule_version',
    v_version_id,
    jsonb_build_array(
      'effective_date','working_days','start_time','end_time','break_minutes'
    ),
    '{}'::jsonb,
    jsonb_build_object(
      'schedule_template_id', p_template_id,
      'effective_date', p_effective_date,
      'working_days', to_jsonb(p_working_days),
      'start_time', p_start_time,
      'end_time', p_end_time,
      'break_minutes', p_break_minutes
    ),
    '{}'::jsonb,
    'application',
    v_actor
  );
  return v_version_id;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_VERSION_DATE_EXISTS';
end;
$$;

create or replace function public.set_work_schedule_template_archived(
  p_template_id uuid,
  p_archived boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_template public.work_schedule_templates%rowtype;
  v_action text;
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
  end if;

  select * into v_template
  from public.work_schedule_templates
  where id = p_template_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_NOT_FOUND';
  end if;

  update public.work_schedule_templates
  set is_archived = p_archived,
      archived_by = case when p_archived then v_actor else null end,
      archived_at = case when p_archived then now() else null end,
      updated_by = v_actor,
      updated_at = now()
  where id = p_template_id;

  v_action := case
    when p_archived then 'schedule_template.archived'
    else 'schedule_template.restored'
  end;

  perform public.write_employee_audit(
    null,
    v_action,
    'schedule_template',
    p_template_id,
    jsonb_build_array('is_archived'),
    jsonb_build_object('is_archived', v_template.is_archived),
    jsonb_build_object('is_archived', p_archived),
    '{}'::jsonb,
    'application',
    v_actor
  );
end;
$$;

revoke all on function public.create_work_schedule_template(
  text, text, text, date, text[], time, time, integer, text
) from public, anon;
revoke all on function public.update_work_schedule_template(uuid, text, text, text)
  from public, anon;
revoke all on function public.create_work_schedule_version(
  uuid, date, text[], time, time, integer, text
) from public, anon;
revoke all on function public.set_work_schedule_template_archived(uuid, boolean)
  from public, anon;

grant execute on function public.create_work_schedule_template(
  text, text, text, date, text[], time, time, integer, text
) to authenticated;
grant execute on function public.update_work_schedule_template(uuid, text, text, text)
  to authenticated;
grant execute on function public.create_work_schedule_version(
  uuid, date, text[], time, time, integer, text
) to authenticated;
grant execute on function public.set_work_schedule_template_archived(uuid, boolean)
  to authenticated;
```

- [ ] **Step 4: Implement Server Actions and error mapping**

Create `src/app/(dashboard)/settings/work-schedules/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { companyDateAt } from "@/features/attendance/time";
import { requireOrganizationAdmin } from "@/features/organization/auth";
import type { ScheduleActionState } from "@/features/schedules/types";
import {
  validateScheduleTemplate,
  validateScheduleVersion,
} from "@/features/schedules/validation";

function rpcError(message: string | undefined) {
  const errors: Record<string, string> = {
    SCHEDULE_CODE_EXISTS: "A schedule with this code already exists.",
    SCHEDULE_VERSION_DATE_EXISTS: "A version already exists for this effective date.",
    SCHEDULE_REASON_REQUIRED: "A reason is required for this backdated change.",
    SCHEDULE_NOT_FOUND: "The schedule was not found.",
    SCHEDULE_TIME_ORDER_INVALID: "The end time must be later than the start time.",
    SCHEDULE_BREAK_TOO_LONG: "Break duration must be shorter than the shift.",
  };
  return errors[message ?? ""] ?? "The schedule could not be saved.";
}

function revalidateSchedules(templateId?: string) {
  revalidatePath("/settings/work-schedules");
  if (templateId) revalidatePath(`/settings/work-schedules/${templateId}`);
  revalidatePath("/my-schedule");
  revalidatePath("/attendance");
  revalidatePath("/dashboard");
}

export async function createScheduleTemplate(
  _state: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const { supabase } = await requireOrganizationAdmin();
  const template = validateScheduleTemplate(formData);
  const version = validateScheduleVersion(formData, companyDateAt());
  if (!template.data || !version.data) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: {
        ...(template.state?.fieldErrors ?? {}),
        ...(version.state?.fieldErrors ?? {}),
      },
      values: {
        ...(template.state?.values ?? {}),
        ...(version.state?.values ?? {}),
      },
    };
  }

  const { data, error } = await supabase.rpc("create_work_schedule_template", {
    p_code: template.data.code,
    p_name: template.data.name,
    p_description: template.data.description,
    p_effective_date: version.data.effective_date,
    p_working_days: version.data.working_days,
    p_start_time: version.data.start_time,
    p_end_time: version.data.end_time,
    p_break_minutes: version.data.break_minutes,
    p_change_reason: version.data.change_reason,
  });
  if (error) return { error: rpcError(error.message), values: { code: template.data.code, name: template.data.name } };

  revalidateSchedules(String(data));
  redirect(`/settings/work-schedules/${data}?success=created`);
}

export async function updateScheduleTemplate(
  templateId: string,
  _state: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const { supabase } = await requireOrganizationAdmin();
  const validation = validateScheduleTemplate(formData);
  if (!validation.data) return validation.state ?? { error: "Invalid schedule." };

  const { error } = await supabase.rpc("update_work_schedule_template", {
    p_template_id: templateId,
    p_code: validation.data.code,
    p_name: validation.data.name,
    p_description: validation.data.description,
  });
  if (error) return { error: rpcError(error.message), values: { code: validation.data.code, name: validation.data.name } };

  revalidateSchedules(templateId);
  redirect(`/settings/work-schedules/${templateId}?success=updated`);
}

export async function createScheduleVersion(
  templateId: string,
  _state: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const { supabase } = await requireOrganizationAdmin();
  const validation = validateScheduleVersion(formData, companyDateAt());
  if (!validation.data) return validation.state ?? { error: "Invalid schedule version." };

  const { error } = await supabase.rpc("create_work_schedule_version", {
    p_template_id: templateId,
    p_effective_date: validation.data.effective_date,
    p_working_days: validation.data.working_days,
    p_start_time: validation.data.start_time,
    p_end_time: validation.data.end_time,
    p_break_minutes: validation.data.break_minutes,
    p_change_reason: validation.data.change_reason,
  });
  if (error) return { error: rpcError(error.message), values: validation.state?.values };

  revalidateSchedules(templateId);
  redirect(`/settings/work-schedules/${templateId}?success=version_created`);
}

export async function setScheduleArchived(
  templateId: string,
  archived: boolean,
) {
  const { supabase } = await requireOrganizationAdmin();
  const { error } = await supabase.rpc("set_work_schedule_template_archived", {
    p_template_id: templateId,
    p_archived: archived,
  });
  if (error) {
    redirect(`/settings/work-schedules/${templateId}?error=archive_failed`);
  }
  revalidateSchedules(templateId);
  redirect(`/settings/work-schedules/${templateId}?success=${archived ? "archived" : "restored"}`);
}
```

- [ ] **Step 5: Run focused tests**

```bash
npm test -- src/features/schedules/actions.test.ts \
  src/features/schedules/migration.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/202607140004_work_schedules.sql \
  'src/app/(dashboard)/settings/work-schedules/actions.ts' \
  src/features/schedules/actions.test.ts
git commit -m "feat: add schedule template transactions"
```

---

### Task 4: Add schedule authorization and server-only template queries

**Files:**
- Create: `src/features/schedules/auth.ts`
- Create: `src/features/schedules/queries.ts`
- Create: `src/features/schedules/queries.test.ts`

**Interfaces:**
- Produces `requireScheduleAdmin()` and `requireOwnScheduleEmployee()`.
- Produces `getScheduleTemplates`, `getScheduleTemplateDetails`, `getActiveScheduleOptions`, and `getEligibleScheduleEmployees`.
- Later tasks add assignment and resolution queries to the same query module.

- [ ] **Step 1: Write source-security tests**

Create `src/features/schedules/queries.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./queries.ts", import.meta.url), "utf8");
const auth = await readFile(new URL("./auth.ts", import.meta.url), "utf8");

test("schedule queries are server-only", () => {
  assert.match(source, /import \"server-only\"/);
});

test("schedule administration reuses HR authorization", () => {
  assert.match(auth, /requireOrganizationAdmin/);
  assert.match(auth, /requireAttendanceEmployee/);
});

test("template queries use explicit version and profile relationships", () => {
  assert.match(source, /creator:profiles!work_schedule_versions_created_by_fkey/);
  assert.match(source, /template:work_schedule_templates!employee_schedule_assignments_schedule_template_id_fkey/);
});

test("active schedule options exclude archived templates", () => {
  assert.match(source, /\.eq\("is_archived", false\)/);
});
```

- [ ] **Step 2: Verify tests fail**

```bash
npm test -- src/features/schedules/queries.test.ts
```

Expected: FAIL because query and auth modules do not exist.

- [ ] **Step 3: Implement authorization wrappers**

Create `src/features/schedules/auth.ts`:

```ts
import { requireAttendanceEmployee } from "@/features/attendance/auth";
import { requireOrganizationAdmin } from "@/features/organization/auth";

export async function requireScheduleAdmin() {
  return requireOrganizationAdmin();
}

export async function requireOwnScheduleEmployee() {
  return requireAttendanceEmployee();
}
```

- [ ] **Step 4: Implement template queries**

Create `src/features/schedules/queries.ts`:

```ts
import "server-only";

import { createClient } from "@/lib/supabase/server";
import { companyDateAt } from "@/features/attendance/time";
import type {
  EmployeeScheduleAssignment,
  ScheduleEmployeeOption,
  ScheduleTemplateRecord,
  ScheduleVersionRecord,
} from "./types";

const versionSelect = `
  id,schedule_template_id,effective_date,working_days,start_time,end_time,
  break_minutes,change_reason,created_by,created_at,
  creator:profiles!work_schedule_versions_created_by_fkey(
    id,display_name,first_name,last_name
  )
`;

const assignmentSelect = `
  id,employee_id,schedule_template_id,effective_start_date,effective_end_date,
  assignment_reason,is_superseded,superseded_at,superseded_by_assignment_id,
  created_by,created_at,updated_by,updated_at,
  template:work_schedule_templates!employee_schedule_assignments_schedule_template_id_fkey(
    id,code,name,description,is_archived,created_by,created_at,updated_by,updated_at,
    archived_by,archived_at
  ),
  employee:employees!employee_schedule_assignments_employee_id_fkey(
    id,employee_number,first_name,last_name,department_id,
    department:departments!employees_department_id_fkey(id,name)
  ),
  creator:profiles!employee_schedule_assignments_created_by_fkey(
    id,display_name,first_name,last_name
  )
`;

function cleanSearch(value?: string) {
  return value?.trim().replace(/[,%()]/g, " ").replace(/\s+/g, " ") ?? "";
}

export async function getScheduleTemplates(params: {
  query?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  const supabase = await createClient();
  const companyDate = companyDateAt();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = params.pageSize ?? 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const status = params.status === "archived" || params.status === "all"
    ? params.status
    : "active";
  const search = cleanSearch(params.query);

  let request = supabase
    .from("work_schedule_templates")
    .select("id,code,name,description,is_archived,created_by,created_at,updated_by,updated_at,archived_by,archived_at", { count: "exact" })
    .order("name")
    .range(from, to);
  if (status === "active") request = request.eq("is_archived", false);
  if (status === "archived") request = request.eq("is_archived", true);
  if (search) request = request.or(`code.ilike.%${search}%,name.ilike.%${search}%`);

  const { data, count, error } = await request;
  if (error) throw new Error("Unable to load work schedules.");

  const templates = (data ?? []) as ScheduleTemplateRecord[];
  const ids = templates.map((item) => item.id);
  if (ids.length === 0) {
    return { templates, page, pageSize, total: 0, totalPages: 1 };
  }

  const [versionsResult, assignmentsResult] = await Promise.all([
    supabase
      .from("work_schedule_versions")
      .select(versionSelect)
      .in("schedule_template_id", ids)
      .order("effective_date", { ascending: false }),
    supabase
      .from("employee_schedule_assignments")
      .select("schedule_template_id,employee_id")
      .in("schedule_template_id", ids)
      .eq("is_superseded", false)
      .lte("effective_start_date", companyDate)
      .or(`effective_end_date.is.null,effective_end_date.gte.${companyDate}`),
  ]);
  if (versionsResult.error || assignmentsResult.error) {
    throw new Error("Unable to load schedule summaries.");
  }

  const versions = (versionsResult.data ?? []) as unknown as ScheduleVersionRecord[];
  const counts = (assignmentsResult.data ?? []).reduce<Record<string, number>>((result, item) => {
    result[item.schedule_template_id] = (result[item.schedule_template_id] ?? 0) + 1;
    return result;
  }, {});

  const mapped = templates.map((template) => ({
    ...template,
    current_version: versions.find(
      (version) => version.schedule_template_id === template.id
        && version.effective_date <= companyDate,
    ) ?? null,
    upcoming_versions: versions.filter(
      (version) => version.schedule_template_id === template.id
        && version.effective_date > companyDate,
    ),
    assigned_employee_count: counts[template.id] ?? 0,
  }));

  const total = count ?? 0;
  return {
    templates: mapped,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getScheduleTemplateDetails(templateId: string) {
  const supabase = await createClient();
  const companyDate = companyDateAt();
  const [templateResult, versionsResult, assignmentsResult] = await Promise.all([
    supabase
      .from("work_schedule_templates")
      .select("id,code,name,description,is_archived,created_by,created_at,updated_by,updated_at,archived_by,archived_at")
      .eq("id", templateId)
      .maybeSingle(),
    supabase
      .from("work_schedule_versions")
      .select(versionSelect)
      .eq("schedule_template_id", templateId)
      .order("effective_date", { ascending: false }),
    supabase
      .from("employee_schedule_assignments")
      .select(assignmentSelect)
      .eq("schedule_template_id", templateId)
      .eq("is_superseded", false)
      .order("effective_start_date", { ascending: false }),
  ]);
  if (templateResult.error || versionsResult.error || assignmentsResult.error) {
    throw new Error("Unable to load the work schedule.");
  }
  if (!templateResult.data) return null;

  const versions = (versionsResult.data ?? []) as unknown as ScheduleVersionRecord[];
  return {
    template: {
      ...(templateResult.data as ScheduleTemplateRecord),
      current_version: versions.find((version) => version.effective_date <= companyDate) ?? null,
      upcoming_versions: versions.filter((version) => version.effective_date > companyDate),
      version_history: versions,
    },
    assignments: (assignmentsResult.data ?? []) as unknown as EmployeeScheduleAssignment[],
    companyDate,
  };
}

export async function getActiveScheduleOptions() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_schedule_templates")
    .select("id,code,name,is_archived")
    .eq("is_archived", false)
    .order("name");
  if (error) throw new Error("Unable to load schedule options.");
  return data ?? [];
}

export async function getEligibleScheduleEmployees() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select(`
      id,employee_number,first_name,last_name,department_id,
      department:departments!employees_department_id_fkey(id,name)
    `)
    .is("archived_at", null)
    .in("employment_status", ["active", "probation", "on_leave"])
    .order("last_name")
    .order("first_name");
  if (error) throw new Error("Unable to load eligible employees.");
  return (data ?? []) as unknown as ScheduleEmployeeOption[];
}

export { assignmentSelect, versionSelect };
```

- [ ] **Step 5: Run tests**

```bash
npm test -- src/features/schedules/queries.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/schedules/auth.ts \
  src/features/schedules/queries.ts \
  src/features/schedules/queries.test.ts
git commit -m "feat: add schedule template queries"
```

---

### Task 5: Add template list, create, details, edit, version, archive UI

**Files:**
- Create all template route and component files listed in the File map.
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes Task 3 actions and Task 4 queries.
- Produces complete HR schedule-template management before assignment UI.

- [ ] **Step 1: Create `ScheduleSummary`**

Create `src/components/schedules/schedule-summary.tsx`:

```tsx
import { scheduledMinutes } from "@/features/schedules/validation";
import type { ScheduleVersionRecord } from "@/features/schedules/types";

function time(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return new Intl.DateTimeFormat("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2026, 0, 1, hour, minute)));
}

export function ScheduleSummary({ version }: { version: ScheduleVersionRecord }) {
  const minutes = scheduledMinutes(version.start_time, version.end_time, version.break_minutes);
  return (
    <dl className="schedule-summary-grid">
      <div><dt>Working days</dt><dd>{version.working_days.map((day) => day[0].toUpperCase() + day.slice(1)).join(", ")}</dd></div>
      <div><dt>Hours</dt><dd>{time(version.start_time)}–{time(version.end_time)}</dd></div>
      <div><dt>Unpaid break</dt><dd>{version.break_minutes} minutes</dd></div>
      <div><dt>Scheduled work</dt><dd>{Math.floor(minutes / 60)}h {minutes % 60}m</dd></div>
    </dl>
  );
}
```

- [ ] **Step 2: Create reusable template and version forms**

Create `src/components/schedules/schedule-template-form.tsx` with a client `useActionState` form. Required props and fields:

```tsx
"use client";

import { useActionState } from "react";
import type { ScheduleActionState, ScheduleTemplateRecord } from "@/features/schedules/types";

const initialState: ScheduleActionState = {};

export function ScheduleTemplateForm({
  action,
  template,
  includeInitialVersion = false,
  companyDate,
}: {
  action: (state: ScheduleActionState, formData: FormData) => Promise<ScheduleActionState>;
  template?: ScheduleTemplateRecord | null;
  includeInitialVersion?: boolean;
  companyDate: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form action={formAction} className="card form-card schedule-form">
      <div className="form-grid">
        <label><span>Schedule code</span><input className="field" name="code" maxLength={30} defaultValue={state.values?.code ?? template?.code ?? ""} required /></label>
        <label><span>Schedule name</span><input className="field" name="name" maxLength={100} defaultValue={state.values?.name ?? template?.name ?? ""} required /></label>
        <label className="full"><span>Description</span><textarea className="field" name="description" maxLength={1000} defaultValue={template?.description ?? ""} rows={4} /></label>
      </div>
      {includeInitialVersion && <ScheduleVersionFields companyDate={companyDate} />}
      {state.error && <p className="form-error">{state.error}</p>}
      <button className="btn primary" disabled={pending} type="submit">{pending ? "Saving…" : template ? "Save template" : "Create schedule"}</button>
    </form>
  );
}

export function ScheduleVersionFields({ companyDate }: { companyDate: string }) {
  const weekdays = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
  return (
    <fieldset className="schedule-version-fields">
      <legend>Schedule rules</legend>
      <label><span>Effective date</span><input className="field" type="date" name="effective_date" defaultValue={companyDate} required /></label>
      <div><span className="field-label">Working days</span><div className="weekday-grid">{weekdays.map((day) => <label key={day} className="checkbox-row"><input type="checkbox" name="working_days" value={day} defaultChecked={!day.startsWith("s")} /> {day[0].toUpperCase() + day.slice(1)}</label>)}</div></div>
      <div className="form-grid three"><label><span>Start time</span><input className="field" type="time" name="start_time" defaultValue="08:00" required /></label><label><span>End time</span><input className="field" type="time" name="end_time" defaultValue="17:00" required /></label><label><span>Break minutes</span><input className="field" type="number" min={0} name="break_minutes" defaultValue="60" required /></label></div>
      <label><span>Change reason <span className="muted">(required when backdated)</span></span><textarea className="field" name="change_reason" maxLength={1000} rows={3} /></label>
    </fieldset>
  );
}
```

Create `src/components/schedules/schedule-version-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import type { ScheduleActionState } from "@/features/schedules/types";
import { ScheduleVersionFields } from "./schedule-template-form";

export function ScheduleVersionForm({
  action,
  companyDate,
}: {
  action: (state: ScheduleActionState, formData: FormData) => Promise<ScheduleActionState>;
  companyDate: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return <form action={formAction} className="card form-card schedule-form"><ScheduleVersionFields companyDate={companyDate} />{state.error && <p className="form-error">{state.error}</p>}<button className="btn primary" disabled={pending}>{pending ? "Saving…" : "Create version"}</button></form>;
}
```

- [ ] **Step 3: Create list and archive components**

Create `src/components/schedules/schedule-template-list.tsx` and `archive-schedule-button.tsx`:

```tsx
import Link from "next/link";
import type { ScheduleTemplateRecord } from "@/features/schedules/types";
import { ScheduleSummary } from "./schedule-summary";

export function ScheduleTemplateList({ templates }: { templates: ScheduleTemplateRecord[] }) {
  if (templates.length === 0) return <div className="empty">No work schedules match these filters.</div>;
  return <div className="schedule-card-grid">{templates.map((template) => <article className="card schedule-template-card" key={template.id}><div className="section-heading-row"><div><span className="muted">{template.code}</span><h2>{template.name}</h2></div><span className={`badge ${template.is_archived ? "warning" : "success"}`}>{template.is_archived ? "Archived" : "Active"}</span></div>{template.current_version ? <ScheduleSummary version={template.current_version} /> : <p className="form-error">No effective version is available.</p>}<p className="muted">{template.assigned_employee_count ?? 0} currently assigned · {template.upcoming_versions?.length ?? 0} upcoming version(s)</p><Link className="btn" href={`/settings/work-schedules/${template.id}`}>View schedule</Link></article>)}</div>;
}
```

```tsx
"use client";

export function ArchiveScheduleButton({
  action,
  archived,
}: {
  action: () => Promise<void>;
  archived: boolean;
}) {
  return <form action={action} onSubmit={(event) => { if (!confirm(archived ? "Restore this schedule?" : "Archive this schedule? Existing assignments will remain valid.")) event.preventDefault(); }}><button className={`btn ${archived ? "primary" : "danger"}`} type="submit">{archived ? "Restore schedule" : "Archive schedule"}</button></form>;
}
```

- [ ] **Step 4: Create all template routes**

Implement routes with these exact authorization/query calls:

```tsx
// /settings/work-schedules/page.tsx
await requireScheduleAdmin();
const result = await getScheduleTemplates({ query, status, page });
```

```tsx
// /settings/work-schedules/new/page.tsx
await requireScheduleAdmin();
<ScheduleTemplateForm action={createScheduleTemplate} includeInitialVersion companyDate={companyDateAt()} />
```

```tsx
// /settings/work-schedules/[id]/page.tsx
await requireScheduleAdmin();
const details = await getScheduleTemplateDetails(id);
if (!details) notFound();
```

```tsx
// /settings/work-schedules/[id]/edit/page.tsx
await requireScheduleAdmin();
const details = await getScheduleTemplateDetails(id);
if (!details) notFound();
<ScheduleTemplateForm action={updateScheduleTemplate.bind(null, id)} template={details.template} companyDate={details.companyDate} />
```

```tsx
// /settings/work-schedules/[id]/versions/new/page.tsx
await requireScheduleAdmin();
const details = await getScheduleTemplateDetails(id);
if (!details) notFound();
<ScheduleVersionForm action={createScheduleVersion.bind(null, id)} companyDate={details.companyDate} />
```

Each page must use `PageHeader`, render explicit Back/Create/Edit actions, display safe success/error messages, and never render raw Supabase errors.

- [ ] **Step 5: Add responsive schedule management styles**

Append to `src/app/globals.css`:

```css
.schedule-card-grid,
.assignment-card-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}
.schedule-template-card { display: grid; gap: 14px; min-width: 0; }
.schedule-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.schedule-summary-grid div { min-width: 0; }
.schedule-summary-grid dt { color: var(--muted); font-size: 12px; }
.schedule-summary-grid dd { margin: 4px 0 0; font-weight: 700; overflow-wrap: anywhere; }
.schedule-form { display: grid; gap: 18px; }
.schedule-version-fields { display: grid; gap: 16px; border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
.weekday-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
.checkbox-row { display: flex; align-items: center; gap: 7px; min-height: 44px; }
.form-grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
@media (max-width: 720px) {
  .schedule-summary-grid,
  .form-grid.three,
  .weekday-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 440px) {
  .schedule-summary-grid,
  .form-grid.three { grid-template-columns: 1fr; }
}
```

- [ ] **Step 6: Run tests and build**

```bash
npm test
npm run build
```

Expected: tests pass and the five template routes compile.

- [ ] **Step 7: Commit**

```bash
git add 'src/app/(dashboard)/settings/work-schedules' \
  src/components/schedules src/app/globals.css
git commit -m "feat: add work schedule management UI"
```

---

### Task 6: Add atomic individual and bulk assignment SQL functions

**Files:**
- Modify: `supabase/migrations/202607140004_work_schedules.sql`
- Modify: `src/features/schedules/migration.test.ts`

**Interfaces:**
- Produces private `apply_employee_schedule_assignment`.
- Produces authenticated RPCs `assign_employee_schedule` and `bulk_assign_employee_schedule`.
- Returns the created assignment UUID for individual assignment and UUID array for bulk assignment.

- [ ] **Step 1: Extend failing migration tests for temporal assignment behavior**

Append:

```ts
test("assignment RPCs lock employees, end preceding rows, and supersede future rows", () => {
  assert.match(sql, /create or replace function public\.apply_employee_schedule_assignment/i);
  assert.match(sql, /order by id[\s\S]+for update/i);
  assert.match(sql, /effective_end_date = p_effective_start_date - 1/i);
  assert.match(sql, /is_superseded = true/i);
  assert.match(sql, /superseded_by_assignment_id = v_assignment_id/i);
});

test("bulk assignment rejects duplicates and invokes one private assignment helper", () => {
  assert.match(sql, /create or replace function public\.bulk_assign_employee_schedule/i);
  assert.match(sql, /SCHEDULE_EMPLOYEE_DUPLICATE/i);
  assert.match(sql, /perform public\.apply_employee_schedule_assignment/i);
});

test("archived templates and inactive employees cannot be assigned", () => {
  assert.match(sql, /SCHEDULE_ARCHIVED/i);
  assert.match(sql, /SCHEDULE_EMPLOYEE_INELIGIBLE/i);
});
```

Run and confirm failure because the functions do not exist.

- [ ] **Step 2: Add the private assignment helper**

Insert before migration finalization:

```sql
create or replace function public.apply_employee_schedule_assignment(
  p_actor uuid,
  p_employee_id uuid,
  p_schedule_template_id uuid,
  p_effective_start_date date,
  p_effective_end_date date,
  p_assignment_reason text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_template public.work_schedule_templates%rowtype;
  v_reason text := public.normalize_schedule_private_text(p_assignment_reason, false);
  v_assignment_id uuid := gen_random_uuid();
  v_previous public.employee_schedule_assignments%rowtype;
  v_future public.employee_schedule_assignments%rowtype;
begin
  if p_effective_start_date is null then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_ASSIGNMENT_START_REQUIRED';
  end if;
  if p_effective_end_date is not null and p_effective_end_date < p_effective_start_date then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_ASSIGNMENT_DATE_INVALID';
  end if;
  if p_effective_start_date < public.company_attendance_date(now()) and v_reason is null then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_REASON_REQUIRED';
  end if;

  perform 1
  from public.employees
  where id = p_employee_id
    and archived_at is null
    and employment_status in ('active', 'probation', 'on_leave')
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_EMPLOYEE_INELIGIBLE';
  end if;

  select * into v_template
  from public.work_schedule_templates
  where id = p_schedule_template_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_NOT_FOUND';
  end if;
  if v_template.is_archived then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_ARCHIVED';
  end if;

  perform 1
  from public.employee_schedule_assignments
  where employee_id = p_employee_id
  order by id
  for update;

  select * into v_previous
  from public.employee_schedule_assignments
  where employee_id = p_employee_id
    and not is_superseded
    and effective_start_date < p_effective_start_date
    and (effective_end_date is null or effective_end_date >= p_effective_start_date)
  order by effective_start_date desc
  limit 1;

  if found then
    update public.employee_schedule_assignments
    set effective_end_date = p_effective_start_date - 1,
        updated_by = p_actor,
        updated_at = now()
    where id = v_previous.id;

    perform public.write_employee_audit(
      p_employee_id,
      'schedule_assignment.ended',
      'schedule_assignment',
      v_previous.id,
      jsonb_build_array('effective_end_date'),
      jsonb_build_object('effective_end_date', v_previous.effective_end_date),
      jsonb_build_object('effective_end_date', p_effective_start_date - 1),
      jsonb_build_object('schedule_template_id', v_previous.schedule_template_id),
      'application',
      p_actor
    );
  end if;

  for v_future in
    select *
    from public.employee_schedule_assignments
    where employee_id = p_employee_id
      and not is_superseded
      and effective_start_date >= p_effective_start_date
    order by effective_start_date, id
    for update
  loop
    update public.employee_schedule_assignments
    set is_superseded = true,
        superseded_at = now(),
        superseded_by_assignment_id = v_assignment_id,
        updated_by = p_actor,
        updated_at = now()
    where id = v_future.id;

    perform public.write_employee_audit(
      p_employee_id,
      'schedule_assignment.superseded',
      'schedule_assignment',
      v_future.id,
      jsonb_build_array('is_superseded'),
      jsonb_build_object('is_superseded', false),
      jsonb_build_object('is_superseded', true),
      jsonb_build_object(
        'schedule_template_id', v_future.schedule_template_id,
        'superseded_by_assignment_id', v_assignment_id
      ),
      'application',
      p_actor
    );
  end loop;

  insert into public.employee_schedule_assignments (
    id,employee_id,schedule_template_id,effective_start_date,effective_end_date,
    assignment_reason,created_by,updated_by
  ) values (
    v_assignment_id,p_employee_id,p_schedule_template_id,p_effective_start_date,
    p_effective_end_date,v_reason,p_actor,p_actor
  );

  perform public.write_employee_audit(
    p_employee_id,
    'schedule_assignment.created',
    'schedule_assignment',
    v_assignment_id,
    jsonb_build_array(
      'schedule_template_id','effective_start_date','effective_end_date'
    ),
    '{}'::jsonb,
    jsonb_build_object(
      'schedule_template_id', p_schedule_template_id,
      'effective_start_date', p_effective_start_date,
      'effective_end_date', p_effective_end_date
    ),
    '{}'::jsonb,
    'application',
    p_actor
  );

  return v_assignment_id;
end;
$$;

revoke all on function public.apply_employee_schedule_assignment(
  uuid, uuid, uuid, date, date, text
) from public, anon, authenticated;
```

- [ ] **Step 3: Add individual and bulk public RPCs**

```sql
create or replace function public.assign_employee_schedule(
  p_employee_id uuid,
  p_schedule_template_id uuid,
  p_effective_start_date date,
  p_effective_end_date date default null,
  p_assignment_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
  end if;
  return public.apply_employee_schedule_assignment(
    v_actor,p_employee_id,p_schedule_template_id,
    p_effective_start_date,p_effective_end_date,p_assignment_reason
  );
end;
$$;

create or replace function public.bulk_assign_employee_schedule(
  p_employee_ids uuid[],
  p_schedule_template_id uuid,
  p_effective_start_date date,
  p_effective_end_date date default null,
  p_assignment_reason text default null
)
returns uuid[]
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_employee_id uuid;
  v_assignment_ids uuid[] := '{}'::uuid[];
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
  end if;
  if p_employee_ids is null or cardinality(p_employee_ids) = 0 then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_EMPLOYEE_REQUIRED';
  end if;
  if cardinality(p_employee_ids) <> (
    select count(distinct employee_id)
    from unnest(p_employee_ids) as employee_id
  ) then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_EMPLOYEE_DUPLICATE';
  end if;

  for v_employee_id in
    select employee_id
    from unnest(p_employee_ids) as employee_id
    order by employee_id
  loop
    v_assignment_ids := array_append(
      v_assignment_ids,
      public.apply_employee_schedule_assignment(
        v_actor,v_employee_id,p_schedule_template_id,
        p_effective_start_date,p_effective_end_date,p_assignment_reason
      )
    );
  end loop;

  return v_assignment_ids;
end;
$$;

revoke all on function public.assign_employee_schedule(uuid, uuid, date, date, text)
  from public, anon;
revoke all on function public.bulk_assign_employee_schedule(uuid[], uuid, date, date, text)
  from public, anon;
grant execute on function public.assign_employee_schedule(uuid, uuid, date, date, text)
  to authenticated;
grant execute on function public.bulk_assign_employee_schedule(uuid[], uuid, date, date, text)
  to authenticated;
```

- [ ] **Step 4: Run migration tests**

```bash
npm test -- src/features/schedules/migration.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/202607140004_work_schedules.sql \
  src/features/schedules/migration.test.ts
git commit -m "feat: add atomic schedule assignments"
```

---

### Task 7: Add assignment actions, preview queries, and source tests

**Files:**
- Modify: `src/app/(dashboard)/settings/work-schedules/actions.ts`
- Modify: `src/features/schedules/queries.ts`
- Modify: `src/features/schedules/actions.test.ts`
- Modify: `src/features/schedules/queries.test.ts`

**Interfaces:**
- Produces actions `assignScheduleToEmployee` and `bulkAssignSchedule`.
- Produces `getEmployeeScheduleAssignments`, `getAssignmentPreview`, and `getBulkAssignmentPreview`.

- [ ] **Step 1: Extend failing tests**

Append to `actions.test.ts`:

```ts
test("individual and bulk assignment actions invoke one protected RPC", () => {
  assert.match(actionSource, /rpc\(\"assign_employee_schedule\"/);
  assert.match(actionSource, /rpc\(\"bulk_assign_employee_schedule\"/);
});

test("assignment retry state never contains the private assignment reason", () => {
  assert.doesNotMatch(actionSource, /values[^}]+assignment_reason/s);
});
```

Append to `queries.test.ts`:

```ts
test("assignment previews include current and future non-superseded rows", () => {
  assert.match(source, /getAssignmentPreview/);
  assert.match(source, /getBulkAssignmentPreview/);
  assert.match(source, /\.eq\("is_superseded", false\)/);
});
```

Run and verify failure.

- [ ] **Step 2: Add assignment actions**

Append to the Server Actions file:

```ts
import { validateScheduleAssignment } from "@/features/schedules/validation";

function assignmentError(code: string | undefined, message: string | undefined) {
  const errors: Record<string, string> = {
    SCHEDULE_ARCHIVED: "Archived schedules cannot be assigned.",
    SCHEDULE_EMPLOYEE_INELIGIBLE: "One or more selected employees are no longer eligible.",
    SCHEDULE_REASON_REQUIRED: "A reason is required for this backdated assignment.",
    SCHEDULE_ASSIGNMENT_DATE_INVALID: "The assignment end date must be on or after its start date.",
    SCHEDULE_EMPLOYEE_DUPLICATE: "Each employee may be selected only once.",
    "23P01": "The assignment conflicts with another active schedule range.",
  };
  return errors[message ?? ""] ?? errors[code ?? ""] ?? "The schedule assignment could not be completed. No assignments were changed.";
}

export async function assignScheduleToEmployee(
  _state: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const { supabase } = await requireOrganizationAdmin();
  const validation = validateScheduleAssignment(formData, companyDateAt());
  if (!validation.data) return validation.state ?? { error: "Invalid assignment." };
  const employeeId = validation.data.employee_ids[0];
  const { error } = await supabase.rpc("assign_employee_schedule", {
    p_employee_id: employeeId,
    p_schedule_template_id: validation.data.schedule_template_id,
    p_effective_start_date: validation.data.effective_start_date,
    p_effective_end_date: validation.data.effective_end_date,
    p_assignment_reason: validation.data.assignment_reason,
  });
  if (error) return { error: assignmentError(error.code, error.message), values: validation.state?.values };
  revalidateSchedules(validation.data.schedule_template_id);
  revalidatePath(`/employees/${employeeId}/schedule`);
  revalidatePath(`/employees/${employeeId}/activity`);
  redirect(`/employees/${employeeId}/schedule?success=assigned`);
}

export async function bulkAssignSchedule(
  _state: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const { supabase } = await requireOrganizationAdmin();
  const validation = validateScheduleAssignment(formData, companyDateAt());
  if (!validation.data) return validation.state ?? { error: "Invalid assignment." };
  const { error } = await supabase.rpc("bulk_assign_employee_schedule", {
    p_employee_ids: validation.data.employee_ids,
    p_schedule_template_id: validation.data.schedule_template_id,
    p_effective_start_date: validation.data.effective_start_date,
    p_effective_end_date: validation.data.effective_end_date,
    p_assignment_reason: validation.data.assignment_reason,
  });
  if (error) return { error: assignmentError(error.code, error.message), values: validation.state?.values };
  revalidateSchedules(validation.data.schedule_template_id);
  for (const employeeId of validation.data.employee_ids) {
    revalidatePath(`/employees/${employeeId}/schedule`);
    revalidatePath(`/employees/${employeeId}/activity`);
  }
  redirect("/settings/work-schedules?success=bulk_assigned");
}
```

- [ ] **Step 3: Add assignment query helpers**

Append to `queries.ts`:

```ts
export async function getEmployeeScheduleAssignments(employeeId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_schedule_assignments")
    .select(assignmentSelect)
    .eq("employee_id", employeeId)
    .order("effective_start_date", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw new Error("Unable to load employee schedule history.");
  return (data ?? []) as unknown as EmployeeScheduleAssignment[];
}

export async function getAssignmentPreview(employeeId: string, startDate: string) {
  const assignments = await getEmployeeScheduleAssignments(employeeId);
  return {
    current: assignments.find((item) =>
      !item.is_superseded
      && item.effective_start_date < startDate
      && (!item.effective_end_date || item.effective_end_date >= startDate)
    ) ?? null,
    future: assignments.filter((item) =>
      !item.is_superseded && item.effective_start_date >= startDate
    ),
  };
}

export async function getBulkAssignmentPreview(employeeIds: string[], startDate: string) {
  const supabase = await createClient();
  if (employeeIds.length === 0) return { ending: 0, superseding: 0, unassigned: 0 };
  const { data, error } = await supabase
    .from("employee_schedule_assignments")
    .select("employee_id,effective_start_date,effective_end_date,is_superseded")
    .in("employee_id", employeeIds)
    .eq("is_superseded", false);
  if (error) throw new Error("Unable to preview schedule assignments.");
  const rows = data ?? [];
  const endingEmployees = new Set(rows.filter((item) =>
    item.effective_start_date < startDate
      && (!item.effective_end_date || item.effective_end_date >= startDate)
  ).map((item) => item.employee_id));
  const superseding = rows.filter((item) => item.effective_start_date >= startDate).length;
  return {
    ending: endingEmployees.size,
    superseding,
    unassigned: employeeIds.filter((id) => !rows.some((item) => item.employee_id === id)).length,
  };
}
```

- [ ] **Step 4: Run focused tests**

```bash
npm test -- src/features/schedules/actions.test.ts \
  src/features/schedules/queries.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(dashboard)/settings/work-schedules/actions.ts' \
  src/features/schedules/queries.ts \
  src/features/schedules/actions.test.ts \
  src/features/schedules/queries.test.ts
git commit -m "feat: add schedule assignment actions"
```

---

### Task 8: Add individual and bulk assignment interfaces

**Files:**
- Create: `src/components/schedules/individual-assignment-form.tsx`
- Create: `src/components/schedules/bulk-assignment-form.tsx`
- Create: `src/app/(dashboard)/settings/work-schedules/assign/page.tsx`
- Create: `src/app/(dashboard)/settings/work-schedules/assign/bulk/page.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes Task 7 actions and query helpers.
- Individual form submits exactly one `employee_ids` value.
- Bulk form submits one or more `employee_ids` values in one RPC call.

- [ ] **Step 1: Create individual assignment form**

Create `individual-assignment-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import type { ScheduleActionState, ScheduleEmployeeOption } from "@/features/schedules/types";

export function IndividualAssignmentForm({
  action,
  employees,
  schedules,
  defaultEmployeeId = "",
  companyDate,
}: {
  action: (state: ScheduleActionState, formData: FormData) => Promise<ScheduleActionState>;
  employees: ScheduleEmployeeOption[];
  schedules: Array<{ id: string; code: string; name: string }>;
  defaultEmployeeId?: string;
  companyDate: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return <form action={formAction} className="card form-card schedule-form"><div className="form-grid"><label><span>Employee</span><select className="field" name="employee_ids" defaultValue={defaultEmployeeId} required><option value="">Select employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.last_name}, {employee.first_name} · {employee.employee_number}</option>)}</select></label><label><span>Schedule</span><select className="field" name="schedule_template_id" required><option value="">Select schedule</option>{schedules.map((schedule) => <option key={schedule.id} value={schedule.id}>{schedule.code} · {schedule.name}</option>)}</select></label><label><span>Effective start</span><input className="field" type="date" name="effective_start_date" defaultValue={companyDate} required /></label><label><span>Effective end <span className="muted">(optional)</span></span><input className="field" type="date" name="effective_end_date" /></label><label className="full"><span>Assignment reason <span className="muted">(required when backdated)</span></span><textarea className="field" name="assignment_reason" maxLength={1000} rows={4} /></label></div>{state.error && <p className="form-error">{state.error}</p>}<div className="confirmation-note">The preceding assignment will end the day before this start date. Future assignments on or after this date will be superseded.</div><button className="btn primary" disabled={pending}>{pending ? "Assigning…" : "Assign schedule"}</button></form>;
}
```

- [ ] **Step 2: Create searchable bulk assignment form**

Create `bulk-assignment-form.tsx` with local search, department filter, Select all visible, Clear selection, and selected count. It must render one checkbox per employee:

```tsx
<input
  type="checkbox"
  name="employee_ids"
  value={employee.id}
  checked={selected.includes(employee.id)}
  onChange={() => toggle(employee.id)}
/>
```

The submit form must include schedule, effective dates, private reason, and this confirmation text:

```text
This operation is all-or-nothing. Current assignments will end and future assignments on or after the selected start date will be superseded for every selected employee.
```

- [ ] **Step 3: Create both routes**

Individual page:

```tsx
await requireScheduleAdmin();
const [employees, schedules] = await Promise.all([
  getEligibleScheduleEmployees(),
  getActiveScheduleOptions(),
]);
```

Bulk page uses the same data and `bulkAssignSchedule`.

Both routes use `PageHeader`, provide Back links, and show an empty warning when there are no active schedule templates.

- [ ] **Step 4: Add mobile assignment styles**

Append:

```css
.employee-selection-toolbar { display: flex; gap: 10px; flex-wrap: wrap; }
.employee-selection-list { display: grid; gap: 8px; max-height: 420px; overflow: auto; padding: 4px; }
.employee-selection-row { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 10px; align-items: center; min-height: 48px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 10px; }
.confirmation-note { border: 1px solid var(--border); border-radius: 10px; padding: 12px; background: var(--surface-2); overflow-wrap: anywhere; }
@media (max-width: 720px) { .employee-selection-toolbar > * { width: 100%; } }
```

- [ ] **Step 5: Run tests and build**

```bash
npm test
npm run build
```

Expected: PASS and both assignment routes compile.

- [ ] **Step 6: Commit**

```bash
git add 'src/app/(dashboard)/settings/work-schedules/assign' \
  src/components/schedules/individual-assignment-form.tsx \
  src/components/schedules/bulk-assignment-form.tsx \
  src/app/globals.css
git commit -m "feat: add schedule assignment UI"
```

---

### Task 9: Add HR employee schedule history and profile tab

**Files:**
- Create: `src/components/schedules/assignment-history.tsx`
- Create: `src/app/(dashboard)/employees/[id]/schedule/page.tsx`
- Modify: `src/components/employees/profile/profile-tabs.tsx`

**Interfaces:**
- HR-only route through `requireEmployeeProfileManager(id)`.
- Uses `getEmployeeScheduleAssignments(id)`.
- Adds restricted profile tab ID `schedule`.

- [ ] **Step 1: Add a failing profile-tab source assertion**

Append to `src/features/schedules/queries.test.ts`:

```ts
const tabs = await readFile(
  new URL("../../components/employees/profile/profile-tabs.tsx", import.meta.url),
  "utf8",
);

test("employee profiles expose an HR-only schedule route tab", () => {
  assert.match(tabs, /id: \"schedule\"/);
  assert.match(tabs, /\/employees\/\$\{employeeId\}\/schedule/);
});
```

Run and verify failure.

- [ ] **Step 2: Extend profile tabs**

Add:

```ts
{ id: "schedule", label: "Schedule", restricted: true, route: true },
```

and in `tabHref`:

```ts
if (tab.id === "schedule") return `/employees/${employeeId}/schedule`;
```

- [ ] **Step 3: Create assignment history component**

The component must render non-superseded current/upcoming/history and superseded rows with explicit labels. It receives:

```ts
{
  assignments: EmployeeScheduleAssignment[];
  companyDate: string;
  showReasons: boolean;
}
```

Every row displays template code/name, start, end, state, assigned-by name, and reason only when `showReasons` is true.

- [ ] **Step 4: Create the employee schedule page**

Core route:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { AssignmentHistory } from "@/components/schedules/assignment-history";
import { ProfileTabs } from "@/components/employees/profile/profile-tabs";
import { PageHeader } from "@/components/page-header";
import { companyDateAt } from "@/features/attendance/time";
import { requireEmployeeProfileManager } from "@/features/employees/auth";
import { getEmployee } from "@/features/employees/queries";
import { getEmployeeScheduleAssignments } from "@/features/schedules/queries";

export default async function EmployeeSchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireEmployeeProfileManager(id);
  const [employee, assignments] = await Promise.all([
    getEmployee(id),
    getEmployeeScheduleAssignments(id),
  ]);
  if (!employee) notFound();
  return <><PageHeader title={`${employee.first_name} ${employee.last_name} · Schedule`} description="Current, upcoming, previous, and superseded schedule assignments." action={<Link className="btn primary" href={`/settings/work-schedules/assign?employee=${id}`}>Assign new schedule</Link>} /><ProfileTabs employeeId={id} active="schedule" canManage /><AssignmentHistory assignments={assignments} companyDate={companyDateAt()} showReasons /></>;
}
```

- [ ] **Step 5: Run focused test and build**

```bash
npm test -- src/features/schedules/queries.test.ts
npm run build
```

Expected: PASS and `/employees/[id]/schedule` compiles.

- [ ] **Step 6: Commit**

```bash
git add src/components/employees/profile/profile-tabs.tsx \
  src/components/schedules/assignment-history.tsx \
  'src/app/(dashboard)/employees/[id]/schedule/page.tsx' \
  src/features/schedules/queries.test.ts
git commit -m "feat: add employee schedule history"
```

---

### Task 10: Add employee self-service schedule resolution and My Schedule page

**Files:**
- Modify: `supabase/migrations/202607140004_work_schedules.sql`
- Modify: `src/features/schedules/queries.ts`
- Modify: `src/features/schedules/queries.test.ts`
- Create: `src/components/schedules/my-schedule-card.tsx`
- Create: `src/app/(dashboard)/my-schedule/page.tsx`

**Interfaces:**
- Produces `getResolvedEmployeeSchedule(employeeId, companyDate?)`.
- Employee route calls `requireOwnScheduleEmployee()` before querying.

- [ ] **Step 1: Add failing resolution-query assertions**

Append:

```ts
test("self-service resolution uses a protected safe-projection RPC", () => {
  assert.match(source, /getResolvedEmployeeSchedule/);
  assert.match(source, /rpc\("get_my_schedule"/);
  assert.doesNotMatch(source, /getResolvedEmployeeSchedule[\s\S]+assignment_reason/);
  assert.doesNotMatch(source, /getResolvedEmployeeSchedule[\s\S]+change_reason/);
});
```

- [ ] **Step 2: Add a safe employee schedule RPC to the migration**

Insert before migration finalization:

```sql
create or replace function public.get_my_schedule(
  p_company_date date default public.company_attendance_date(now())
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_employee_id uuid;
  v_assignment public.employee_schedule_assignments%rowtype;
  v_upcoming public.employee_schedule_assignments%rowtype;
  v_template public.work_schedule_templates%rowtype;
  v_upcoming_template public.work_schedule_templates%rowtype;
  v_version public.work_schedule_versions%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  select id into v_employee_id
  from public.employees
  where profile_id = v_actor
    and archived_at is null;
  if not found then
    raise exception using errcode = 'P0001', message = 'ACTIVE_EMPLOYEE_NOT_FOUND';
  end if;

  select * into v_assignment
  from public.employee_schedule_assignments
  where employee_id = v_employee_id
    and not is_superseded
    and effective_start_date <= p_company_date
    and (effective_end_date is null or effective_end_date >= p_company_date)
  order by effective_start_date desc, id desc
  limit 1;

  select * into v_upcoming
  from public.employee_schedule_assignments
  where employee_id = v_employee_id
    and not is_superseded
    and effective_start_date > p_company_date
  order by effective_start_date, id
  limit 1;

  if v_assignment.id is not null then
    select * into v_template
    from public.work_schedule_templates
    where id = v_assignment.schedule_template_id;

    select * into v_version
    from public.work_schedule_versions
    where schedule_template_id = v_assignment.schedule_template_id
      and effective_date <= p_company_date
    order by effective_date desc, id desc
    limit 1;
  end if;

  if v_upcoming.id is not null then
    select * into v_upcoming_template
    from public.work_schedule_templates
    where id = v_upcoming.schedule_template_id;
  end if;

  return jsonb_build_object(
    'companyDate', p_company_date,
    'assignment', case when v_assignment.id is null then null else jsonb_build_object(
      'id', v_assignment.id,
      'employee_id', v_assignment.employee_id,
      'schedule_template_id', v_assignment.schedule_template_id,
      'effective_start_date', v_assignment.effective_start_date,
      'effective_end_date', v_assignment.effective_end_date,
      'is_superseded', false,
      'template', jsonb_build_object(
        'id', v_template.id,
        'code', v_template.code,
        'name', v_template.name,
        'is_archived', v_template.is_archived
      )
    ) end,
    'version', case when v_version.id is null then null else jsonb_build_object(
      'id', v_version.id,
      'schedule_template_id', v_version.schedule_template_id,
      'effective_date', v_version.effective_date,
      'working_days', v_version.working_days,
      'start_time', v_version.start_time,
      'end_time', v_version.end_time,
      'break_minutes', v_version.break_minutes
    ) end,
    'upcomingAssignment', case when v_upcoming.id is null then null else jsonb_build_object(
      'id', v_upcoming.id,
      'employee_id', v_upcoming.employee_id,
      'schedule_template_id', v_upcoming.schedule_template_id,
      'effective_start_date', v_upcoming.effective_start_date,
      'effective_end_date', v_upcoming.effective_end_date,
      'is_superseded', false,
      'template', jsonb_build_object(
        'id', v_upcoming_template.id,
        'code', v_upcoming_template.code,
        'name', v_upcoming_template.name,
        'is_archived', v_upcoming_template.is_archived
      )
    ) end
  );
end;
$$;

revoke all on function public.get_my_schedule(date) from public, anon;
grant execute on function public.get_my_schedule(date) to authenticated;
```

This RPC intentionally excludes template descriptions, version reasons, assignment reasons, and creator metadata.

- [ ] **Step 3: Implement the resolved schedule query**

Append to `queries.ts`:

```ts
import { resolveScheduleState, weekdayForCompanyDate } from "./resolution";
import type {
  EmployeeScheduleAssignmentSummary,
  ResolvedEmployeeSchedule,
} from "./types";

export async function getResolvedEmployeeSchedule(
  _employeeId: string,
  companyDate = companyDateAt(),
): Promise<ResolvedEmployeeSchedule> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_schedule", {
    p_company_date: companyDate,
  });
  if (error) throw new Error("Unable to load the employee schedule.");

  const payload = (data ?? {}) as Record<string, unknown>;
  const assignment = (payload.assignment ?? null) as EmployeeScheduleAssignmentSummary | null;
  const version = (payload.version ?? null) as ScheduleVersionRecord | null;
  const upcomingAssignment = (payload.upcomingAssignment ?? null) as EmployeeScheduleAssignmentSummary | null;

  return {
    companyDate,
    state: resolveScheduleState(companyDate, assignment, version),
    assignment,
    template: assignment?.template ?? null,
    version,
    weekday: weekdayForCompanyDate(companyDate),
    upcomingAssignment,
  };
}
```

The `_employeeId` parameter remains in the TypeScript interface so existing attendance callers do not change, but the RPC derives the employee from `auth.uid()` and never trusts a caller-supplied employee ID.

- [ ] **Step 4: Create employee schedule card and page**

`MyScheduleCard` must render all five states from the specification. For scheduled and rest-day states, use `ScheduleSummary`. For an upcoming assignment, display its template name and effective date.

Create `/my-schedule/page.tsx`:

```tsx
import { MyScheduleCard } from "@/components/schedules/my-schedule-card";
import { PageHeader } from "@/components/page-header";
import { requireOwnScheduleEmployee } from "@/features/schedules/auth";
import { getResolvedEmployeeSchedule } from "@/features/schedules/queries";

export default async function MySchedulePage() {
  const { employee } = await requireOwnScheduleEmployee();
  const schedule = await getResolvedEmployeeSchedule(employee.id);
  return <><PageHeader title="My Schedule" description="Your current work schedule and upcoming changes." /><MyScheduleCard schedule={schedule} /></>;
}
```

- [ ] **Step 5: Run tests and build**

```bash
npm test -- src/features/schedules/queries.test.ts \
  src/features/schedules/resolution.test.ts
npm run build
```

Expected: PASS and `/my-schedule` compiles.

- [ ] **Step 6: Commit**

```bash
git add src/features/schedules/queries.ts \
  src/features/schedules/queries.test.ts \
  src/components/schedules/my-schedule-card.tsx \
  'src/app/(dashboard)/my-schedule/page.tsx'
git commit -m "feat: add employee schedule self service"
```

---

### Task 11: Integrate schedule state into attendance and dashboard cards

**Files:**
- Modify: `src/features/attendance/types.ts`
- Modify: `src/features/attendance/queries.ts`
- Modify: `src/features/attendance/queries.test.ts`
- Modify: `src/components/attendance/attendance-clock-card.tsx`
- Modify: `src/app/(dashboard)/attendance/page.tsx`
- Modify: `src/app/(dashboard)/dashboard/page.tsx`

**Interfaces:**
- Extends `TodayAttendanceContext` with `schedule: ResolvedEmployeeSchedule`.
- `getTodayAttendanceContext()` loads schedule information without changing clock rules.

- [ ] **Step 1: Add failing attendance integration tests**

Append to `src/features/attendance/queries.test.ts`:

```ts
test("today attendance context resolves schedule information without changing clock rules", () => {
  assert.match(source, /getResolvedEmployeeSchedule/);
  assert.match(source, /schedule:/);
  assert.doesNotMatch(source, /late|undertime|overtime/i);
});
```

- [ ] **Step 2: Extend attendance context type**

In `attendance/types.ts`:

```ts
import type { ResolvedEmployeeSchedule } from "@/features/schedules/types";

export type TodayAttendanceContext = {
  companyDate: string;
  employee: AttendanceEmployeeSummary;
  todayRecord: AttendanceRecord | null;
  previousOpenRecord: AttendanceRecord | null;
  schedule: ResolvedEmployeeSchedule;
};
```

- [ ] **Step 3: Resolve schedule in the context query**

Import `getResolvedEmployeeSchedule` and add it to the existing `Promise.all`:

```ts
const [todayResult, previousResult, schedule] = await Promise.all([
  // existing today query
  // existing previous-open query
  getResolvedEmployeeSchedule(employee.id, companyDate),
]);
```

Return `schedule` with the existing values.

- [ ] **Step 4: Add schedule presentation to the clock card**

Below the timezone line, render:

```tsx
<div className="attendance-schedule-summary">
  {context.schedule.state === "scheduled_workday" && context.schedule.version && (
    <p><strong>Scheduled today:</strong> {context.schedule.version.start_time.slice(0, 5)}–{context.schedule.version.end_time.slice(0, 5)}</p>
  )}
  {context.schedule.state === "rest_day" && <p><strong>Rest day</strong> under your assigned schedule.</p>}
  {context.schedule.state === "unassigned" && <p><strong>Unassigned schedule.</strong> You may still clock in and out.</p>}
  {context.schedule.state === "unavailable" && <p className="form-error">Schedule information is temporarily unavailable.</p>}
  <Link href="/my-schedule">View my schedule</Link>
</div>
```

Do not disable either clock action based on schedule state.

- [ ] **Step 5: Run attendance and schedule tests, then build**

```bash
npm test -- src/features/attendance/queries.test.ts \
  src/features/schedules/queries.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/attendance \
  src/components/attendance/attendance-clock-card.tsx \
  'src/app/(dashboard)/attendance/page.tsx' \
  'src/app/(dashboard)/dashboard/page.tsx'
git commit -m "feat: show schedules in attendance"
```

---

### Task 12: Add schedule audit presentation and activity filter coverage

**Files:**
- Modify: `src/features/employees/audit/types.ts`
- Modify: `src/features/employees/audit/presentation.ts`
- Modify: `src/features/employees/audit/presentation.test.ts`
- Modify: `src/app/(dashboard)/employees/[id]/activity/page.tsx`

**Interfaces:**
- `EmployeeAuditEntry.employee_id` becomes `string | null`.
- Adds schedule assignment events to the employee Activity timeline.
- Organization-level template/version rows remain outside employee activity queries.

- [ ] **Step 1: Write failing presentation tests**

Append:

```ts
test("schedule assignments use readable safe titles and dates", () => {
  const entry = {
    id: "audit",
    employee_id: "employee",
    actor_profile_id: null,
    action: "schedule_assignment.created",
    entity_type: "schedule_assignment",
    entity_id: "assignment",
    changed_fields: ["schedule_template_id", "effective_start_date", "effective_end_date"],
    before_values: {},
    after_values: {
      schedule_template_id: "template",
      effective_start_date: "2026-08-01",
      effective_end_date: null,
    },
    metadata: {},
    source: "application",
    created_at: "2026-07-14T00:00:00Z",
    actor: null,
  } as const;
  const result = describeAuditEntry(entry);
  assert.equal(result.title, "Schedule assigned");
  assert.match(result.detail ?? "", /Effective start date/);
});
```

- [ ] **Step 2: Update audit contracts and mappings**

In `types.ts`:

```ts
employee_id: string | null;
```

Add an activity filter:

```ts
"schedule"
```

and map:

```ts
schedule: ["schedule_assignment"],
```

In presentation mappings add:

```ts
"schedule_template.created": "Schedule template created",
"schedule_template.updated": "Schedule template updated",
"schedule_template.archived": "Schedule template archived",
"schedule_template.restored": "Schedule template restored",
"schedule_version.created": "Schedule version created",
"schedule_assignment.created": "Schedule assigned",
"schedule_assignment.ended": "Previous schedule ended",
"schedule_assignment.superseded": "Future schedule superseded",
```

Field labels:

```ts
schedule_template_id: "Schedule",
effective_date: "Effective date",
working_days: "Working days",
start_time: "Start time",
end_time: "End time",
break_minutes: "Break minutes",
effective_start_date: "Effective start date",
effective_end_date: "Effective end date",
is_superseded: "Superseded",
```

Add `schedule_assignment` to safe before/after entity types and safe fields. Do not add description or reason fields.

In `src/app/(dashboard)/employees/[id]/activity/page.tsx`, extend the exhaustive label map:

```ts
schedule: "Schedule",
```

- [ ] **Step 3: Run audit tests**

```bash
npm test -- src/features/employees/audit/presentation.test.ts \
  src/features/employees/audit/security.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/employees/audit
git commit -m "feat: add schedule audit presentation"
```

---

### Task 13: Add navigation, settings entry points, and route-security tests

**Files:**
- Modify: `src/components/sidebar.tsx`
- Modify: `src/app/(dashboard)/settings/page.tsx`
- Create: `src/features/schedules/security.test.ts`
- Modify: `src/app/globals.css`

**Interfaces:**
- Employees receive `/my-schedule` navigation.
- HR/Super Admin receive both `/my-schedule` and `/settings/work-schedules` access.
- Management routes authorize before data reads.

- [ ] **Step 1: Write security/navigation tests**

Create `src/features/schedules/security.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sidebar = await readFile(
  new URL("../../components/sidebar.tsx", import.meta.url),
  "utf8",
);
const managementPage = await readFile(
  new URL("../../app/(dashboard)/settings/work-schedules/page.tsx", import.meta.url),
  "utf8",
);
const selfPage = await readFile(
  new URL("../../app/(dashboard)/my-schedule/page.tsx", import.meta.url),
  "utf8",
);
const migration = await readFile(
  new URL("../../../supabase/migrations/202607140004_work_schedules.sql", import.meta.url),
  "utf8",
);

test("navigation exposes My Schedule and HR work schedule management", () => {
  assert.match(sidebar, /\/my-schedule/);
  assert.match(sidebar, /\/settings\/work-schedules/);
});

test("management and self-service routes authorize before queries", () => {
  assert.ok(managementPage.indexOf("requireScheduleAdmin") < managementPage.indexOf("getScheduleTemplates"));
  assert.ok(selfPage.indexOf("requireOwnScheduleEmployee") < selfPage.indexOf("getResolvedEmployeeSchedule"));
});

test("employees have no base schedule table policy and no permanent delete workflow", () => {
  assert.doesNotMatch(migration, /Employees view (own|referenced) schedule/i);
  assert.match(migration, /create or replace function public\.get_my_schedule/i);
  assert.doesNotMatch(migration, /for delete to authenticated/i);
  assert.doesNotMatch(migration, /for insert to authenticated/i);
  assert.doesNotMatch(migration, /for update to authenticated/i);
});

test("audit calls exclude schedule descriptions and private reasons", () => {
  assert.doesNotMatch(
    migration,
    /write_employee_audit\([^;]+(description|change_reason|assignment_reason)/is,
  );
});
```

- [ ] **Step 2: Extend role-aware sidebar items**

Import `CalendarRange`. Define:

```ts
const scheduleItems: readonly NavigationItem[] = role === "hr_admin" || role === "super_admin"
  ? [
      ["/my-schedule", "My Schedule", CalendarRange],
      ["/settings/work-schedules", "Work Schedules", CalendarRange],
    ] as const
  : [["/my-schedule", "My Schedule", CalendarRange]] as const;
```

Insert `...scheduleItems` after attendance items.

- [ ] **Step 3: Add a role-aware Settings card**

In `/settings/page.tsx`, load the authenticated profile role with the existing server Supabase client. Add this available settings item:

```ts
{
  href: "/settings/work-schedules",
  title: "Work schedules",
  description: "Manage reusable schedules, versions, and employee assignments.",
  icon: CalendarRange,
  status: "Available",
  restricted: true,
}
```

Add `restricted: false` to existing items, then filter before rendering:

```ts
const canManage = profile?.role === "hr_admin" || profile?.role === "super_admin";
const visibleSettings = settings.filter((item) => !item.restricted || canManage);
```

Render `visibleSettings` instead of `settings`, so Employee users do not see the management card.

- [ ] **Step 4: Run security tests and build**

```bash
npm test -- src/features/schedules/security.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar.tsx \
  'src/app/(dashboard)/settings/page.tsx' \
  src/features/schedules/security.test.ts \
  src/app/globals.css
git commit -m "feat: add schedule navigation"
```

---

### Task 14: Add documentation, comprehensive regression tests, and final verification

**Files:**
- Modify: `README.md`
- Add: `docs/superpowers/specs/2026-07-14-phase-5b1-work-schedules-design.md`
- Add: `docs/superpowers/plans/2026-07-14-phase-5b1-work-schedules.md`
- Modify schedule tests as required for complete acceptance coverage.

**Interfaces:**
- Final verification produces no implementation placeholders and no failing tests.
- Migration remains one atomic transaction ending in `notify pgrst` and `commit`.

- [ ] **Step 1: Add documentation**

README must document:

```text
Migration:
supabase/migrations/202607140004_work_schedules.sql

HR routes:
/settings/work-schedules
/settings/work-schedules/new
/settings/work-schedules/[id]
/settings/work-schedules/[id]/edit
/settings/work-schedules/[id]/versions/new
/settings/work-schedules/assign
/settings/work-schedules/assign/bulk
/employees/[id]/schedule

Employee route:
/my-schedule
```

Also document:

- Versioned schedule behavior
- Archive behavior
- Assignment superseding behavior
- Backdated reason requirements
- Unassigned employees may continue attendance
- No late/undertime/overtime calculations in Phase 5B-1
- Apply the migration before deploying application code
- No permanent schedule deletion

- [ ] **Step 2: Add final static security checks**

Extend `security.test.ts` to assert:

```ts
test("schedule reasons are never printed or stored in browser persistence", async () => {
  const actions = await readFile(
    new URL("../../app/(dashboard)/settings/work-schedules/actions.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(actions, /console\.(log|error)\([^)]*(reason|description)/is);
  assert.doesNotMatch(actions, /localStorage|sessionStorage/);
});

test("schedule versions expose no update or delete application action", async () => {
  const actions = await readFile(
    new URL("../../app/(dashboard)/settings/work-schedules/actions.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(actions, /updateScheduleVersion|deleteScheduleVersion/);
});
```

- [ ] **Step 3: Run the complete automated gate**

```bash
npm test
npx tsc --noEmit
npm run build
```

Expected:

```text
All tests pass
TypeScript exits 0
Next.js production build exits 0
```

The route output must include:

```text
/settings/work-schedules
/settings/work-schedules/new
/settings/work-schedules/[id]
/settings/work-schedules/[id]/edit
/settings/work-schedules/[id]/versions/new
/settings/work-schedules/assign
/settings/work-schedules/assign/bulk
/employees/[id]/schedule
/my-schedule
```

- [ ] **Step 4: Apply migration to the development Supabase project**

Run the complete SQL file in Supabase SQL Editor. Then verify:

```sql
select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in (
    'work_schedule_templates',
    'work_schedule_versions',
    'employee_schedule_assignments'
  );

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'create_work_schedule_template',
    'update_work_schedule_template',
    'create_work_schedule_version',
    'set_work_schedule_template_archived',
    'assign_employee_schedule',
    'bulk_assign_employee_schedule'
  )
order by routine_name;
```

- [ ] **Step 5: Run manual role and temporal QA**

```text
Super Admin / HR Admin
[ ] Create a template and first version
[ ] Edit code, name, and description
[ ] Create a future version
[ ] Confirm versions cannot be edited or deleted
[ ] Archive and restore a template
[ ] Confirm archived template cannot receive a new assignment
[ ] Assign one employee
[ ] Confirm preceding assignment ends one day earlier
[ ] Confirm future assignment is marked superseded, not deleted
[ ] Bulk assign multiple employees
[ ] Confirm one invalid employee rolls back the entire bulk operation
[ ] Confirm backdated versions and assignments require reasons

Employee
[ ] My Schedule shows only the employee’s assignment
[ ] Upcoming change appears with its effective date
[ ] Rest day is displayed correctly
[ ] Unassigned employee can still clock in and out
[ ] Employee cannot access management routes

Audit
[ ] Assignment created/ended/superseded events appear for the affected employee
[ ] Template/version events use employee_id = null
[ ] No description or private reason appears in audit JSON
[ ] No duplicate audit event is created for one mutation
```

- [ ] **Step 6: Commit**

```bash
git add README.md docs src supabase
git commit -m "feat: complete work schedules phase"
```

---

## Final acceptance checklist

```text
[ ] Three schedule tables exist with RLS enabled
[ ] Template codes normalize and remain unique
[ ] Weekly rules require at least one allowed weekday
[ ] Same-day start/end and break rules are enforced
[ ] Versions are immutable and effective-dated
[ ] Backdated versions require reasons
[ ] Archived templates remain historically resolvable
[ ] Archived templates cannot receive new assignments
[ ] Assignment ranges cannot overlap
[ ] New assignments end preceding ranges
[ ] Future ranges are retained and marked superseded
[ ] Backdated assignments require reasons
[ ] Bulk assignment is atomic
[ ] Employee schedule self-service works
[ ] HR employee schedule history works
[ ] Attendance cards show schedule state without enforcing compliance
[ ] Historical attendance is not rewritten
[ ] Employee assignment audit events use the affected employee ID
[ ] Template/version audit events use null employee ID
[ ] Audit JSON excludes descriptions and reasons
[ ] Employees use a safe schedule projection and have no direct base-table schedule access
[ ] No permanent schedule deletion exists
[ ] Full tests pass
[ ] TypeScript passes
[ ] Production build passes
```
