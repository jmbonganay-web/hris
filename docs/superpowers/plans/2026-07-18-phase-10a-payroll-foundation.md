# Phase 10A Payroll Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secure payroll foundation with configurable schedules, generated payroll periods, effective-dated compensation and payroll-schedule assignments, approval workflows, immutable audit events, notification integration, and role-appropriate administration and self-service views.

**Architecture:** PostgreSQL is the authoritative source for payroll settings, effective-dated records, approval state, period generation, lifecycle transitions, audit events, and notification creation. Next.js server modules expose typed read models and protected server actions that call narrowly scoped `SECURITY DEFINER` RPCs. The application remains single-tenant; organization-level payroll settings are represented by one singleton `payroll_settings` row rather than introducing a speculative organizations table.

**Tech Stack:** Next.js 16.2.10 App Router, React 19.1.1, TypeScript 5.9.3, Supabase PostgreSQL/Auth/RLS, PostgreSQL PL/pgSQL, `btree_gist`, `pg_cron`, Node built-in test runner, Lucide React, existing HRIS component and Balanced spacing system.

## Global Constraints

- Use the uploaded root folder name `hris-github`.
- Base Phase 10A on commit `32dfa7c` from `feature/phase-9-notifications-reminders-escalations` unless a newer verified commit is supplied before execution.
- Restore the missing forward-only Phase 9 archive-lock migration before adding Phase 10A migrations.
- Restore the Windows-compatible document security test before Phase 10A implementation.
- Do not rewrite an applied migration.
- The next Phase 10A migration is `supabase/migrations/202607180002_payroll_foundation.sql`.
- Support monthly salary and hourly rate only.
- Support weekly, biweekly, semi-monthly, and monthly payroll schedules.
- Use one configurable company currency, default `PHP`.
- Use company timezone `Asia/Manila` by default.
- Generate a rolling 12-month period horizon.
- Adjust cutoff and payment dates to the previous business day when they fall on a weekend or active configured holiday.
- Compensation and payroll-schedule changes follow Draft → Pending Approval → Approved/Rejected.
- HR Admin creates, edits, and submits drafts; Super Admin approves or rejects.
- Approved effective-dated ranges are immutable and non-overlapping.
- Backdated changes require a reason and Super Admin confirmation.
- Locked payroll periods are never silently rewritten.
- Payroll periods follow Draft → Open → Under Review → Approved → Locked.
- Only Super Admin can reopen a locked period, and a reason is mandatory.
- Reopened periods return to `under_review`.
- Employees see only their own currently effective approved compensation and current payroll schedule.
- Managers receive no direct-report compensation access; their employee role still permits viewing their own current compensation.
- Notification payloads must never contain compensation amounts, hourly rates, monthly salaries, private reasons, or unrestricted metadata.
- No gross-pay calculations, deductions, statutory contributions, payslips, bank files, or payroll exports are added in Phase 10A.
- Do not add new npm dependencies.
- Do not include `.env.local`, `.git`, `node_modules`, `.next`, `tsconfig.tsbuildinfo`, or logs in the final ZIP.
- All privileged SQL functions use `SECURITY DEFINER`, `set search_path = pg_catalog, public`, explicit authorization, stable error codes, row/advisory locks where required, and revoked default execution.

---

## Verified Uploaded Baseline

The uploaded ZIP contains root folder `hris-github` and currently reports:

```text
Branch: feature/phase-9-notifications-reminders-escalations
HEAD: 32dfa7c feat: complete Phase 9 notifications and escalations
Remote: https://github.com/jmbonganay-web/hris.git
Automated tests: 744 passed, 0 failed
Latest tracked migration: 202607170005_notifications_reminders_escalations.sql
```

The package also contains four source hygiene issues that must be handled before feature work:

```text
1. Missing: supabase/migrations/202607180001_fix_notification_archive_outer_join_lock.sql
2. Old: src/features/documents/security.test.ts still checks the superseded Phase 7 policy body
3. Dirty tracked artifact: h -u origin phase-5b2a-attendance-calculations differs only by CRLF line endings
4. ZIP contains .env.local, .git, node_modules, .next, and tsconfig.tsbuildinfo
```

The original extracted folder is inspection-only. Execute implementation in an isolated worktree.

## Scope Decomposition

```text
source repair and isolated branch
  -> shared payroll contracts and validation
  -> payroll database foundation and RLS
  -> compensation and assignment approval RPCs
  -> payroll period generation and transition RPCs
  -> Phase 9 notification integration
  -> typed query and normalization layer
  -> protected server actions
  -> payroll overview and navigation
  -> payroll schedule management UI
  -> payroll period UI
  -> compensation administration and self-service UI
  -> approval inbox
  -> security, regression, build, docs, and packaging
```

## File Map

### Create

```text
supabase/migrations/202607180001_fix_notification_archive_outer_join_lock.sql
supabase/migrations/202607180002_payroll_foundation.sql

src/features/payroll/constants.ts
src/features/payroll/types.ts
src/features/payroll/errors.ts
src/features/payroll/presentation.ts
src/features/payroll/presentation.test.ts
src/features/payroll/validation.ts
src/features/payroll/validation.test.ts
src/features/payroll/auth.ts
src/features/payroll/auth.test.ts
src/features/payroll/normalize.ts
src/features/payroll/queries.ts
src/features/payroll/queries.test.ts
src/features/payroll/schedules/queries.ts
src/features/payroll/schedules/queries.test.ts
src/features/payroll/periods/queries.ts
src/features/payroll/periods/queries.test.ts
src/features/payroll/compensation/queries.ts
src/features/payroll/compensation/queries.test.ts
src/features/payroll/approvals/queries.ts
src/features/payroll/approvals/queries.test.ts
src/features/payroll/migration.test.ts
src/features/payroll/security.test.ts
src/features/payroll/concurrency.test.ts
src/features/payroll/routing.test.ts
src/features/payroll/actions.test.ts
src/features/payroll/ui.test.ts
src/features/payroll/e2e.test.ts

src/components/payroll/payroll-status-badge.tsx
src/components/payroll/payroll-summary-cards.tsx
src/components/payroll/payroll-missing-setup-list.tsx
src/components/payroll/payroll-schedule-form.tsx
src/components/payroll/payroll-schedule-list.tsx
src/components/payroll/payroll-schedule-preview.tsx
src/components/payroll/payroll-period-filter-form.tsx
src/components/payroll/payroll-period-list.tsx
src/components/payroll/payroll-period-detail.tsx
src/components/payroll/payroll-period-actions.tsx
src/components/payroll/compensation-summary.tsx
src/components/payroll/compensation-form.tsx
src/components/payroll/compensation-history.tsx
src/components/payroll/schedule-assignment-form.tsx
src/components/payroll/schedule-assignment-history.tsx
src/components/payroll/payroll-approval-list.tsx
src/components/payroll/payroll-approval-card.tsx
src/components/payroll/payroll-audit-timeline.tsx

src/app/(dashboard)/payroll/page.tsx
src/app/(dashboard)/payroll/loading.tsx
src/app/(dashboard)/payroll/error.tsx
src/app/(dashboard)/payroll/actions.ts
src/app/(dashboard)/payroll/schedules/page.tsx
src/app/(dashboard)/payroll/schedules/new/page.tsx
src/app/(dashboard)/payroll/schedules/[scheduleId]/page.tsx
src/app/(dashboard)/payroll/schedules/actions.ts
src/app/(dashboard)/payroll/periods/page.tsx
src/app/(dashboard)/payroll/periods/[periodId]/page.tsx
src/app/(dashboard)/payroll/periods/actions.ts
src/app/(dashboard)/payroll/approvals/page.tsx
src/app/(dashboard)/payroll/approvals/actions.ts
src/app/(dashboard)/employees/[id]/compensation/page.tsx
src/app/(dashboard)/employees/[id]/compensation/new/page.tsx
src/app/(dashboard)/employees/[id]/compensation/[recordId]/page.tsx
src/app/(dashboard)/employees/[id]/compensation/actions.ts
src/app/(dashboard)/me/compensation/page.tsx
```

### Modify

```text
src/features/documents/security.test.ts
src/components/sidebar.tsx
src/app/(dashboard)/employees/[id]/page.tsx
src/app/(dashboard)/settings/page.tsx
src/app/globals.css
src/features/build-config.test.ts
src/features/layout/balanced-spacing.test.ts
README.md
.env.example
docs/superpowers/specs/2026-07-18-phase-10a-payroll-foundation-design.md
```

## Shared Public Contracts

Create these exact unions first so SQL normalization, server actions, and UI consume one source of truth:

```ts
export const payrollScheduleTypeValues = [
  "weekly",
  "biweekly",
  "semi_monthly",
  "monthly",
] as const;
export type PayrollScheduleType = (typeof payrollScheduleTypeValues)[number];

export const payrollPeriodStatusValues = [
  "draft",
  "open",
  "under_review",
  "approved",
  "locked",
] as const;
export type PayrollPeriodStatus = (typeof payrollPeriodStatusValues)[number];

export const compensationTypeValues = ["monthly", "hourly"] as const;
export type CompensationType = (typeof compensationTypeValues)[number];

export const payrollRequestStatusValues = [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "superseded",
  "cancelled",
] as const;
export type PayrollRequestStatus = (typeof payrollRequestStatusValues)[number];

export const payrollBusinessDayAdjustmentValues = ["previous"] as const;
export type PayrollBusinessDayAdjustment =
  (typeof payrollBusinessDayAdjustmentValues)[number];
```

Protected RPC names are fixed:

```text
get_payroll_overview
list_payroll_schedules
get_payroll_schedule_detail
preview_payroll_schedule_periods
create_payroll_schedule
update_payroll_schedule
set_payroll_schedule_active
ensure_payroll_period_horizon
list_payroll_periods
get_payroll_period_detail
transition_payroll_period
reopen_payroll_period
get_employee_compensation_admin
get_own_compensation
create_compensation_draft
update_compensation_draft
submit_compensation_record
approve_compensation_record
reject_compensation_record
create_schedule_assignment_draft
update_schedule_assignment_draft
submit_schedule_assignment
approve_schedule_assignment
reject_schedule_assignment
list_payroll_approvals
```

Stable SQL error codes are fixed:

```text
PAYROLL_PERMISSION_DENIED
PAYROLL_SETTINGS_INVALID
PAYROLL_SCHEDULE_NOT_FOUND
PAYROLL_SCHEDULE_INVALID
PAYROLL_SCHEDULE_IN_USE
PAYROLL_PERIOD_NOT_FOUND
PAYROLL_PERIOD_TRANSITION_INVALID
PAYROLL_PERIOD_VERSION_CONFLICT
PAYROLL_PERIOD_REOPEN_REASON_REQUIRED
PAYROLL_COMPENSATION_NOT_FOUND
PAYROLL_COMPENSATION_INVALID
PAYROLL_COMPENSATION_OVERLAP
PAYROLL_COMPENSATION_IMMUTABLE
PAYROLL_BACKDATED_REASON_REQUIRED
PAYROLL_ASSIGNMENT_NOT_FOUND
PAYROLL_ASSIGNMENT_INVALID
PAYROLL_ASSIGNMENT_OVERLAP
PAYROLL_ASSIGNMENT_MID_PERIOD
PAYROLL_REQUEST_STATE_INVALID
PAYROLL_REQUEST_VERSION_CONFLICT
PAYROLL_GENERATION_ALREADY_RUNNING
PAYROLL_GENERATION_FAILED
```

---

### Task 0: Isolated worktree and Phase 9 source repair

**Files:**
- Create: `supabase/migrations/202607180001_fix_notification_archive_outer_join_lock.sql`
- Modify: `src/features/documents/security.test.ts`
- Create: `docs/superpowers/specs/2026-07-18-phase-10a-payroll-foundation-design.md`
- Create: `docs/superpowers/plans/2026-07-18-phase-10a-payroll-foundation.md`

**Interfaces:**
- Consumes: uploaded branch `feature/phase-9-notifications-reminders-escalations` at `32dfa7c`.
- Produces: clean branch `feature/phase-10a-payroll-foundation` with the verified Phase 9 database patch and Windows-compatible regression test.

- [ ] **Step 1: Create the isolated worktree**

```bash
cd /mnt/data/hris-github
git worktree add -b feature/phase-10a-payroll-foundation \
  /mnt/data/hris-github-phase-10a 32dfa7c
cd /mnt/data/hris-github-phase-10a
```

Expected:

```text
Preparing worktree (new branch 'feature/phase-10a-payroll-foundation')
HEAD is now at 32dfa7c feat: complete Phase 9 notifications and escalations
```

- [ ] **Step 2: Restore the tested Phase 9 archive-lock migration**

Copy `/mnt/data/202607180001_fix_notification_archive_outer_join_lock.sql` to:

```text
supabase/migrations/202607180001_fix_notification_archive_outer_join_lock.sql
```

The function body must contain:

```sql
from public.notifications as n
left join public.notification_rules as rule
  on rule.type_code = n.type
where n.status = 'resolved'
  and n.resolved_at is not null
  and n.resolved_at <
    now() - make_interval(days => coalesce(rule.retention_days, 90))
for update of n
```

- [ ] **Step 3: Restore the effective-policy document security test**

Replace `src/features/documents/security.test.ts` with the verified file `/mnt/data/security.test.fixed.ts` and confirm it reads both:

```ts
const sql = await readFile(
  new URL(
    "../../../supabase/migrations/202607170001_employee_document_management.sql",
    import.meta.url,
  ),
  "utf8",
);

const categoryPolicyPatch = await readFile(
  new URL(
    "../../../supabase/migrations/202607170002_fix_document_category_policy_recursion.sql",
    import.meta.url,
  ),
  "utf8",
);
```

The effective policy assertion must match `public.current_employee_id()` and `document_category_allows_employee_document_access`, not `e.profile_id = auth.uid()`.

- [ ] **Step 4: Copy the approved spec and this plan into the worktree**

```bash
cp /mnt/data/2026-07-18-phase-10a-payroll-foundation-design.md \
  docs/superpowers/specs/2026-07-18-phase-10a-payroll-foundation-design.md
cp /mnt/data/hris-github/docs/superpowers/plans/2026-07-18-phase-10a-payroll-foundation.md \
  docs/superpowers/plans/2026-07-18-phase-10a-payroll-foundation.md
```

- [ ] **Step 5: Run the repaired baseline**

```bash
npm test
npx tsc --noEmit
npm run build
```

Expected:

```text
744 tests passed
TypeScript exits 0
Next.js production build exits 0
```

- [ ] **Step 6: Commit the source repair and planning documents**

```bash
git add \
  supabase/migrations/202607180001_fix_notification_archive_outer_join_lock.sql \
  src/features/documents/security.test.ts \
  docs/superpowers/specs/2026-07-18-phase-10a-payroll-foundation-design.md \
  docs/superpowers/plans/2026-07-18-phase-10a-payroll-foundation.md
git commit -m "fix: restore verified Phase 9 notification patch"
```

---

### Task 1: Payroll contracts, formatting, validation, and authorization

**Files:**
- Create: `src/features/payroll/constants.ts`
- Create: `src/features/payroll/types.ts`
- Create: `src/features/payroll/errors.ts`
- Create: `src/features/payroll/presentation.ts`
- Create: `src/features/payroll/presentation.test.ts`
- Create: `src/features/payroll/validation.ts`
- Create: `src/features/payroll/validation.test.ts`
- Create: `src/features/payroll/auth.ts`
- Create: `src/features/payroll/auth.test.ts`

**Interfaces:**
- Consumes: `AppRole`, `requireUser`, `requireHrAdmin`, and `requireSuperAdmin` from `src/features/employees`.
- Produces: all payroll unions, form inputs, action state, filter types, role predicates, labels, currency formatting, and validation functions used by Tasks 6–11.

- [ ] **Step 1: Write failing contract and validation tests**

Create tests for these exact behaviors:

```ts
assert.deepEqual(payrollScheduleTypeValues, [
  "weekly",
  "biweekly",
  "semi_monthly",
  "monthly",
]);
assert.equal(formatPayrollMoney(125000, "PHP"), "₱125,000.00");
assert.equal(payrollPeriodStatusLabel("under_review"), "Under review");
assert.equal(canManagePayroll("hr_admin"), true);
assert.equal(canApprovePayroll("hr_admin"), false);
assert.equal(canApprovePayroll("super_admin"), true);
```

Validation tests must cover:

```ts
validatePayrollScheduleInput({
  name: "Semi-monthly payroll",
  code: "SM",
  scheduleType: "semi_monthly",
  anchorDate: null,
  firstPeriodEndDay: 15,
  cutoffOffsetDays: 0,
  paymentOffsetDays: 5,
}).data?.code === "SM"

validateCompensationInput({
  compensationType: "monthly",
  monthlySalary: "45000",
  hourlyRate: "",
  standardHoursPerDay: "8",
  standardHoursPerWeek: "40",
  effectiveFrom: "2026-08-01",
  changeReason: "Annual review",
}).data?.monthlySalary === 45000
```

Reject:

```text
monthly with hourlyRate populated
hourly with monthlySalary populated
non-positive compensation
weekly hours lower than daily hours
missing effective date
backdated request without reason
mid-period override without override reason
invalid UUID or expected version below 1
```

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/payroll/presentation.test.ts \
  src/features/payroll/validation.test.ts \
  src/features/payroll/auth.test.ts
```

Expected: failure because payroll modules do not exist.

- [ ] **Step 3: Implement shared contracts**

`src/features/payroll/types.ts` must export:

```ts
export type PayrollActionState = {
  error?: string;
  success?: string;
  correlationId?: string;
  fieldErrors?: Record<string, string>;
};

export type PayrollScheduleInput = {
  name: string;
  code: string;
  scheduleType: PayrollScheduleType;
  anchorDate: string | null;
  firstPeriodEndDay: number | null;
  cutoffOffsetDays: number;
  paymentOffsetDays: number;
};

export type CompensationInput = {
  compensationType: CompensationType;
  monthlySalary: number | null;
  hourlyRate: number | null;
  standardHoursPerDay: number;
  standardHoursPerWeek: number;
  effectiveFrom: string;
  changeReason: string;
  expectedVersion?: number;
};

export type ScheduleAssignmentInput = {
  payrollScheduleId: string;
  effectiveFrom: string;
  changeReason: string;
  overrideMidPeriod: boolean;
  overrideReason: string | null;
  expectedVersion?: number;
};
```

Also define normalized list/detail models for settings, schedules, periods, compensation records, assignments, approvals, and audit events. Use camelCase properties and ISO date strings.

- [ ] **Step 4: Implement presentation and stable error mapping**

`mapPayrollError` maps each fixed SQL code to a safe user message. Unknown errors return:

```text
The payroll request could not be completed. Please try again.
```

`formatPayrollMoney` must use:

```ts
new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(amount)
```

- [ ] **Step 5: Implement validation and auth helpers**

Authorization predicates:

```ts
export function canViewPayrollAdministration(role: AppRole) {
  return role === "hr_admin" || role === "super_admin";
}

export function canManagePayroll(role: AppRole) {
  return role === "hr_admin" || role === "super_admin";
}

export function canApprovePayroll(role: AppRole) {
  return role === "super_admin";
}
```

Server guards:

```ts
export async function requirePayrollAdministrator() {
  return requireHrAdmin();
}

export async function requirePayrollApprover() {
  return requireSuperAdmin();
}
```

- [ ] **Step 6: Run focused tests and commit**

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/payroll/presentation.test.ts \
  src/features/payroll/validation.test.ts \
  src/features/payroll/auth.test.ts
git add src/features/payroll
git commit -m "feat: add payroll contracts and validation"
```

---

### Task 2: Payroll database tables, constraints, audit events, and RLS

**Files:**
- Create: `supabase/migrations/202607180002_payroll_foundation.sql`
- Create: `src/features/payroll/migration.test.ts`
- Create: `src/features/payroll/security.test.ts`
- Create: `src/features/payroll/concurrency.test.ts`

**Interfaces:**
- Consumes: `public.app_role`, `public.current_employee_id()`, `public.is_hr_admin()`, `public.is_super_admin()`, `public.resolve_active_holiday(date)`, Phase 9 `notifications`, and `public.upsert_safe_notification`.
- Produces: payroll singleton settings, schedule/period/compensation/assignment/event tables, indexes, constraints, RLS, internal audit writers, and immutable guards.

- [ ] **Step 1: Write failing migration/security tests**

Tests must assert the migration creates:

```text
payroll_settings
payroll_schedules
payroll_periods
employee_compensation_records
employee_payroll_schedule_assignments
payroll_period_events
compensation_events
```

Tests must also assert:

```text
RLS enabled on every payroll table
no direct authenticated INSERT/UPDATE/DELETE grants on authoritative tables
approved compensation and assignments use daterange overlap protection
approved and superseded records are immutable
period and compensation event tables are immutable
employee select policy uses public.current_employee_id()
manager/direct-report access is absent
privileged helpers use pg_catalog, public search path
```

- [ ] **Step 2: Run migration tests and confirm failure**

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/payroll/migration.test.ts \
  src/features/payroll/security.test.ts \
  src/features/payroll/concurrency.test.ts
```

- [ ] **Step 3: Add enums and singleton settings**

Create PostgreSQL enums idempotently:

```sql
payroll_schedule_type: weekly, biweekly, semi_monthly, monthly
payroll_period_status: draft, open, under_review, approved, locked
compensation_type: monthly, hourly
payroll_request_status: draft, pending_approval, approved, rejected, superseded, cancelled
payroll_period_event_type: generated, opened, submitted_for_review, returned_to_open, approved, locked, reopened, date_adjusted
compensation_event_type: draft_created, draft_updated, submitted, approved, rejected, superseded, assignment_draft_created, assignment_draft_updated, assignment_submitted, assignment_approved, assignment_rejected, assignment_superseded
```

Create the singleton settings table:

```sql
create table public.payroll_settings (
  id smallint primary key default 1 check (id = 1),
  default_currency_code text not null default 'PHP'
    check (default_currency_code ~ '^[A-Z]{3}$'),
  payroll_timezone text not null default 'Asia/Manila',
  generation_enabled boolean not null default true,
  generation_horizon_months integer not null default 12
    check (generation_horizon_months between 1 and 24),
  version integer not null default 1 check (version >= 1),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.payroll_settings(id) values (1)
on conflict (id) do nothing;
```

- [ ] **Step 4: Add schedule and period tables**

`payroll_schedules` includes:

```sql
id uuid primary key default gen_random_uuid(),
name text not null,
code text not null,
schedule_type public.payroll_schedule_type not null,
currency_code text not null,
timezone text not null,
anchor_date date,
first_period_end_day integer,
cutoff_offset_days integer not null default 0,
payment_offset_days integer not null default 5,
business_day_adjustment text not null default 'previous'
  check (business_day_adjustment = 'previous'),
is_active boolean not null default true,
version integer not null default 1,
created_by uuid references public.profiles(id) on delete set null,
created_at timestamptz not null default now(),
updated_by uuid references public.profiles(id) on delete set null,
updated_at timestamptz not null default now(),
constraint payroll_schedule_code_format check (code ~ '^[A-Z0-9-]{2,16}$'),
constraint payroll_schedule_name_length check (char_length(btrim(name)) between 2 and 120),
constraint payroll_schedule_offsets check (
  cutoff_offset_days between -31 and 31
  and payment_offset_days between -31 and 62
),
constraint payroll_schedule_config check (
  (schedule_type in ('weekly','biweekly') and anchor_date is not null and first_period_end_day is null)
  or (schedule_type = 'semi_monthly' and anchor_date is null and first_period_end_day between 1 and 27)
  or (schedule_type = 'monthly' and anchor_date is null and first_period_end_day is null)
)
```

Create a case-insensitive unique active code index.

`payroll_periods` includes:

```sql
id uuid primary key default gen_random_uuid(),
payroll_schedule_id uuid not null references public.payroll_schedules(id) on delete restrict,
period_code text not null,
period_sequence integer not null check (period_sequence >= 1),
period_start date not null,
period_end date not null,
cutoff_date date not null,
payment_date date not null,
original_cutoff_date date not null,
original_payment_date date not null,
status public.payroll_period_status not null default 'draft',
requires_recalculation boolean not null default false,
version integer not null default 1,
opened_at timestamptz,
submitted_for_review_at timestamptz,
approved_at timestamptz,
approved_by uuid references public.profiles(id) on delete set null,
locked_at timestamptz,
locked_by uuid references public.profiles(id) on delete set null,
reopened_at timestamptz,
reopened_by uuid references public.profiles(id) on delete set null,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now(),
constraint payroll_period_date_order check (period_start <= period_end),
constraint payroll_period_schedule_dates_unique unique (payroll_schedule_id, period_start, period_end),
constraint payroll_period_code_schedule_unique unique (payroll_schedule_id, period_code)
```

- [ ] **Step 5: Add compensation and assignment tables**

Compensation amount constraint:

```sql
constraint compensation_amount_type_check check (
  (compensation_type = 'monthly' and monthly_salary > 0 and hourly_rate is null)
  or (compensation_type = 'hourly' and hourly_rate > 0 and monthly_salary is null)
)
```

Range constraints:

```sql
standard_hours_per_day numeric(5,2) not null check (standard_hours_per_day > 0 and standard_hours_per_day <= 24),
standard_hours_per_week numeric(6,2) not null check (standard_hours_per_week >= standard_hours_per_day and standard_hours_per_week <= 168),
effective_from date not null,
effective_to date,
constraint compensation_effective_order check (effective_to is null or effective_to >= effective_from)
```

Use partial GiST exclusion constraints for approved compensation and approved assignments:

```sql
exclude using gist (
  employee_id with =,
  daterange(effective_from, coalesce(effective_to + 1, 'infinity'::date), '[)') with &&
) where (status = 'approved')
```

Both tables include `version`, submit/approve/reject actor timestamps, private reason columns, and immutable approved-state guards.

- [ ] **Step 6: Add immutable audit tables and writers**

Create `payroll_period_events` and `compensation_events` with JSONB metadata constrained to objects. Add a generic immutable trigger:

```sql
create or replace function public.reject_payroll_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception 'PAYROLL_AUDIT_IMMUTABLE';
end;
$$;
```

Audit payload guards reject keys containing:

```text
monthly_salary
hourly_rate
amount
change_reason
override_reason
rejection_reason
bank
account
tax
government
service_role
access_token
```

- [ ] **Step 7: Add RLS and revoke direct writes**

Required select rules:

```sql
-- HR reads all authoritative payroll rows.
using (public.is_hr_admin())

-- Employee reads own current approved compensation only.
using (
  employee_id = public.current_employee_id()
  and status = 'approved'
  and effective_from <= public.company_attendance_date(now())
  and (effective_to is null or effective_to >= public.company_attendance_date(now()))
)

-- Employee reads own current approved assignment only.
using (
  employee_id = public.current_employee_id()
  and status = 'approved'
  and effective_from <= public.company_attendance_date(now())
  and (effective_to is null or effective_to >= public.company_attendance_date(now()))
)
```

Do not create employee policies on payroll periods, approvals, or audit tables.

- [ ] **Step 8: Run focused tests and commit**

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/payroll/migration.test.ts \
  src/features/payroll/security.test.ts \
  src/features/payroll/concurrency.test.ts
git add supabase/migrations/202607180002_payroll_foundation.sql src/features/payroll
git commit -m "feat: add payroll database foundation"
```

---

### Task 3: Compensation and payroll-assignment approval RPCs

**Files:**
- Modify: `supabase/migrations/202607180002_payroll_foundation.sql`
- Modify: `src/features/payroll/migration.test.ts`
- Modify: `src/features/payroll/security.test.ts`
- Modify: `src/features/payroll/concurrency.test.ts`

**Interfaces:**
- Consumes: Task 2 tables and audit writers.
- Produces: protected compensation and assignment CRUD/submit/approve/reject RPCs used by Tasks 7 and 10–11.

- [ ] **Step 1: Add failing RPC tests**

Tests verify:

```text
HR authorization for draft create/update/submit
Super Admin authorization for approve/reject
request state and expected-version checks
row locks on employee and request rows
approved-range overlap checks
previous approved record closure on approval
future approved record supersession when explicitly conflicting
backdated reason requirement
locked-period preservation
open/under-review periods flagged requires_recalculation
private reasons absent from audit JSON and notification payloads
```

- [ ] **Step 2: Define protected compensation functions**

Use these exact signatures:

```sql
create_compensation_draft(
  p_employee_id uuid,
  p_compensation_type public.compensation_type,
  p_monthly_salary numeric,
  p_hourly_rate numeric,
  p_standard_hours_per_day numeric,
  p_standard_hours_per_week numeric,
  p_effective_from date,
  p_change_reason text,
  p_request_id uuid
) returns uuid

update_compensation_draft(
  p_record_id uuid,
  p_expected_version integer,
  p_compensation_type public.compensation_type,
  p_monthly_salary numeric,
  p_hourly_rate numeric,
  p_standard_hours_per_day numeric,
  p_standard_hours_per_week numeric,
  p_effective_from date,
  p_change_reason text,
  p_request_id uuid
) returns integer

submit_compensation_record(
  p_record_id uuid,
  p_expected_version integer,
  p_request_id uuid
) returns integer

approve_compensation_record(
  p_record_id uuid,
  p_expected_version integer,
  p_backdated_confirmation boolean,
  p_request_id uuid
) returns integer

reject_compensation_record(
  p_record_id uuid,
  p_expected_version integer,
  p_rejection_reason text,
  p_request_id uuid
) returns integer
```

Approval algorithm:

```text
1. Require Super Admin.
2. Lock employee and request row.
3. Verify pending_approval and expected version.
4. Require backdated confirmation and stored reason when effective_from < company date.
5. Reject any approved range starting after the requested effective date that cannot be safely superseded.
6. Set the preceding approved record effective_to = effective_from - 1 and status = superseded only when its effective range is fully before the new start.
7. Mark the request approved, set approved actor/time, and increment version.
8. Flag payroll periods in open or under_review whose date range contains or follows the effective date as requires_recalculation.
9. Write safe compensation events containing field names and dates but no amounts or reasons.
10. Create a safe employee notification with action URL `/me/compensation` and no amount.
```

- [ ] **Step 3: Define protected assignment functions**

Use these exact signatures:

```sql
create_schedule_assignment_draft(
  p_employee_id uuid,
  p_payroll_schedule_id uuid,
  p_effective_from date,
  p_change_reason text,
  p_override_mid_period boolean,
  p_override_reason text,
  p_request_id uuid
) returns uuid

update_schedule_assignment_draft(
  p_assignment_id uuid,
  p_expected_version integer,
  p_payroll_schedule_id uuid,
  p_effective_from date,
  p_change_reason text,
  p_override_mid_period boolean,
  p_override_reason text,
  p_request_id uuid
) returns integer

submit_schedule_assignment(
  p_assignment_id uuid,
  p_expected_version integer,
  p_request_id uuid
) returns integer

approve_schedule_assignment(
  p_assignment_id uuid,
  p_expected_version integer,
  p_mid_period_confirmation boolean,
  p_request_id uuid
) returns integer

reject_schedule_assignment(
  p_assignment_id uuid,
  p_expected_version integer,
  p_rejection_reason text,
  p_request_id uuid
) returns integer
```

Mid-period detection checks whether `effective_from` falls strictly between `period_start` and `period_end` for an existing period on the proposed schedule. It raises `PAYROLL_ASSIGNMENT_MID_PERIOD` unless both override flags and a nonblank override reason are present.

- [ ] **Step 4: Revoke and grant execution**

Internal helpers remain revoked from `authenticated`. Public workflow RPCs are granted only to `authenticated` after role checks inside each function.

- [ ] **Step 5: Run focused tests and commit**

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/payroll/migration.test.ts \
  src/features/payroll/security.test.ts \
  src/features/payroll/concurrency.test.ts
git add supabase/migrations/202607180002_payroll_foundation.sql src/features/payroll
git commit -m "feat: add payroll approval workflows"
```

---

### Task 4: Payroll schedule management, period generation, business-day adjustment, and lifecycle RPCs

**Files:**
- Modify: `supabase/migrations/202607180002_payroll_foundation.sql`
- Modify: `src/features/payroll/migration.test.ts`
- Modify: `src/features/payroll/security.test.ts`
- Modify: `src/features/payroll/concurrency.test.ts`

**Interfaces:**
- Consumes: Task 2 tables, active holiday resolver, `pg_cron`, and Task 3 audit infrastructure.
- Produces: schedule management, preview, rolling generation, period transitions, cron registration, and period-detail projections.

- [ ] **Step 1: Add failing generation and lifecycle tests**

Test cases:

```text
weekly periods use 7-day ranges from anchor_date
biweekly periods use 14-day ranges from anchor_date
semi-monthly creates 1–15 and 16–month-end by default
monthly creates first through last calendar day
February 2028 ends on the leap day
weekend cutoff/payment moves backward
active holiday cutoff/payment moves backward repeatedly until a business day
re-running generation creates no duplicate periods
advisory lock prevents overlapping generation runs
period code is deterministic and unique per schedule
only allowed state transitions succeed
HR cannot approve, lock, or reopen
Super Admin reopening requires a reason
expected-version mismatch raises PAYROLL_PERIOD_VERSION_CONFLICT
```

- [ ] **Step 2: Add schedule management RPCs**

Signatures:

```sql
create_payroll_schedule(
  p_name text,
  p_code text,
  p_schedule_type public.payroll_schedule_type,
  p_anchor_date date,
  p_first_period_end_day integer,
  p_cutoff_offset_days integer,
  p_payment_offset_days integer,
  p_request_id uuid
) returns uuid

update_payroll_schedule(
  p_schedule_id uuid,
  p_expected_version integer,
  p_name text,
  p_code text,
  p_anchor_date date,
  p_first_period_end_day integer,
  p_cutoff_offset_days integer,
  p_payment_offset_days integer,
  p_request_id uuid
) returns integer

set_payroll_schedule_active(
  p_schedule_id uuid,
  p_expected_version integer,
  p_is_active boolean,
  p_request_id uuid
) returns integer
```

Deactivation must raise `PAYROLL_SCHEDULE_IN_USE` when a current or future approved assignment references the schedule.

- [ ] **Step 3: Add period calculation helpers**

Internal helpers:

```sql
is_payroll_business_day(p_date date) returns boolean
adjust_to_previous_payroll_business_day(p_date date) returns date
payroll_period_code(p_type public.payroll_schedule_type, p_start date, p_end date, p_sequence integer) returns text
preview_payroll_schedule_periods_internal(p_schedule public.payroll_schedules, p_from date, p_through date) returns table(...)
```

A business day is Monday–Friday and has no row from `resolve_active_holiday(p_date)`.

- [ ] **Step 4: Add generation functions**

Signatures:

```sql
preview_payroll_schedule_periods(
  p_schedule_type public.payroll_schedule_type,
  p_anchor_date date,
  p_first_period_end_day integer,
  p_cutoff_offset_days integer,
  p_payment_offset_days integer,
  p_from date,
  p_count integer
) returns jsonb

ensure_payroll_period_horizon(
  p_source text default 'scheduled',
  p_request_id uuid default null
) returns jsonb
```

`ensure_payroll_period_horizon`:

```text
1. Uses pg_try_advisory_xact_lock(hashtextextended('payroll-period-generation', 0)).
2. Reads singleton settings.
3. Skips when generation_enabled is false.
4. Generates from the earliest needed date through current company date + horizon months.
5. Uses INSERT ... ON CONFLICT DO NOTHING.
6. Writes generated and date_adjusted events.
7. Returns {status, schedulesProcessed, periodsCreated, adjustedDates}.
```

Register daily cron idempotently:

```sql
select cron.unschedule(jobid)
from cron.job
where jobname = 'hris-daily-payroll-period-generation';

select cron.schedule(
  'hris-daily-payroll-period-generation',
  '15 0 * * *',
  $$select public.ensure_payroll_period_horizon('scheduled', null);$$
);
```

This runs at 8:15 AM Asia/Manila, after the Phase 9 8:00 AM notification cycle.

- [ ] **Step 5: Add period transition functions**

```sql
transition_payroll_period(
  p_period_id uuid,
  p_expected_version integer,
  p_to_status public.payroll_period_status,
  p_request_id uuid
) returns integer

reopen_payroll_period(
  p_period_id uuid,
  p_expected_version integer,
  p_reason text,
  p_request_id uuid
) returns integer
```

Allowed matrix:

```text
draft -> open: HR or Super Admin
open -> under_review: HR or Super Admin
under_review -> open: HR or Super Admin
under_review -> approved: Super Admin only
approved -> locked: Super Admin only
locked -> under_review: Super Admin only through reopen function
```

Every transition row-locks the period, checks version, increments version, timestamps actor fields, and writes a period event.

- [ ] **Step 6: Seed one default schedule safely**

Insert one active schedule only when no schedule exists:

```text
Name: Semi-monthly payroll
Code: SM
Type: semi_monthly
First period end day: 15
Cutoff offset: 0
Payment offset: 5
Currency: PHP from payroll_settings
Timezone: Asia/Manila from payroll_settings
```

Do not assign employees and do not create compensation records.

- [ ] **Step 7: Run focused tests and commit**

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/payroll/migration.test.ts \
  src/features/payroll/security.test.ts \
  src/features/payroll/concurrency.test.ts
git add supabase/migrations/202607180002_payroll_foundation.sql src/features/payroll
git commit -m "feat: generate and control payroll periods"
```

---

### Task 5: Phase 9 notification integration and safe payroll read RPCs

**Files:**
- Modify: `supabase/migrations/202607180002_payroll_foundation.sql`
- Modify: `src/features/notifications/types.ts`
- Modify: `src/features/notifications/routing.test.ts`
- Modify: `src/features/notifications/security.test.ts`
- Modify: `src/features/payroll/security.test.ts`

**Interfaces:**
- Consumes: Phase 9 notification writer and Task 2–4 data.
- Produces: payroll notification types and safe list/detail/read projections for all application roles.

- [ ] **Step 1: Add failing notification and projection tests**

Assert payroll notification payloads contain only:

```text
employee_id
request_id
period_id
schedule_id
effective_from
status
```

and exclude:

```text
monthly_salary
hourly_rate
amount
change_reason
override_reason
rejection_reason
```

- [ ] **Step 2: Extend notification modules and types**

Append module `payroll` and rule/event types needed for:

```text
compensation_approval_pending
schedule_assignment_approval_pending
payroll_period_ready
payroll_period_review_pending
payroll_period_approval_pending
payroll_period_reopened
```

Action URLs are selected server-side from this allowlist:

```text
/payroll/approvals
/payroll/periods
/payroll/periods/<uuid>
/me/compensation
```

- [ ] **Step 3: Add safe read RPCs**

Create JSON-returning functions:

```text
get_payroll_overview
list_payroll_schedules
get_payroll_schedule_detail
list_payroll_periods
get_payroll_period_detail
get_employee_compensation_admin
get_own_compensation
list_payroll_approvals
```

Rules:

```text
get_payroll_overview returns role-specific aggregates.
get_own_compensation returns only the current approved compensation and assignment.
get_employee_compensation_admin requires HR and returns amount fields.
list_payroll_approvals requires Super Admin.
period/detail projections never include private reasons except on the exact Super Admin approval record where needed for decision-making.
```

- [ ] **Step 4: Run focused tests and commit**

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/notifications/routing.test.ts \
  src/features/notifications/security.test.ts \
  src/features/payroll/security.test.ts
git add supabase/migrations/202607180002_payroll_foundation.sql \
  src/features/notifications src/features/payroll
git commit -m "feat: integrate payroll notifications and projections"
```

---

### Task 6: Payroll query and normalization layer

**Files:**
- Create: `src/features/payroll/normalize.ts`
- Create: `src/features/payroll/queries.ts`
- Create: `src/features/payroll/queries.test.ts`
- Create: `src/features/payroll/schedules/queries.ts`
- Create: `src/features/payroll/schedules/queries.test.ts`
- Create: `src/features/payroll/periods/queries.ts`
- Create: `src/features/payroll/periods/queries.test.ts`
- Create: `src/features/payroll/compensation/queries.ts`
- Create: `src/features/payroll/compensation/queries.test.ts`
- Create: `src/features/payroll/approvals/queries.ts`
- Create: `src/features/payroll/approvals/queries.test.ts`

**Interfaces:**
- Consumes: Task 1 types and Task 5 JSON RPCs.
- Produces: server-only typed query functions for all payroll routes.

- [ ] **Step 1: Write failing query tests**

Tests assert every query module:

```ts
import "server-only";
```

and invokes only the corresponding protected RPC. No browser-facing module imports the Supabase admin client or service-role key.

- [ ] **Step 2: Implement normalizers**

All unknown JSON is normalized with safe defaults. Amount fields remain numbers or null. Dates remain ISO strings. Invalid status values throw `Payroll data is unavailable.` rather than being cast silently.

- [ ] **Step 3: Implement exact query exports**

```ts
export async function getPayrollOverview(): Promise<PayrollOverview>;
export async function listPayrollSchedules(): Promise<PayrollScheduleSummary[]>;
export async function getPayrollScheduleDetail(id: string): Promise<PayrollScheduleDetail>;
export async function previewPayrollSchedule(input: PayrollScheduleInput): Promise<PayrollPeriodPreview[]>;
export async function listPayrollPeriods(filters: PayrollPeriodFilters): Promise<PayrollPeriodListResult>;
export async function getPayrollPeriodDetail(id: string): Promise<PayrollPeriodDetail>;
export async function getEmployeeCompensationAdmin(employeeId: string): Promise<EmployeeCompensationAdminDetail>;
export async function getOwnCompensation(): Promise<OwnCompensationDetail>;
export async function listPayrollApprovals(): Promise<PayrollApprovalQueue>;
```

- [ ] **Step 4: Run tests and commit**

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/payroll/queries.test.ts \
  src/features/payroll/schedules/queries.test.ts \
  src/features/payroll/periods/queries.test.ts \
  src/features/payroll/compensation/queries.test.ts \
  src/features/payroll/approvals/queries.test.ts
git add src/features/payroll
git commit -m "feat: add payroll query layer"
```

---

### Task 7: Protected payroll server actions

**Files:**
- Create: `src/app/(dashboard)/payroll/actions.ts`
- Create: `src/app/(dashboard)/payroll/schedules/actions.ts`
- Create: `src/app/(dashboard)/payroll/periods/actions.ts`
- Create: `src/app/(dashboard)/employees/[id]/compensation/actions.ts`
- Create: `src/app/(dashboard)/payroll/approvals/actions.ts`
- Create: `src/features/payroll/actions.test.ts`

**Interfaces:**
- Consumes: Task 1 validation/error mapping and Task 3–4 RPCs.
- Produces: server actions consumed by all payroll forms and state-transition controls.

- [ ] **Step 1: Write failing action tests**

Assert:

```text
each action uses "use server"
create/update schedule actions require HR validation
approve/reject actions use Super Admin RPCs
private reasons are passed only to the RPC and never returned in retry state
compensation amounts are not logged
request IDs use crypto.randomUUID()
revalidatePath covers payroll list/detail, employee detail, dashboard, notifications, and layout as applicable
```

- [ ] **Step 2: Implement action helpers**

Use one local RPC wrapper per action file. Return only:

```ts
{ success: "..." }
{ error: mapPayrollError(error.message), fieldErrors?: ... }
```

Never return raw SQL messages, Supabase error objects, compensation amounts, or private reasons.

- [ ] **Step 3: Implement schedule and period actions**

Exports:

```text
createPayrollScheduleAction
updatePayrollScheduleAction
setPayrollScheduleActiveAction
transitionPayrollPeriodAction
reopenPayrollPeriodAction
runPayrollPeriodGenerationAction
```

- [ ] **Step 4: Implement compensation, assignment, and approval actions**

Exports:

```text
createCompensationDraftAction
updateCompensationDraftAction
submitCompensationAction
createScheduleAssignmentDraftAction
updateScheduleAssignmentDraftAction
submitScheduleAssignmentAction
approveCompensationAction
rejectCompensationAction
approveScheduleAssignmentAction
rejectScheduleAssignmentAction
```

- [ ] **Step 5: Run tests and commit**

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/payroll/actions.test.ts
git add 'src/app/(dashboard)' src/features/payroll/actions.test.ts
git commit -m "feat: add protected payroll actions"
```

---

### Task 8: Payroll overview, employee entry point, and navigation

**Files:**
- Create: `src/app/(dashboard)/payroll/page.tsx`
- Create: `src/app/(dashboard)/payroll/loading.tsx`
- Create: `src/app/(dashboard)/payroll/error.tsx`
- Create: `src/components/payroll/payroll-summary-cards.tsx`
- Create: `src/components/payroll/payroll-missing-setup-list.tsx`
- Modify: `src/components/sidebar.tsx`
- Modify: `src/app/(dashboard)/settings/page.tsx`
- Modify: `src/features/payroll/ui.test.ts`
- Modify: `src/features/payroll/routing.test.ts`

**Interfaces:**
- Consumes: `getPayrollOverview`, payroll auth predicates, and existing `PageHeader`/card styles.
- Produces: role-specific payroll landing page and navigation links.

- [ ] **Step 1: Write failing routing/UI tests**

Verify:

```text
/payroll requires authenticated user before query
HR/Super view administrative summaries
Employee view contains only own current compensation/schedule summary and link to /me/compensation
sidebar shows Payroll to HR/Super
sidebar shows My Compensation to all authenticated roles
no manager/direct-report compensation wording appears
```

- [ ] **Step 2: Implement overview components**

HR cards:

```text
Active schedules
Upcoming draft periods
Periods requiring review
Pending approvals
Employees missing compensation
Employees missing payroll schedule
```

Super Admin also sees backdated warnings and recently reopened periods. Employee overview never receives organization counts.

- [ ] **Step 3: Add navigation**

Use Lucide `WalletCards` or `CircleDollarSign` already available from `lucide-react`. Do not add a new dependency.

- [ ] **Step 4: Run tests and commit**

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/payroll/ui.test.ts \
  src/features/payroll/routing.test.ts
git add src/app src/components src/features/payroll
git commit -m "feat: add payroll overview and navigation"
```

---

### Task 9: Payroll schedule administration UI

**Files:**
- Create: `src/app/(dashboard)/payroll/schedules/page.tsx`
- Create: `src/app/(dashboard)/payroll/schedules/new/page.tsx`
- Create: `src/app/(dashboard)/payroll/schedules/[scheduleId]/page.tsx`
- Create: `src/components/payroll/payroll-schedule-form.tsx`
- Create: `src/components/payroll/payroll-schedule-list.tsx`
- Create: `src/components/payroll/payroll-schedule-preview.tsx`
- Modify: `src/features/payroll/ui.test.ts`
- Modify: `src/features/payroll/routing.test.ts`

**Interfaces:**
- Consumes: Task 6 schedule queries and Task 7 schedule actions.
- Produces: create, edit, preview, activate, and deactivate schedule workflows.

- [ ] **Step 1: Write failing route/component tests**

Assert:

```text
all schedule routes authorize before querying
form conditionally shows anchor date for weekly/biweekly
form conditionally shows first period end day for semi-monthly
currency and timezone are read-only
preview renders period code, range, cutoff, payment, and adjusted indicators
inactive action requires confirmation
```

- [ ] **Step 2: Implement schedule list and detail pages**

List columns/cards:

```text
Name
Code
Frequency
Currency
Next period
Assigned employees
Status
```

- [ ] **Step 3: Implement controlled form and preview**

The client form does not calculate authoritative dates. It submits normalized form state to the server preview RPC and displays returned dates.

- [ ] **Step 4: Run tests and commit**

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/payroll/ui.test.ts \
  src/features/payroll/routing.test.ts
git add src/app src/components src/features/payroll
git commit -m "feat: add payroll schedule administration"
```

---

### Task 10: Payroll period list, detail, audit timeline, and state controls

**Files:**
- Create: `src/app/(dashboard)/payroll/periods/page.tsx`
- Create: `src/app/(dashboard)/payroll/periods/[periodId]/page.tsx`
- Create: `src/components/payroll/payroll-status-badge.tsx`
- Create: `src/components/payroll/payroll-period-filter-form.tsx`
- Create: `src/components/payroll/payroll-period-list.tsx`
- Create: `src/components/payroll/payroll-period-detail.tsx`
- Create: `src/components/payroll/payroll-period-actions.tsx`
- Create: `src/components/payroll/payroll-audit-timeline.tsx`
- Modify: `src/features/payroll/ui.test.ts`
- Modify: `src/features/payroll/routing.test.ts`

**Interfaces:**
- Consumes: Task 6 period queries and Task 7 period actions.
- Produces: filterable periods, detail view, role-aware transitions, reopen dialog, and event timeline.

- [ ] **Step 1: Write failing tests**

Verify filters parse schedule, status, year, from, to, and page. Verify action visibility matrix exactly matches database transitions.

- [ ] **Step 2: Implement period list**

Desktop uses table; mobile uses cards. Columns:

```text
Period code
Schedule
Date range
Cutoff
Payment
Status
Recalculation flag
```

- [ ] **Step 3: Implement detail and transitions**

Display original adjusted dates when different. Reopen requires a nonblank reason and explicit confirmation. The UI sends `expectedVersion` from the loaded detail.

- [ ] **Step 4: Run tests and commit**

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/payroll/ui.test.ts \
  src/features/payroll/routing.test.ts
git add src/app src/components src/features/payroll
git commit -m "feat: add payroll period workflow UI"
```

---

### Task 11: Employee compensation administration and self-service

**Files:**
- Create: `src/app/(dashboard)/employees/[id]/compensation/page.tsx`
- Create: `src/app/(dashboard)/employees/[id]/compensation/new/page.tsx`
- Create: `src/app/(dashboard)/employees/[id]/compensation/[recordId]/page.tsx`
- Create: `src/app/(dashboard)/me/compensation/page.tsx`
- Create: `src/components/payroll/compensation-summary.tsx`
- Create: `src/components/payroll/compensation-form.tsx`
- Create: `src/components/payroll/compensation-history.tsx`
- Create: `src/components/payroll/schedule-assignment-form.tsx`
- Create: `src/components/payroll/schedule-assignment-history.tsx`
- Modify: `src/app/(dashboard)/employees/[id]/page.tsx`
- Modify: `src/features/payroll/ui.test.ts`
- Modify: `src/features/payroll/routing.test.ts`

**Interfaces:**
- Consumes: Task 6 compensation queries and Task 7 compensation/assignment actions.
- Produces: HR administration for draft/submit/history and employee read-only current compensation.

- [ ] **Step 1: Write failing security/UI tests**

Assert:

```text
HR routes require employee profile management authorization before query
/me/compensation uses get_own_compensation only
employee page never imports admin compensation query
future, pending, rejected, superseded, and historical records are absent from self-service markup
manager direct-report compensation access does not exist
```

- [ ] **Step 2: Implement HR compensation view**

Sections:

```text
Current approved compensation
Current payroll schedule
Future approved changes
Draft and pending requests
Approved history
Schedule assignment history
Audit timeline
```

- [ ] **Step 3: Implement forms**

Compensation form enables only the matching amount field, shows company currency read-only, validates standard hours, and warns on backdated effective dates.

Schedule assignment form suggests the next period start returned by the server. Mid-period override controls appear only when the server flags a conflict.

- [ ] **Step 4: Implement self-service view**

Display only:

```text
Compensation type
Current monthly salary or hourly rate
Currency
Standard hours
Current schedule name and frequency
Next expected payment date
Effective date
```

No approval actors, reasons, audit events, or history are included.

- [ ] **Step 5: Run tests and commit**

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/payroll/ui.test.ts \
  src/features/payroll/routing.test.ts
git add src/app src/components src/features/payroll
git commit -m "feat: add compensation administration and self service"
```

---

### Task 12: Super Admin approval inbox

**Files:**
- Create: `src/app/(dashboard)/payroll/approvals/page.tsx`
- Create: `src/components/payroll/payroll-approval-list.tsx`
- Create: `src/components/payroll/payroll-approval-card.tsx`
- Modify: `src/features/payroll/ui.test.ts`
- Modify: `src/features/payroll/routing.test.ts`

**Interfaces:**
- Consumes: Task 6 approval query and Task 7 approval actions.
- Produces: two secure approval queues for compensation and schedule assignments.

- [ ] **Step 1: Write failing approval tests**

Verify:

```text
route requires Super Admin before query
cards show employee, current value, proposed value, effective date, and affected period count
rejection reason is required
backdated confirmation is required
mid-period confirmation is required
private reasons are rendered only to Super Admin and are never placed in URLs or hidden retry fields
```

- [ ] **Step 2: Implement approval queues**

Tabs or sections:

```text
Compensation changes
Payroll schedule assignments
```

Use existing server-action form patterns. Disable submit buttons while pending. Revalidate `/payroll/approvals`, employee compensation detail, `/payroll`, `/dashboard`, and `/notifications` after success.

- [ ] **Step 3: Run tests and commit**

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/payroll/ui.test.ts \
  src/features/payroll/routing.test.ts
git add src/app src/components src/features/payroll
git commit -m "feat: add payroll approval inbox"
```

---

### Task 13: Styling, configuration checks, documentation, and release verification

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/features/build-config.test.ts`
- Modify: `src/features/layout/balanced-spacing.test.ts`
- Create: `src/features/payroll/e2e.test.ts`
- Modify: `README.md`
- Modify: `.env.example`
- Create: `phase10a_post_migration_verification.sql`
- Create: `phase-10a-payroll-foundation-report.md`

**Interfaces:**
- Consumes: all Phase 10A tasks.
- Produces: responsive, documented, verified, packaged release.

- [ ] **Step 1: Add failing end-to-end source tests**

Check:

```text
all planned routes exist
all payroll mutations use protected RPCs
no service-role key appears in browser-facing files
no compensation amount appears in notification payload builders
no private reason appears in action retry state or logs
sidebar and responsive classes exist
migration order includes 202607180001 then 202607180002
```

- [ ] **Step 2: Add balanced payroll layout styles**

Use existing spacing tokens and class patterns. Add only payroll-specific selectors for:

```text
payroll overview grid
schedule preview grid
period table/cards
compensation summary cards
approval cards
payroll audit timeline
mobile filter/action stacks
```

Do not change unrelated global component spacing.

- [ ] **Step 3: Update documentation**

README documents:

```text
Phase 10A scope
new routes
new migration order
cron job name and schedule
role access matrix
Supabase migration instructions
Phase 10B exclusions
```

`.env.example` receives no new secrets unless implementation actually needs one. Do not copy `.env.local`.

- [ ] **Step 4: Create post-migration verification SQL**

The verification file checks:

```text
all seven payroll tables exist
RLS is enabled
singleton payroll settings exists
one default schedule exists only when no prior schedule existed
all protected RPCs exist and are SECURITY DEFINER
function search paths equal pg_catalog, public
execution grants are limited
cron job hris-daily-payroll-period-generation is active
period generation is idempotent
Phase 9 archive function contains FOR UPDATE OF n
```

- [ ] **Step 5: Run full verification**

```bash
npm test
npx tsc --noEmit
npm run build
git status --short
```

Record exact counts and command results. Do not claim success from partial output.

- [ ] **Step 6: Create sanitized package**

Create `/mnt/data/hris-github-phase-10a-payroll-foundation.zip` with root folder `hris-github/` and exclude:

```text
.git/
.env.local
node_modules/
.next/
tsconfig.tsbuildinfo
*.log
.worktrees/
```

Create SHA-256:

```bash
sha256sum /mnt/data/hris-github-phase-10a-payroll-foundation.zip \
  > /mnt/data/hris-github-phase-10a-payroll-foundation.sha256
```

- [ ] **Step 7: Commit release files**

```bash
git add README.md .env.example src supabase docs \
  phase10a_post_migration_verification.sql \
  phase-10a-payroll-foundation-report.md
git commit -m "feat: complete Phase 10A payroll foundation"
```

---

## Final Verification Checklist

- [ ] Missing Phase 9 archive-lock migration is restored.
- [ ] Windows-compatible document security test is restored.
- [ ] Original dirty CRLF artifact is not committed.
- [ ] Payroll settings default to PHP and Asia/Manila.
- [ ] Four schedule types generate correct periods.
- [ ] Weekend and holiday adjustment uses the previous business day.
- [ ] Generation is idempotent and concurrency-safe.
- [ ] Compensation and assignment approvals are effective-dated and non-overlapping.
- [ ] Backdated changes require reason and confirmation.
- [ ] Locked periods remain unchanged by compensation approval.
- [ ] Period transitions enforce role and expected version.
- [ ] Employees see only their own current approved compensation.
- [ ] Managers cannot view direct-report compensation.
- [ ] Notifications exclude amounts and private reasons.
- [ ] All payroll audit events are immutable.
- [ ] Full tests, TypeScript, and production build pass.
- [ ] Final ZIP root is `hris-github/`.
- [ ] Final ZIP excludes secrets, Git metadata, dependencies, and build output.

## Pull Request Guidance

Because Phase 10A is based on the unmerged Phase 9 feature branch, use one of these flows:

```text
Preferred: merge Phase 9 into main first, then rebase Phase 10A onto main and open a Phase 10A PR to main.
Alternative: open Phase 10A as a stacked PR targeting feature/phase-9-notifications-reminders-escalations, then retarget to main after Phase 9 merges.
```

Suggested Phase 10A PR title:

```text
Phase 10A: Payroll foundation
```
