# Phase 10B.2A Premium Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add effective-dated Philippine payroll premium rules, day-type resolution, overtime/rest-day/holiday/night-differential calculations, attendance grace rules, immutable snapshots, stale detection, approval workflows, and payroll workspace integration without changing approved or locked payroll results.

**Architecture:** PostgreSQL remains the payroll authority. One forward-only migration introduces versioned premium-rule data, immutable day-type and premium calculation records, protected approval and calculation RPCs, holiday-count support, stale triggers, readiness extensions, and inactive statutory reference presets. Next.js server-only query modules and server actions normalize the RPC payloads and power HR/Super Admin settings, approvals, payroll workspace, employee detail, and exception pages.

**Tech Stack:** Next.js 16.2.10 App Router, React 19.1.1, TypeScript 5.9.3, Supabase PostgreSQL/Auth/RLS, PostgreSQL PL/pgSQL with `numeric`, Node built-in test runner, existing CSS system.

## Global Constraints

- Start from the repository state containing `supabase/migrations/202607190002_fix_payroll_notification_action_urls.sql`.
- Create exactly one new forward-only migration: `supabase/migrations/202607190003_payroll_premium_rules.sql`.
- Never edit or reorder an already-applied migration.
- Company timezone remains `Asia/Manila`.
- Employee and manager roles receive no premium-rule administration or payroll-premium access.
- HR Admin may create and submit rule drafts, review results, and run controlled calculations.
- Only Super Admin may approve or reject premium rules and attendance deduction rules.
- Approved rule records are immutable; revisions are new version rows.
- Approved and locked payroll periods are never recalculated or mutated.
- All rates, multipliers, and money use PostgreSQL `numeric`; JavaScript floating-point arithmetic never determines payroll totals.
- Raw minutes, rounded minutes, raw amounts, rounded amounts, selected rules, source records, and calculation versions are preserved.
- Ordinary base earnings from Phase 10B.1 are not duplicated.
- Work on rest days and holidays uses approved overtime-detection segments as the payable source.
- On rest-day and holiday-work segments, the first standard-day minutes use the ordinary day multiplier and minutes beyond the standard day use the overtime multiplier.
- Pre-shift and post-shift approved segments are overtime from the first approved minute.
- Night differential is a separate line calculated from the applicable ordinary or overtime premium base.
- Night windows may cross midnight.
- Overtime rounding and night-differential rounding are configured independently.
- Late and undertime grace rules deduct only minutes beyond grace.
- When no attendance deduction rule applies, preserve Phase 10B.1 behavior with a virtual zero-grace, exact-minute fallback.
- Premium-rule scope precedence is exactly `payroll_group → position → department → employment_type → company_default`.
- `payroll_group` maps to the existing `payroll_schedules` entity; do not create a second payroll-group table.
- `position` maps to the existing `job_titles` entity.
- Same-scope approved date ranges cannot overlap.
- Combined day types are explicit; do not derive them by uncontrolled multiplier stacking.
- Supported combined types are regular workday, rest day, special non-working day, regular holiday, special day plus rest day, regular holiday plus rest day, double regular holiday, and double regular holiday plus rest day.
- Double special holidays remain unsupported in this phase and create `MISSING_HOLIDAY_CONFIGURATION`.
- Philippine statutory presets are reference templates only; migration must not activate or apply them automatically.
- The seeded preset legal source is the DOLE/Bureau of Working Conditions 2024 Handbook on Workers’ Statutory Monetary Benefits.
- Premium source and calculation notifications contain identifiers and statuses only, never salary or computed amounts.
- Existing Phase 1 through Phase 10B.1 behavior and tests must remain compatible.
- Every browser-callable payroll RPC uses `SECURITY DEFINER` and `set search_path = pg_catalog, public`.
- Internal helpers are revoked from `public`, `anon`, and `authenticated`.
- Public payroll RPC execution is revoked from `public` and `anon`, granted to `authenticated`, and still validates the actor role inside the function.
- Use TDD, focused commits, and the existing static migration/security/UI test conventions.

---

## Inspected baseline

The source map was produced from:

```text
hris-github-phase-10b1-payroll-calculation-foundation.zip
SHA-256: 409f04207ac9ef74ce8e7fa10cc6bbc73be6117de7b49d61f3ff108421cb1e38
```

The separately supplied and already-applied baseline fix is:

```text
supabase/migrations/202607190002_fix_payroll_notification_action_urls.sql
```

The archive named `latest hris zippppp.zip` contains the Phase 9 branch and is not used as the Phase 10B.2A source baseline.

Existing Phase 10B.1 authority:

```text
supabase/migrations/202607190001_payroll_calculation_foundation.sql
src/app/(dashboard)/payroll/calculation/actions.ts
src/features/payroll/calculation/queries.ts
src/features/payroll/constants.ts
src/features/payroll/types.ts
src/features/payroll/normalize.ts
src/features/payroll/validation.ts
src/features/payroll/presentation.ts
src/components/payroll/payroll-calculation-workspace.tsx
src/components/payroll/payroll-employee-calculation-detail.tsx
src/components/payroll/payroll-exception-queue.tsx
```

Existing entities reused by this phase:

```text
employees.employment_type
employees.department_id
employees.job_title_id
payroll_schedules
employee_payroll_schedule_assignments
work_schedule_versions
employee_schedule_assignments
attendance_calculation_revisions
holiday_calendar_versions
overtime_detection_groups
overtime_detection_revisions
overtime_approval_items
employee_compensation_records
payroll_basis_rules
payroll_employee_entries
payroll_entry_daily_breakdowns
payroll_entry_input_snapshots
payroll_entry_exceptions
payroll_calculation_events
```

## File map

### Create

```text
supabase/migrations/202607190003_payroll_premium_rules.sql
phase10b2a_post_migration_verification.sql

src/features/payroll/premiums/migration.test.ts
src/features/payroll/premiums/security.test.ts
src/features/payroll/premiums/formulas.test.ts
src/features/payroll/premiums/model.test.ts
src/features/payroll/premiums/queries.ts
src/features/payroll/premiums/queries.test.ts
src/features/payroll/premiums/actions.test.ts
src/features/payroll/premiums/settings-ui.test.ts
src/features/payroll/premiums/workspace-ui.test.ts

src/app/(dashboard)/payroll/premiums/actions.ts
src/app/(dashboard)/payroll/settings/premium-rules/page.tsx
src/app/(dashboard)/payroll/settings/premium-rules/new/page.tsx
src/app/(dashboard)/payroll/settings/premium-rules/[ruleSetId]/page.tsx
src/app/(dashboard)/payroll/settings/attendance-deduction-rules/page.tsx
src/app/(dashboard)/payroll/approvals/premium-rules/page.tsx

src/components/payroll/premium-rule-list.tsx
src/components/payroll/premium-rule-form.tsx
src/components/payroll/premium-rule-detail.tsx
src/components/payroll/attendance-deduction-rule-list.tsx
src/components/payroll/premium-rule-approval-list.tsx
```

### Modify

```text
src/features/payroll/constants.ts
src/features/payroll/types.ts
src/features/payroll/normalize.ts
src/features/payroll/validation.ts
src/features/payroll/presentation.ts
src/features/payroll/errors.ts

src/features/overtime/holidays/types.ts
src/features/overtime/holidays/validation.ts
src/features/overtime/holidays/validation.test.ts
src/features/overtime/holidays/queries.ts
src/features/overtime/holidays/queries.test.ts
src/app/(dashboard)/settings/holidays/actions.ts
src/components/overtime/holiday-form.tsx
src/components/overtime/holiday-replacement-form.tsx
src/app/(dashboard)/settings/holidays/[holidayGroupId]/page.tsx
src/app/(dashboard)/settings/holidays/page.tsx
src/features/overtime/actions.test.ts
src/features/overtime/ui.test.ts

src/features/payroll/calculation/queries.ts
src/features/payroll/calculation/queries.test.ts
src/features/payroll/calculation/model.test.ts
src/features/payroll/calculation/migration.test.ts
src/features/payroll/calculation/security.test.ts
src/features/payroll/calculation/workspace-ui.test.ts
src/features/payroll/calculation/settings-ui.test.ts

src/app/(dashboard)/payroll/calculation/actions.ts
src/app/(dashboard)/payroll/page.tsx
src/app/(dashboard)/payroll/periods/[periodId]/workspace/page.tsx
src/app/(dashboard)/payroll/periods/[periodId]/employees/[employeeId]/page.tsx
src/app/(dashboard)/payroll/periods/[periodId]/exceptions/page.tsx

src/components/payroll/payroll-calculation-workspace.tsx
src/components/payroll/payroll-employee-calculation-detail.tsx
src/components/payroll/payroll-exception-queue.tsx
src/components/sidebar.tsx
src/app/globals.css

README.md
docs/superpowers/specs/2026-07-19-phase-10b2a-premium-rules-design.md
```

## Shared TypeScript contracts

Add these values to `src/features/payroll/constants.ts` before implementing queries or UI:

```ts
export const premiumRuleScopeTypeValues = [
  "company_default",
  "employment_type",
  "department",
  "position",
  "payroll_group",
] as const;
export type PremiumRuleScopeType =
  (typeof premiumRuleScopeTypeValues)[number];

export const premiumDayTypeValues = [
  "regular_workday",
  "rest_day",
  "special_non_working_day",
  "regular_holiday",
  "special_day_rest_day",
  "regular_holiday_rest_day",
  "double_regular_holiday",
  "double_regular_holiday_rest_day",
] as const;
export type PremiumDayType = (typeof premiumDayTypeValues)[number];

export const premiumTimeRoundingModeValues = [
  "exact_minutes",
  "round_down",
  "round_up",
  "nearest_increment",
] as const;
export type PremiumTimeRoundingMode =
  (typeof premiumTimeRoundingModeValues)[number];

export const premiumTypeValues = [
  "rest_day",
  "special_day",
  "regular_holiday",
  "special_day_rest_day",
  "regular_holiday_rest_day",
  "double_holiday",
  "double_holiday_rest_day",
  "regular_overtime",
  "rest_day_overtime",
  "special_day_overtime",
  "regular_holiday_overtime",
  "combined_day_overtime",
  "night_differential",
] as const;
export type PremiumType = (typeof premiumTypeValues)[number];

export const premiumRuleStatusValues = [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "superseded",
  "cancelled",
] as const;
```

Extend `payrollSourceTypeValues` with:

```ts
"premium_rule",
"attendance_deduction_rule",
"day_type_resolution",
```

Add these public contracts to `src/features/payroll/types.ts`:

```ts
import type {
  PremiumDayType,
  PremiumRuleScopeType,
  PremiumTimeRoundingMode,
  PremiumType,
} from "./constants";

export type PremiumRuleDayInput = {
  dayType: PremiumDayType;
  regularTimeMultiplier: number;
  overtimeMultiplier: number;
  additionalPremiumOnly: boolean;
  nightDifferentialPercentage: number;
  nightWindowStart: string;
  nightWindowEnd: string;
  overtimeRoundingMode: PremiumTimeRoundingMode;
  overtimeRoundingIncrementMinutes: number | null;
  nightRoundingMode: PremiumTimeRoundingMode;
  nightRoundingIncrementMinutes: number | null;
};

export type PremiumRuleSetInput = {
  name: string;
  scopeType: PremiumRuleScopeType;
  employmentType: string | null;
  departmentId: string | null;
  positionId: string | null;
  payrollGroupId: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  changeReason: string;
  sourceAgency: string;
  sourceReference: string;
  sourcePublicationDate: string;
  sourceUrl: string;
  dayRules: PremiumRuleDayInput[];
};

export type PremiumRuleDay = PremiumRuleDayInput & {
  id: string;
  versionNumber: number;
};

export type PremiumRuleSet = {
  id: string;
  supersedesRuleSetId: string | null;
  name: string;
  scopeType: PremiumRuleScopeType;
  scopeLabel: string;
  employmentType: string | null;
  departmentId: string | null;
  positionId: string | null;
  payrollGroupId: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: PayrollRequestStatus;
  changeReason: string | null;
  version: number;
  sourceAgency: string;
  sourceReference: string;
  sourcePublicationDate: string;
  sourceUrl: string;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  dayRules: PremiumRuleDay[];
};

export type PremiumRulePreset = {
  code: string;
  name: string;
  countryCode: "PH";
  sourceAgency: string;
  sourceReference: string;
  sourcePublicationDate: string;
  sourceUrl: string;
  dayRules: PremiumRuleDayInput[];
};

export type PremiumRuleList = {
  rules: PremiumRuleSet[];
  presets: PremiumRulePreset[];
  departments: Array<{ id: string; name: string }>;
  positions: Array<{ id: string; name: string }>;
  payrollGroups: Array<{ id: string; code: string; name: string }>;
};

export type AttendanceDeductionRuleInput = {
  scopeType: PremiumRuleScopeType;
  employmentType: string | null;
  departmentId: string | null;
  positionId: string | null;
  payrollGroupId: string | null;
  lateGraceMinutes: number;
  undertimeGraceMinutes: number;
  lateRoundingMode: PremiumTimeRoundingMode;
  lateRoundingIncrementMinutes: number | null;
  undertimeRoundingMode: PremiumTimeRoundingMode;
  undertimeRoundingIncrementMinutes: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  changeReason: string;
};

export type AttendanceDeductionRule = AttendanceDeductionRuleInput & {
  id: string;
  supersedesRuleId: string | null;
  scopeLabel: string;
  status: PayrollRequestStatus;
  version: number;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PremiumCoveragePreview = {
  affectedEmployeeCount: number;
  affectedOpenPeriodCount: number;
  staleEntryCount: number;
  conflictingRuleIds: string[];
  missingDayTypes: PremiumDayType[];
};

export type PayrollDayTypeResolution = {
  id: string;
  workDate: string;
  baseDayType: PremiumDayType;
  isRestDay: boolean;
  holidayVersionId: string | null;
  holidayType: string | null;
  holidayCount: number;
  combinedDayType: PremiumDayType;
  resolutionSource: Record<string, unknown>;
  premiumRuleSetId: string;
  premiumRuleVersionId: string;
};

export type PayrollPremiumLine = {
  id: string;
  dailyBreakdownId: string;
  workDate: string;
  premiumType: PremiumType;
  dayType: PremiumDayType;
  premiumRuleSetId: string;
  premiumRuleVersionId: string;
  baseHourlyRateRaw: number;
  rawMinutes: number;
  roundedMinutes: number;
  dayMultiplier: number;
  overtimeMultiplier: number;
  nightPercentage: number;
  baseAmountRaw: number;
  premiumAmountRaw: number;
  premiumAmountRounded: number;
  isAdditionalOnly: boolean;
  calculationDetails: Record<string, unknown>;
  createdAt: string;
};

export type PremiumApprovalQueue = {
  premiumRules: PremiumRuleSet[];
  attendanceDeductionRules: AttendanceDeductionRule[];
};
```

Extend `PayrollEmployeeEntry` with:

```ts
premiumEarningsRaw: number;
premiumEarningsRounded: number;
nightDifferentialRaw: number;
nightDifferentialRounded: number;
revisedGrossPayRaw: number;
revisedGrossPayRounded: number;
premiumCalculatedAt: string | null;
```

Extend `PayrollReadiness` with:

```ts
missingPremiumEntryCount: number;
```

Extend `PayrollCalculationWorkspace["summary"]` with:

```ts
premiumEarnings: number;
nightDifferential: number;
revisedGrossPay: number;
premiumPendingCount: number;
premiumExceptionCount: number;
```

Extend `PayrollEmployeeCalculationDetail` with:

```ts
dayTypeResolutions: PayrollDayTypeResolution[];
premiumLines: PayrollPremiumLine[];
premiumEvents: Array<{
  id: string;
  eventType: string;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}>;
```

---

### Task 1: Establish the implementation branch and prove the Phase 10B.1 baseline

**Files:**
- Verify: `supabase/migrations/202607190002_fix_payroll_notification_action_urls.sql`
- Create in repository: `docs/superpowers/specs/2026-07-19-phase-10b2a-premium-rules-design.md`
- Create in repository: `docs/superpowers/plans/2026-07-19-phase-10b2a-premium-rules.md`

**Interfaces:**
- Consumes: approved Phase 10B.2A design and current `main`.
- Produces: isolated branch with a green Phase 10B.1 baseline.

- [ ] **Step 1: Update the local repository and verify the required migration baseline**

```bash
cd /c/Users/jmbon/Desktop/hris-github
git status --short
git switch main
git pull --ff-only origin main
test -f supabase/migrations/202607190002_fix_payroll_notification_action_urls.sql
git log -1 --oneline
```

Expected:

```text
git status --short prints nothing
the test command exits 0
the latest commit includes the Phase 10B.1 notification URL fix
```

Do not continue from a branch where `202607190002_fix_payroll_notification_action_urls.sql` is absent.

- [ ] **Step 2: Create an isolated feature branch**

```bash
git switch -c feature/phase-10b2a-premium-rules
```

Expected:

```text
Switched to a new branch 'feature/phase-10b2a-premium-rules'
```

- [ ] **Step 3: Add the approved design and this plan**

Copy the approved design to:

```text
docs/superpowers/specs/2026-07-19-phase-10b2a-premium-rules-design.md
```

Copy this plan to:

```text
docs/superpowers/plans/2026-07-19-phase-10b2a-premium-rules.md
```

- [ ] **Step 4: Install the locked dependency tree and run baseline checks**

```bash
npm ci
npm test
npx tsc --noEmit
npm run build
```

Expected:

```text
all existing tests pass
TypeScript exits 0
Next.js production build exits 0
```

- [ ] **Step 5: Commit the approved documentation**

```bash
git add docs/superpowers/specs/2026-07-19-phase-10b2a-premium-rules-design.md \
  docs/superpowers/plans/2026-07-19-phase-10b2a-premium-rules.md
git commit -m "docs: add phase 10b2a premium rules plan"
```

---

### Task 2: Add migration contract tests, premium schema, immutable records, and inactive presets

**Files:**
- Create: `supabase/migrations/202607190003_payroll_premium_rules.sql`
- Create: `src/features/payroll/premiums/migration.test.ts`
- Create: `src/features/payroll/premiums/security.test.ts`
- Modify: `src/features/payroll/calculation/migration.test.ts`
- Modify: `src/features/payroll/calculation/security.test.ts`

**Interfaces:**
- Consumes: Phase 10B.1 payroll tables and roles.
- Produces: enum types, rule tables, preset table, immutable calculation tables, entry extensions, RLS, indexes, and constraints used by every later task.

- [ ] **Step 1: Write failing migration contract tests**

Create `src/features/payroll/premiums/migration.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL("../../../../supabase/migrations/202607190003_payroll_premium_rules.sql", import.meta.url),
  "utf8",
).catch(() => "");

const tables = [
  "premium_rule_presets",
  "premium_rule_sets",
  "premium_rule_versions",
  "attendance_deduction_rules",
  "payroll_day_type_resolutions",
  "payroll_premium_lines",
  "premium_rule_events",
  "premium_calculation_events",
];

test("Phase 10B.2A migration creates every premium table with RLS", () => {
  for (const table of tables) {
    assert.match(sql, new RegExp(`create table public\\.${table}\\s*\\(`, "i"));
    assert.match(
      sql,
      new RegExp(`alter table public\\.${table} enable row level security`, "i"),
    );
  }
});

test("premium schema uses numeric money and explicit supported day types", () => {
  assert.match(sql, /create type public\.premium_day_type as enum/i);
  for (const dayType of [
    "regular_workday",
    "rest_day",
    "special_non_working_day",
    "regular_holiday",
    "special_day_rest_day",
    "regular_holiday_rest_day",
    "double_regular_holiday",
    "double_regular_holiday_rest_day",
  ]) assert.match(sql, new RegExp(`'${dayType}'`));
  assert.doesNotMatch(sql, /\b(real|double precision)\b/i);
});

test("rule scope reuses current HRIS entities", () => {
  assert.match(sql, /employment_type public\.employment_type/i);
  assert.match(sql, /department_id uuid references public\.departments/i);
  assert.match(sql, /position_id uuid references public\.job_titles/i);
  assert.match(sql, /payroll_group_id uuid references public\.payroll_schedules/i);
  assert.doesNotMatch(sql, /create table public\.payroll_groups/i);
});

test("premium results extend entries without replacing Phase 10B.1 totals", () => {
  for (const column of [
    "premium_earnings_raw",
    "premium_earnings_rounded",
    "night_differential_raw",
    "night_differential_rounded",
    "revised_gross_pay_raw",
    "revised_gross_pay_rounded",
    "premium_calculated_at",
  ]) assert.match(sql, new RegExp(`add column if not exists ${column}`, "i"));
  assert.doesNotMatch(sql, /drop column\s+gross_pay_/i);
});

test("Philippine presets are templates and cannot affect calculations directly", () => {
  assert.match(sql, /DOLE\/Bureau of Working Conditions/i);
  assert.match(sql, /Handbook on Workers.*Statutory.*Monetary Benefits.*2024/i);
  assert.match(sql, /Workers-Statutory-Monetary-Benefits-Handbook-2024-Edition\.pdf/i);
  assert.match(sql, /premium_rule_presets_immutable/i);
  assert.doesNotMatch(sql, /insert into public\.premium_rule_sets[\s\S]*status\s*=\s*'approved'/i);
});
```

Create `src/features/payroll/premiums/security.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL("../../../../supabase/migrations/202607190003_payroll_premium_rules.sql", import.meta.url),
  "utf8",
).catch(() => "");

const tables = [
  "premium_rule_presets",
  "premium_rule_sets",
  "premium_rule_versions",
  "attendance_deduction_rules",
  "payroll_day_type_resolutions",
  "payroll_premium_lines",
  "premium_rule_events",
  "premium_calculation_events",
];

test("premium tables expose HR-only reads and no direct authenticated writes", () => {
  for (const table of tables) {
    assert.match(
      sql,
      new RegExp(`create policy [^;]+ on public\\.${table}[\\s\\S]*?public\\.is_hr_admin\\(\\)`, "i"),
    );
    assert.match(sql, new RegExp(`revoke all on public\\.${table} from authenticated`, "i"));
    assert.match(sql, new RegExp(`grant select on public\\.${table} to authenticated`, "i"));
    assert.doesNotMatch(
      sql,
      new RegExp(`grant (insert|update|delete|all) on public\\.${table} to authenticated`, "i"),
    );
  }
});

test("approved rules and calculation records are immutable", () => {
  assert.match(sql, /reject_approved_premium_rule_mutation/i);
  assert.match(sql, /payroll_day_type_resolutions_immutable/i);
  assert.match(sql, /payroll_premium_lines_immutable/i);
  assert.match(sql, /premium_rule_events_immutable/i);
  assert.match(sql, /premium_calculation_events_immutable/i);
});
```

- [ ] **Step 2: Run focused tests and verify the migration is absent**

```bash
npm test -- \
  src/features/payroll/premiums/migration.test.ts \
  src/features/payroll/premiums/security.test.ts
```

Expected: FAIL because `202607190003_payroll_premium_rules.sql` does not exist.

- [ ] **Step 3: Create enum types and the schema foundation**

Start `supabase/migrations/202607190003_payroll_premium_rules.sql` with:

```sql
begin;

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

do $$ begin
  create type public.premium_rule_scope_type as enum (
    'company_default','employment_type','department','position','payroll_group'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.premium_day_type as enum (
    'regular_workday','rest_day','special_non_working_day','regular_holiday',
    'special_day_rest_day','regular_holiday_rest_day',
    'double_regular_holiday','double_regular_holiday_rest_day'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.premium_time_rounding_mode as enum (
    'exact_minutes','round_down','round_up','nearest_increment'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.premium_type as enum (
    'rest_day','special_day','regular_holiday','special_day_rest_day',
    'regular_holiday_rest_day','double_holiday','double_holiday_rest_day',
    'regular_overtime','rest_day_overtime','special_day_overtime',
    'regular_holiday_overtime','combined_day_overtime','night_differential'
  );
exception when duplicate_object then null; end $$;

alter type public.payroll_source_type add value if not exists 'premium_rule';
alter type public.payroll_source_type add value if not exists 'attendance_deduction_rule';
alter type public.payroll_source_type add value if not exists 'day_type_resolution';
```

Create `premium_rule_presets` as an immutable template table:

```sql
create table public.premium_rule_presets (
  code text primary key,
  name text not null,
  country_code text not null default 'PH' check (country_code = 'PH'),
  source_agency text not null,
  source_reference text not null,
  source_publication_date date not null,
  source_url text not null,
  day_rules jsonb not null,
  created_at timestamptz not null default now(),
  constraint premium_rule_preset_code_format check (code ~ '^[a-z0-9_]{3,80}$'),
  constraint premium_rule_preset_rules_array check (jsonb_typeof(day_rules) = 'array')
);
```

Create `premium_rule_sets` with one workflow/version row per proposed rule:

```sql
create table public.premium_rule_sets (
  id uuid primary key default gen_random_uuid(),
  organization_id smallint not null default 1
    references public.payroll_settings(id) on delete restrict,
  supersedes_rule_set_id uuid
    references public.premium_rule_sets(id) on delete restrict,
  name text not null,
  scope_type public.premium_rule_scope_type not null,
  employment_type public.employment_type,
  department_id uuid references public.departments(id) on delete restrict,
  position_id uuid references public.job_titles(id) on delete restrict,
  payroll_group_id uuid references public.payroll_schedules(id) on delete restrict,
  scope_key text generated always as (
    case scope_type
      when 'company_default' then 'company_default'
      when 'employment_type' then 'employment_type:' || employment_type::text
      when 'department' then 'department:' || department_id::text
      when 'position' then 'position:' || position_id::text
      when 'payroll_group' then 'payroll_group:' || payroll_group_id::text
    end
  ) stored,
  effective_from date not null,
  effective_to date,
  status public.payroll_request_status not null default 'draft',
  change_reason text,
  version integer not null default 1 check (version >= 1),
  request_id uuid not null,
  source_agency text not null,
  source_reference text not null,
  source_publication_date date not null,
  source_url text not null,
  created_by uuid references public.profiles(id) on delete restrict,
  submitted_by uuid references public.profiles(id) on delete set null,
  submitted_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  rejected_by uuid references public.profiles(id) on delete set null,
  rejected_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint premium_rule_name_length check (char_length(btrim(name)) between 2 and 120),
  constraint premium_rule_effective_order check (
    effective_to is null or effective_to >= effective_from
  ),
  constraint premium_rule_scope_target check (
    (scope_type = 'company_default' and employment_type is null
      and department_id is null and position_id is null and payroll_group_id is null)
    or (scope_type = 'employment_type' and employment_type is not null
      and department_id is null and position_id is null and payroll_group_id is null)
    or (scope_type = 'department' and employment_type is null
      and department_id is not null and position_id is null and payroll_group_id is null)
    or (scope_type = 'position' and employment_type is null
      and department_id is null and position_id is not null and payroll_group_id is null)
    or (scope_type = 'payroll_group' and employment_type is null
      and department_id is null and position_id is null and payroll_group_id is not null)
  ),
  constraint premium_rule_approved_no_overlap exclude using gist (
    organization_id with =,
    scope_key with =,
    daterange(effective_from, coalesce(effective_to + 1, 'infinity'::date), '[)') with &&
  ) where (status = 'approved')
);

create unique index premium_rule_request_unique
  on public.premium_rule_sets(created_by, request_id);
create index premium_rule_scope_effective_idx
  on public.premium_rule_sets(scope_key, status, effective_from desc);
```

Create one child matrix row per day type:

```sql
create table public.premium_rule_versions (
  id uuid primary key default gen_random_uuid(),
  premium_rule_set_id uuid not null
    references public.premium_rule_sets(id) on delete restrict,
  version_number integer not null check (version_number >= 1),
  day_type public.premium_day_type not null,
  regular_time_multiplier numeric(8,5) not null
    check (regular_time_multiplier > 0 and regular_time_multiplier <= 10),
  overtime_multiplier numeric(8,5) not null
    check (overtime_multiplier > 0 and overtime_multiplier <= 10),
  additional_premium_only boolean not null default true,
  night_differential_percentage numeric(8,5) not null
    check (night_differential_percentage >= 0 and night_differential_percentage <= 5),
  night_window_start time not null,
  night_window_end time not null,
  overtime_rounding_mode public.premium_time_rounding_mode not null,
  overtime_rounding_increment_minutes integer
    check (overtime_rounding_increment_minutes is null
      or overtime_rounding_increment_minutes between 1 and 1440),
  night_rounding_mode public.premium_time_rounding_mode not null,
  night_rounding_increment_minutes integer
    check (night_rounding_increment_minutes is null
      or night_rounding_increment_minutes between 1 and 1440),
  created_at timestamptz not null default now(),
  constraint premium_rule_day_unique unique (premium_rule_set_id, day_type),
  constraint premium_rule_overtime_increment_required check (
    (overtime_rounding_mode = 'exact_minutes'
      and overtime_rounding_increment_minutes is null)
    or (overtime_rounding_mode <> 'exact_minutes'
      and overtime_rounding_increment_minutes is not null)
  ),
  constraint premium_rule_night_increment_required check (
    (night_rounding_mode = 'exact_minutes'
      and night_rounding_increment_minutes is null)
    or (night_rounding_mode <> 'exact_minutes'
      and night_rounding_increment_minutes is not null)
  )
);
```

Create `attendance_deduction_rules` with the same scope targeting, workflow fields, `scope_key`, and approved-range exclusion constraint. Its rule fields are:

```sql
late_grace_minutes integer not null check (late_grace_minutes between 0 and 1440),
undertime_grace_minutes integer not null check (undertime_grace_minutes between 0 and 1440),
late_rounding_mode public.premium_time_rounding_mode not null,
late_rounding_increment_minutes integer,
undertime_rounding_mode public.premium_time_rounding_mode not null,
undertime_rounding_increment_minutes integer,
deduct_beyond_grace_only boolean not null default true
  check (deduct_beyond_grace_only)
```

Use `supersedes_rule_id`, `version`, `request_id`, submit/approve/reject fields, timestamps, and the same scope-target check.

- [ ] **Step 4: Add holiday classification and calculation tables**

Extend holiday versions without allowing duplicate active holidays on the same date:

```sql
alter table public.holiday_calendar_versions
  add column if not exists holiday_count smallint not null default 1,
  add constraint holiday_calendar_versions_count_check
    check (holiday_count in (1, 2));

alter table public.payroll_employee_entries
  add column if not exists premium_earnings_raw numeric(18,6) not null default 0,
  add column if not exists premium_earnings_rounded numeric(14,2) not null default 0,
  add column if not exists night_differential_raw numeric(18,6) not null default 0,
  add column if not exists night_differential_rounded numeric(14,2) not null default 0,
  add column if not exists revised_gross_pay_raw numeric(18,6) not null default 0,
  add column if not exists revised_gross_pay_rounded numeric(14,2) not null default 0,
  add column if not exists premium_calculated_at timestamptz;

alter table public.payroll_entry_daily_breakdowns
  add column if not exists attendance_deduction_rule_id uuid
    references public.attendance_deduction_rules(id) on delete restrict,
  add column if not exists late_grace_minutes integer not null default 0,
  add column if not exists late_deductible_minutes integer not null default 0,
  add column if not exists undertime_grace_minutes integer not null default 0,
  add column if not exists undertime_deductible_minutes integer not null default 0;
```

Create calculation tables:

```sql
create table public.payroll_day_type_resolutions (
  id uuid primary key default gen_random_uuid(),
  payroll_employee_entry_id uuid not null
    references public.payroll_employee_entries(id) on delete restrict,
  work_date date not null,
  base_day_type public.premium_day_type not null,
  is_rest_day boolean not null,
  holiday_version_id uuid
    references public.holiday_calendar_versions(id) on delete restrict,
  holiday_type text,
  holiday_count smallint not null default 1 check (holiday_count in (1,2)),
  combined_day_type public.premium_day_type not null,
  resolution_source jsonb not null default '{}'::jsonb,
  premium_rule_set_id uuid not null
    references public.premium_rule_sets(id) on delete restrict,
  premium_rule_version_id uuid not null
    references public.premium_rule_versions(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint payroll_day_type_entry_date_unique
    unique (payroll_employee_entry_id, work_date)
);

create table public.payroll_premium_lines (
  id uuid primary key default gen_random_uuid(),
  payroll_employee_entry_id uuid not null
    references public.payroll_employee_entries(id) on delete restrict,
  payroll_entry_daily_breakdown_id uuid not null
    references public.payroll_entry_daily_breakdowns(id) on delete restrict,
  work_date date not null,
  premium_type public.premium_type not null,
  day_type public.premium_day_type not null,
  premium_rule_set_id uuid not null
    references public.premium_rule_sets(id) on delete restrict,
  premium_rule_version_id uuid not null
    references public.premium_rule_versions(id) on delete restrict,
  base_hourly_rate_raw numeric(18,9) not null,
  raw_minutes integer not null check (raw_minutes >= 0),
  rounded_minutes integer not null check (rounded_minutes >= 0),
  day_multiplier numeric(8,5) not null,
  overtime_multiplier numeric(8,5) not null,
  night_percentage numeric(8,5) not null,
  base_amount_raw numeric(18,6) not null,
  premium_amount_raw numeric(18,6) not null,
  premium_amount_rounded numeric(14,2) not null,
  is_additional_only boolean not null,
  calculation_details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint payroll_premium_line_unique
    unique (payroll_employee_entry_id, work_date, premium_type)
);
```

Create append-only event tables with actor, reason, previous/new values or metadata, and timestamps:

```sql
create table public.premium_rule_events (
  id uuid primary key default gen_random_uuid(),
  premium_rule_set_id uuid references public.premium_rule_sets(id) on delete restrict,
  premium_rule_version_id uuid references public.premium_rule_versions(id) on delete restrict,
  attendance_deduction_rule_id uuid
    references public.attendance_deduction_rules(id) on delete restrict,
  event_type text not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  reason text,
  previous_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.premium_calculation_events (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.payroll_periods(id) on delete restrict,
  payroll_employee_entry_id uuid
    references public.payroll_employee_entries(id) on delete restrict,
  payroll_premium_line_id uuid
    references public.payroll_premium_lines(id) on delete restrict,
  employee_id uuid references public.employees(id) on delete restrict,
  event_type text not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

- [ ] **Step 5: Seed the immutable statutory reference preset**

Seed one template with these exact rule values:

```text
regular_workday: day 1.00, OT 1.25, ND 0.10
rest_day: day 1.30, OT 1.30, ND 0.10
special_non_working_day: day 1.30, OT 1.30, ND 0.10
special_day_rest_day: day 1.50, OT 1.30, ND 0.10
regular_holiday: day 2.00, OT 1.30, ND 0.10
regular_holiday_rest_day: day 2.60, OT 1.30, ND 0.10
double_regular_holiday: day 3.00, OT 1.30, ND 0.10
double_regular_holiday_rest_day: day 3.90, OT 1.30, ND 0.10
night window: 22:00 through 06:00
rounding: exact minutes
```

Use an idempotent insert:

```sql
insert into public.premium_rule_presets(
  code,name,country_code,source_agency,source_reference,
  source_publication_date,source_url,day_rules
) values (
  'ph_dole_2024_reference',
  'Philippine statutory premium reference',
  'PH',
  'DOLE/Bureau of Working Conditions',
  'Handbook on Workers'' Statutory Monetary Benefits, 2024 Edition',
  date '2024-11-01',
  'https://nwpc.dole.gov.ph/wp-content/uploads/2024/11/Workers-Statutory-Monetary-Benefits-Handbook-2024-Edition.pdf',
  jsonb_build_array(
    jsonb_build_object('day_type','regular_workday','regular_time_multiplier',1.00,'overtime_multiplier',1.25,'additional_premium_only',true,'night_differential_percentage',0.10,'night_window_start','22:00','night_window_end','06:00','overtime_rounding_mode','exact_minutes','overtime_rounding_increment_minutes',null,'night_rounding_mode','exact_minutes','night_rounding_increment_minutes',null),
    jsonb_build_object('day_type','rest_day','regular_time_multiplier',1.30,'overtime_multiplier',1.30,'additional_premium_only',false,'night_differential_percentage',0.10,'night_window_start','22:00','night_window_end','06:00','overtime_rounding_mode','exact_minutes','overtime_rounding_increment_minutes',null,'night_rounding_mode','exact_minutes','night_rounding_increment_minutes',null),
    jsonb_build_object('day_type','special_non_working_day','regular_time_multiplier',1.30,'overtime_multiplier',1.30,'additional_premium_only',true,'night_differential_percentage',0.10,'night_window_start','22:00','night_window_end','06:00','overtime_rounding_mode','exact_minutes','overtime_rounding_increment_minutes',null,'night_rounding_mode','exact_minutes','night_rounding_increment_minutes',null),
    jsonb_build_object('day_type','special_day_rest_day','regular_time_multiplier',1.50,'overtime_multiplier',1.30,'additional_premium_only',false,'night_differential_percentage',0.10,'night_window_start','22:00','night_window_end','06:00','overtime_rounding_mode','exact_minutes','overtime_rounding_increment_minutes',null,'night_rounding_mode','exact_minutes','night_rounding_increment_minutes',null),
    jsonb_build_object('day_type','regular_holiday','regular_time_multiplier',2.00,'overtime_multiplier',1.30,'additional_premium_only',true,'night_differential_percentage',0.10,'night_window_start','22:00','night_window_end','06:00','overtime_rounding_mode','exact_minutes','overtime_rounding_increment_minutes',null,'night_rounding_mode','exact_minutes','night_rounding_increment_minutes',null),
    jsonb_build_object('day_type','regular_holiday_rest_day','regular_time_multiplier',2.60,'overtime_multiplier',1.30,'additional_premium_only',false,'night_differential_percentage',0.10,'night_window_start','22:00','night_window_end','06:00','overtime_rounding_mode','exact_minutes','overtime_rounding_increment_minutes',null,'night_rounding_mode','exact_minutes','night_rounding_increment_minutes',null),
    jsonb_build_object('day_type','double_regular_holiday','regular_time_multiplier',3.00,'overtime_multiplier',1.30,'additional_premium_only',true,'night_differential_percentage',0.10,'night_window_start','22:00','night_window_end','06:00','overtime_rounding_mode','exact_minutes','overtime_rounding_increment_minutes',null,'night_rounding_mode','exact_minutes','night_rounding_increment_minutes',null),
    jsonb_build_object('day_type','double_regular_holiday_rest_day','regular_time_multiplier',3.90,'overtime_multiplier',1.30,'additional_premium_only',false,'night_differential_percentage',0.10,'night_window_start','22:00','night_window_end','06:00','overtime_rounding_mode','exact_minutes','overtime_rounding_increment_minutes',null,'night_rounding_mode','exact_minutes','night_rounding_increment_minutes',null)
  )
) on conflict (code) do nothing;
```

The preset is never joined by the calculation engine. Only a protected clone RPC may convert it into a draft.

- [ ] **Step 6: Add immutability, RLS, privileges, and indexes**

Implement:

```sql
create or replace function public.reject_premium_calculation_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception using errcode='P0001', message='PAYROLL_PREMIUM_IMMUTABLE';
end;
$$;
```

Attach `before update or delete` triggers to:

```text
premium_rule_presets
payroll_day_type_resolutions
payroll_premium_lines
premium_rule_events
premium_calculation_events
```

Add a separate trigger to `premium_rule_sets`, `premium_rule_versions`, and `attendance_deduction_rules` that permits draft updates but raises `PAYROLL_PREMIUM_RULE_IMMUTABLE` when the old row is approved, superseded, or rejected.

Enable RLS on all eight tables. Add HR-only select policies using `public.is_hr_admin()`. Revoke all table privileges from `authenticated`, then grant select only. Revoke all from `public` and `anon`.

- [ ] **Step 7: Run migration and security tests**

```bash
npm test -- \
  src/features/payroll/premiums/migration.test.ts \
  src/features/payroll/premiums/security.test.ts \
  src/features/payroll/calculation/migration.test.ts \
  src/features/payroll/calculation/security.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit the schema foundation**

```bash
git add supabase/migrations/202607190003_payroll_premium_rules.sql \
  src/features/payroll/premiums/migration.test.ts \
  src/features/payroll/premiums/security.test.ts \
  src/features/payroll/calculation/migration.test.ts \
  src/features/payroll/calculation/security.test.ts
git commit -m "feat: add premium rules schema"
```

---

### Task 3: Extend holiday configuration for single and double regular holidays

**Files:**
- Modify: `supabase/migrations/202607190003_payroll_premium_rules.sql`
- Modify: `src/features/overtime/holidays/types.ts`
- Modify: `src/features/overtime/holidays/validation.ts`
- Modify: `src/features/overtime/holidays/validation.test.ts`
- Modify: `src/features/overtime/holidays/queries.ts`
- Modify: `src/features/overtime/holidays/queries.test.ts`
- Modify: `src/app/(dashboard)/settings/holidays/actions.ts`
- Modify: `src/components/overtime/holiday-form.tsx`
- Modify: `src/components/overtime/holiday-replacement-form.tsx`
- Modify: `src/app/(dashboard)/settings/holidays/[holidayGroupId]/page.tsx`
- Modify: `src/app/(dashboard)/settings/holidays/page.tsx`
- Modify: `src/features/overtime/actions.test.ts`
- Modify: `src/features/overtime/ui.test.ts`

**Interfaces:**
- Consumes: `holiday_calendar_versions.holiday_count`.
- Produces: validated single/double classification used by day-type resolution.

- [ ] **Step 1: Write failing holiday validation tests**

Add to `src/features/overtime/holidays/validation.test.ts`:

```ts
test("regular holidays accept one or two overlapping legal holidays", () => {
  const single = validHolidayForm("regular_holiday");
  single.set("holiday_count", "1");
  assert.equal(validateHolidayCreate(single).data?.holidayCount, 1);

  const double = validHolidayForm("regular_holiday");
  double.set("holiday_count", "2");
  assert.equal(validateHolidayCreate(double).data?.holidayCount, 2);
});

test("special and company holidays cannot use double regular classification", () => {
  const special = validHolidayForm("special_non_working_holiday");
  special.set("holiday_count", "2");
  assert.ok(validateHolidayCreate(special).state?.fieldErrors?.holiday_count);
});
```

Update query/action/UI static tests to require `holiday_count` in selects, RPC arguments, and both forms.

- [ ] **Step 2: Run focused holiday tests**

```bash
npm test -- \
  src/features/overtime/holidays/validation.test.ts \
  src/features/overtime/holidays/queries.test.ts \
  src/features/overtime/actions.test.ts \
  src/features/overtime/ui.test.ts
```

Expected: FAIL because the current contracts do not expose `holiday_count`.

- [ ] **Step 3: Replace the holiday RPCs in the new migration**

Drop and recreate the exact existing signatures only when PostgreSQL requires a changed signature, then expose backward-compatible functions with a default trailing parameter:

```sql
create or replace function public.create_holiday(
  p_holiday_date date,
  p_holiday_name text,
  p_holiday_type text,
  p_change_reason text default null,
  p_holiday_count smallint default 1
) returns uuid
```

```sql
create or replace function public.replace_holiday_version(
  p_holiday_group_id uuid,
  p_expected_active_version_id uuid,
  p_holiday_date date,
  p_holiday_name text,
  p_holiday_type text,
  p_is_active boolean,
  p_change_reason text,
  p_holiday_count smallint default 1
) returns uuid
```

Both functions must enforce:

```sql
if p_holiday_count not in (1,2) then
  raise exception using errcode='P0001', message='HOLIDAY_COUNT_INVALID';
end if;

if p_holiday_count = 2 and p_holiday_type <> 'regular_holiday' then
  raise exception using errcode='P0001', message='HOLIDAY_DOUBLE_REQUIRES_REGULAR';
end if;
```

Store `holiday_count` in every inserted version and include it in holiday audit JSON. Preserve the existing one-active-holiday-per-date rule.

- [ ] **Step 4: Extend the TypeScript holiday contract and validation**

In `src/features/overtime/holidays/types.ts` add:

```ts
holiday_count: 1 | 2;
```

to `HolidayCalendarVersion`, and:

```ts
holidayCount?: "1" | "2";
```

to `HolidayActionState["values"]`.

In `validation.ts`, parse:

```ts
const holidayCountText = String(formData.get("holiday_count") ?? "1").trim();
const holidayCount = Number(holidayCountText);

if (holidayCount !== 1 && holidayCount !== 2) {
  fieldErrors.holiday_count = "Choose single or double regular holiday.";
}
if (holidayCount === 2 && holidayType !== "regular_holiday") {
  fieldErrors.holiday_count = "Double classification is available only for regular holidays.";
}
```

Return `holidayCount: holidayCount as 1 | 2` from both validators.

- [ ] **Step 5: Update server actions, queries, and forms**

Pass:

```ts
p_holiday_count: validation.data.holidayCount,
```

from both actions.

Include `holiday_count` in `versionSelect`.

Add a form field:

```tsx
<label className="form-field">
  <span>Holiday count</span>
  <select className="field" name="holiday_count" defaultValue={state.values?.holidayCount ?? "1"}>
    <option value="1">Single holiday</option>
    <option value="2">Double regular holiday</option>
  </select>
  {state.fieldErrors?.holiday_count ? (
    <span className="form-error">{state.fieldErrors.holiday_count}</span>
  ) : null}
</label>
```

Show `Double regular holiday` in list/detail pages when `holiday_count === 2`.

- [ ] **Step 6: Run focused tests and commit**

```bash
npm test -- \
  src/features/overtime/holidays/validation.test.ts \
  src/features/overtime/holidays/queries.test.ts \
  src/features/overtime/actions.test.ts \
  src/features/overtime/ui.test.ts
```

Expected: PASS.

```bash
git add supabase/migrations/202607190003_payroll_premium_rules.sql \
  src/features/overtime/holidays \
  'src/app/(dashboard)/settings/holidays' \
  src/components/overtime/holiday-form.tsx \
  src/components/overtime/holiday-replacement-form.tsx \
  src/features/overtime/actions.test.ts \
  src/features/overtime/ui.test.ts
git commit -m "feat: classify double regular holidays"
```

---

### Task 4: Implement premium-rule and attendance-rule workflow RPCs

**Files:**
- Modify: `supabase/migrations/202607190003_payroll_premium_rules.sql`
- Modify: `src/features/payroll/premiums/migration.test.ts`
- Modify: `src/features/payroll/premiums/security.test.ts`

**Interfaces:**
- Consumes: rule schema from Task 2.
- Produces: draft creation, preset cloning, submission, approval, rejection, cloning, listing, detail, approval queue, and coverage preview RPCs.

- [ ] **Step 1: Add failing RPC contract tests**

Add this exact RPC list to `migration.test.ts`:

```ts
const workflowRpcs = [
  "create_premium_rule_set",
  "clone_premium_rule_preset",
  "clone_premium_rule_version",
  "submit_premium_rule_set",
  "approve_premium_rule_set",
  "reject_premium_rule_set",
  "create_attendance_deduction_rule",
  "clone_attendance_deduction_rule",
  "submit_attendance_deduction_rule",
  "approve_attendance_deduction_rule",
  "reject_attendance_deduction_rule",
  "list_premium_rule_sets",
  "get_premium_rule_set_detail",
  "list_attendance_deduction_rules",
  "list_premium_rule_approvals",
  "preview_premium_rule_coverage",
];

test("migration declares every protected premium workflow RPC", () => {
  for (const rpc of workflowRpcs) {
    assert.match(sql, new RegExp(`create or replace function public\\.${rpc}\\s*\\(`, "i"));
  }
});
```

Add security assertions that each public RPC uses `SECURITY DEFINER`, restricted `search_path`, explicit actor checks, anon revocation, and authenticated grant.

- [ ] **Step 2: Run focused tests**

```bash
npm test -- \
  src/features/payroll/premiums/migration.test.ts \
  src/features/payroll/premiums/security.test.ts
```

Expected: FAIL because the workflow RPCs are absent.

- [ ] **Step 3: Implement common validation helpers**

Add internal helpers:

```sql
public.validate_premium_rule_scope(
  p_scope_type public.premium_rule_scope_type,
  p_employment_type public.employment_type,
  p_department_id uuid,
  p_position_id uuid,
  p_payroll_group_id uuid
) returns text
```

It returns the same `scope_key` representation used by the generated column and raises `PAYROLL_PREMIUM_SCOPE_INVALID` for an invalid target combination.

Add:

```sql
public.validate_premium_day_rules(p_day_rules jsonb) returns void
```

It must enforce:

- JSON array with exactly eight objects.
- Every supported day type appears exactly once.
- No unsupported day type.
- Multipliers are positive and no more than 10.
- Night percentage is between 0 and 5.
- `HH:MM` night-window values parse as `time`.
- Exact-minute mode has a null increment.
- Other modes have an increment from 1 through 1440.

Add event writers:

```sql
public.write_premium_rule_event(...)
public.write_premium_calculation_event(...)
```

Revoke these helpers from browser roles.

- [ ] **Step 4: Implement premium-rule draft and clone RPCs**

Use this public input contract:

```sql
create or replace function public.create_premium_rule_set(
  p_name text,
  p_scope_type public.premium_rule_scope_type,
  p_employment_type public.employment_type,
  p_department_id uuid,
  p_position_id uuid,
  p_payroll_group_id uuid,
  p_effective_from date,
  p_effective_to date,
  p_change_reason text,
  p_source_agency text,
  p_source_reference text,
  p_source_publication_date date,
  p_source_url text,
  p_day_rules jsonb,
  p_request_id uuid
) returns uuid
```

Requirements:

- HR Admin or Super Admin actor.
- Validate all fields before insert.
- Create one draft parent and eight child rows.
- Use `(created_by, request_id)` for idempotency.
- Write `created` event.

Implement:

```sql
clone_premium_rule_preset(
  p_preset_code text,
  p_name text,
  p_scope_type public.premium_rule_scope_type,
  p_employment_type public.employment_type,
  p_department_id uuid,
  p_position_id uuid,
  p_payroll_group_id uuid,
  p_effective_from date,
  p_effective_to date,
  p_change_reason text,
  p_request_id uuid
) returns uuid
```

It copies source metadata and JSON day rules into a draft and never changes the preset.

Implement:

```sql
clone_premium_rule_version(
  p_rule_set_id uuid,
  p_effective_from date,
  p_effective_to date,
  p_change_reason text,
  p_request_id uuid
) returns uuid
```

It creates a new draft with `supersedes_rule_set_id`, increments the family version, and copies all child matrix rows.

- [ ] **Step 5: Implement submit, approve, and reject**

Use optimistic versions:

```sql
submit_premium_rule_set(
  p_rule_set_id uuid,
  p_expected_version integer,
  p_request_id uuid
) returns boolean
```

```sql
approve_premium_rule_set(
  p_rule_set_id uuid,
  p_expected_version integer,
  p_request_id uuid
) returns boolean
```

```sql
reject_premium_rule_set(
  p_rule_set_id uuid,
  p_expected_version integer,
  p_reason text,
  p_request_id uuid
) returns boolean
```

Approval must:

1. Require Super Admin.
2. Lock the candidate row.
3. Require `pending_approval`.
4. Verify exactly eight child day rows.
5. Verify legal-source metadata is nonblank.
6. Verify no approved overlap for the scope.
7. Close the superseded approved row at `effective_from - 1` only when the replacement starts later; otherwise mark it superseded without mutating historical calculation records.
8. Mark the candidate approved.
9. Write `approved` and optional `superseded` events.
10. Mark affected open/under-review entries stale through the helper added in Task 6.

Rejection requires a nonblank reason and writes a `rejected` event.

- [ ] **Step 6: Implement attendance deduction workflows**

Use parallel signatures with the exact fields from `AttendanceDeductionRuleInput`. A rule may be absent; the calculation fallback is zero grace and exact minutes.

Approval must enforce:

```text
late_grace_minutes >= 0
undertime_grace_minutes >= 0
deduct_beyond_grace_only = true
no same-scope approved overlap
valid rounding increments
```

- [ ] **Step 7: Implement read and preview RPCs**

Return camel-normalizable snake-case JSON:

```sql
list_premium_rule_sets() returns jsonb
get_premium_rule_set_detail(p_rule_set_id uuid) returns jsonb
list_attendance_deduction_rules() returns jsonb
list_premium_rule_approvals() returns jsonb
preview_premium_rule_coverage(p_rule_set_id uuid) returns jsonb
```

`list_premium_rule_sets()` returns:

```json
{
  "rules": [],
  "presets": [],
  "departments": [],
  "positions": [],
  "payroll_groups": []
}
```

Coverage preview counts employees whose effective employment, department, job title, or payroll schedule assignment matches the candidate scope; counts open/under-review periods intersecting its dates; identifies current entries that would become stale; lists approved rule conflicts; and lists missing matrix day types. It performs no writes.

- [ ] **Step 8: Add grants and run tests**

Grant authenticated execution only on public workflow/read RPCs. Revoke all internal helper execution from browser roles.

```bash
npm test -- \
  src/features/payroll/premiums/migration.test.ts \
  src/features/payroll/premiums/security.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit workflow RPCs**

```bash
git add supabase/migrations/202607190003_payroll_premium_rules.sql \
  src/features/payroll/premiums/migration.test.ts \
  src/features/payroll/premiums/security.test.ts
git commit -m "feat: add premium rule approval workflows"
```

---

### Task 5: Implement scope resolution, day-type resolution, rounding, and premium time segments

**Files:**
- Modify: `supabase/migrations/202607190003_payroll_premium_rules.sql`
- Create: `src/features/payroll/premiums/formulas.test.ts`
- Modify: `src/features/payroll/premiums/migration.test.ts`

**Interfaces:**
- Consumes: approved rule and holiday data.
- Produces:
  - `resolve_employee_premium_rule(...)`
  - `resolve_attendance_deduction_rule(...)`
  - `resolve_employee_day_type(...)`
  - `round_premium_minutes(...)`
  - `resolve_payroll_premium_segments(...)`

- [ ] **Step 1: Write failing formula and helper contract tests**

Create `formulas.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL("../../../../supabase/migrations/202607190003_payroll_premium_rules.sql", import.meta.url),
  "utf8",
).catch(() => "");

test("premium scope resolution follows the approved precedence", () => {
  const body = sql.match(
    /create or replace function public\.resolve_employee_premium_rule[\s\S]*?\$\$;/i,
  )?.[0] ?? "";
  const payrollGroup = body.indexOf("payroll_group");
  const position = body.indexOf("position");
  const department = body.indexOf("department");
  const employment = body.indexOf("employment_type");
  const company = body.indexOf("company_default");
  assert.ok(payrollGroup >= 0);
  assert.ok(payrollGroup < position);
  assert.ok(position < department);
  assert.ok(department < employment);
  assert.ok(employment < company);
});

test("day types include explicit holiday and rest-day combinations", () => {
  for (const value of [
    "special_day_rest_day",
    "regular_holiday_rest_day",
    "double_regular_holiday",
    "double_regular_holiday_rest_day",
  ]) assert.match(sql, new RegExp(value));
  assert.match(sql, /MISSING_HOLIDAY_CONFIGURATION/);
});

test("minute rounding has exact, down, up, and nearest behavior", () => {
  assert.match(sql, /create or replace function public\.round_premium_minutes/i);
  assert.match(sql, /when 'exact_minutes'/i);
  assert.match(sql, /when 'round_down'/i);
  assert.match(sql, /when 'round_up'/i);
  assert.match(sql, /when 'nearest_increment'/i);
});

test("rest and holiday segments split ordinary and overtime at the standard day", () => {
  const body = sql.match(
    /create or replace function public\.resolve_payroll_premium_segments[\s\S]*?\$\$;/i,
  )?.[0] ?? "";
  assert.match(body, /segment_type in \('rest_day','holiday_work'\)/i);
  assert.match(body, /standard_hours_per_day/i);
  assert.match(body, /least\(/i);
  assert.match(body, /greatest\(/i);
});
```

- [ ] **Step 2: Run the failing test**

```bash
npm test -- src/features/payroll/premiums/formulas.test.ts
```

Expected: FAIL because the helpers are absent.

- [ ] **Step 3: Implement deterministic minute rounding**

```sql
create or replace function public.round_premium_minutes(
  p_minutes integer,
  p_mode public.premium_time_rounding_mode,
  p_increment integer
) returns integer
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare v_minutes integer := greatest(coalesce(p_minutes,0),0);
begin
  if p_mode = 'exact_minutes' then return v_minutes; end if;
  if p_increment is null or p_increment <= 0 then
    raise exception using errcode='P0001', message='PAYROLL_PREMIUM_ROUNDING_INVALID';
  end if;
  return case p_mode
    when 'round_down' then floor(v_minutes::numeric / p_increment)::integer * p_increment
    when 'round_up' then ceil(v_minutes::numeric / p_increment)::integer * p_increment
    when 'nearest_increment' then round(v_minutes::numeric / p_increment)::integer * p_increment
    else v_minutes
  end;
end;
$$;
```

- [ ] **Step 4: Implement premium-rule resolution**

Implement:

```sql
resolve_employee_premium_rule(
  p_employee_id uuid,
  p_payroll_period_id uuid,
  p_work_date date,
  p_day_type public.premium_day_type
) returns table (
  premium_rule_set_id uuid,
  premium_rule_version_id uuid,
  scope_type public.premium_rule_scope_type,
  scope_key text,
  regular_time_multiplier numeric,
  overtime_multiplier numeric,
  additional_premium_only boolean,
  night_differential_percentage numeric,
  night_window_start time,
  night_window_end time,
  overtime_rounding_mode public.premium_time_rounding_mode,
  overtime_rounding_increment_minutes integer,
  night_rounding_mode public.premium_time_rounding_mode,
  night_rounding_increment_minutes integer
)
```

Resolve the employee’s approved payroll schedule assignment for `p_work_date`, then query approved matching rules in this exact precedence order:

```sql
order by case rule.scope_type
  when 'payroll_group' then 1
  when 'position' then 2
  when 'department' then 3
  when 'employment_type' then 4
  when 'company_default' then 5
end
```

Limit by effective date and matching day child. Raise:

```text
MISSING_COMPANY_DEFAULT_PREMIUM_RULE
MISSING_PREMIUM_RULE
CONFLICTING_PREMIUM_RULE
```

when resolution cannot safely return exactly one winning rule.

- [ ] **Step 5: Implement attendance deduction rule resolution**

Implement the same precedence. When no approved matching rule exists, return one virtual row:

```text
rule_id = null
late_grace_minutes = 0
undertime_grace_minutes = 0
late_rounding_mode = exact_minutes
undertime_rounding_mode = exact_minutes
increments = null
resolution_source = phase10b1_zero_grace_default
```

- [ ] **Step 6: Implement explicit day-type resolution**

Implement:

```sql
resolve_employee_day_type(
  p_employee_id uuid,
  p_payroll_period_id uuid,
  p_work_date date
) returns table (
  base_day_type public.premium_day_type,
  is_rest_day boolean,
  holiday_version_id uuid,
  holiday_type text,
  holiday_count smallint,
  combined_day_type public.premium_day_type,
  resolution_source jsonb
)
```

Rules:

```text
No holiday + scheduled day       → regular_workday
No holiday + rest day            → rest_day
Special + scheduled day          → special_non_working_day
Special + rest day               → special_day_rest_day
Regular count 1 + scheduled day  → regular_holiday
Regular count 1 + rest day       → regular_holiday_rest_day
Regular count 2 + scheduled day  → double_regular_holiday
Regular count 2 + rest day       → double_regular_holiday_rest_day
Company holiday                  → use configured holiday behavior only when a supported premium mapping exists; otherwise block
Double special                   → MISSING_HOLIDAY_CONFIGURATION
Invalid count/type combination   → MISSING_HOLIDAY_CONFIGURATION
```

Use the effective work-schedule assignment and active work-schedule version for rest-day determination. Store schedule assignment/version, holiday version, holiday type/count, and weekday in `resolution_source`.

- [ ] **Step 7: Implement payable time-segment resolution**

Implement:

```sql
resolve_payroll_premium_segments(
  p_payroll_employee_entry_id uuid,
  p_work_date date
) returns table (
  segment_key text,
  segment_kind text,
  source_segment_type text,
  source_revision_id uuid,
  source_approval_item_id uuid,
  segment_start_at timestamptz,
  segment_end_at timestamptz,
  raw_minutes integer
)
```

Rules:

1. Regular scheduled ordinary segment:
   - Use finalized attendance `actual_clock_in_at`/`actual_clock_out_at`.
   - Intersect with scheduled start/end.
   - Emit `ordinary`.
2. Approved `pre_shift` and `post_shift` segments:
   - Emit `overtime`.
3. Approved `rest_day` or `holiday_work`:
   - Use approved detected start/end.
   - Split chronologically at `standard_hours_per_day × 60`.
   - Emit first portion as `ordinary`.
   - Emit excess as `overtime`.
4. Pending, rejected, superseded, provisional, incomplete, or zero-minute sources emit no payable segment.
5. Segment minutes equal approved minutes, not unapproved detected minutes.
6. Use one deterministic `segment_key` per source and kind.

- [ ] **Step 8: Run tests and commit**

```bash
npm test -- \
  src/features/payroll/premiums/formulas.test.ts \
  src/features/payroll/premiums/migration.test.ts
```

Expected: PASS.

```bash
git add supabase/migrations/202607190003_payroll_premium_rules.sql \
  src/features/payroll/premiums/formulas.test.ts \
  src/features/payroll/premiums/migration.test.ts
git commit -m "feat: resolve premium rules and payable segments"
```

---

### Task 6: Implement premium formulas, night overlap, grace deductions, and immutable employee-entry versions

**Files:**
- Modify: `supabase/migrations/202607190003_payroll_premium_rules.sql`
- Modify: `src/features/payroll/premiums/formulas.test.ts`
- Modify: `src/features/payroll/calculation/migration.test.ts`
- Modify: `src/features/payroll/calculation/model.test.ts`

**Interfaces:**
- Consumes: resolved day type, rule, rate, and segments.
- Produces:
  - `calculate_employee_premiums_internal(...)`
  - `calculate_payroll_premiums(...)`
  - revised `calculate_payroll_employee_internal(...)`
  - revised `recalculate_payroll_employee(...)`

- [ ] **Step 1: Add failing calculation contract tests**

Add to `formulas.test.ts`:

```ts
test("ordinary premiums subtract only the base already included", () => {
  assert.match(sql, /included_base_multiplier/i);
  assert.match(sql, /regular_time_multiplier\s*-\s*v_included_base_multiplier/i);
  assert.match(sql, /greatest\([^;]*,\s*0\)/i);
});

test("night differential uses the applicable ordinary or overtime premium base", () => {
  assert.match(sql, /calculate_night_overlap_minutes/i);
  assert.match(sql, /night_differential_percentage/i);
  assert.match(sql, /day_multiplier\s*\*\s*overtime_multiplier/i);
  assert.match(sql, /'night_differential'/i);
});

test("premium calculation writes a new immutable employee entry version", () => {
  assert.match(sql, /create or replace function public\.calculate_payroll_premiums/i);
  assert.match(sql, /calculate_payroll_employee_internal\([^;]*true/i);
  assert.match(sql, /previous_entry_id/i);
  assert.match(sql, /premium_calculated_at/i);
});
```

Extend `calculation/migration.test.ts` to require the overridden Phase 10B.1 internal function and premium wrapper.

- [ ] **Step 2: Run focused tests**

```bash
npm test -- \
  src/features/payroll/premiums/formulas.test.ts \
  src/features/payroll/calculation/migration.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement cross-midnight night overlap**

Add an immutable helper:

```sql
calculate_night_overlap_minutes(
  p_segment_start timestamptz,
  p_segment_end timestamptz,
  p_work_date date,
  p_window_start time,
  p_window_end time
) returns integer
```

For a crossing window such as 22:00–06:00, evaluate both intervals touching the work date:

```text
work_date 00:00–06:00
work_date 22:00–next day 06:00
```

Return the union overlap in whole minutes without double counting.

- [ ] **Step 4: Override the Phase 10B.1 employee calculator with a premium flag**

Recreate:

```sql
calculate_payroll_employee_internal(
  p_calculation_run_id uuid,
  p_employee_id uuid,
  p_request_id uuid default null,
  p_include_premiums boolean default false
) returns jsonb
```

Copy the Phase 10B.1 function body, preserving every prior validation and snapshot. Make only these controlled changes:

1. Resolve an attendance deduction rule for each eligible work date.
2. Preserve source `late_minutes` and `undertime_minutes`.
3. Compute:

```sql
v_late_after_grace := greatest(v_late_minutes - v_late_grace_minutes, 0);
v_late_deductible_minutes := public.round_premium_minutes(
  v_late_after_grace,
  v_late_rounding_mode,
  v_late_rounding_increment_minutes
);

v_undertime_after_grace := greatest(v_undertime_minutes - v_undertime_grace_minutes, 0);
v_undertime_deductible_minutes := public.round_premium_minutes(
  v_undertime_after_grace,
  v_undertime_rounding_mode,
  v_undertime_rounding_increment_minutes
);
```

4. Use deductible minutes, not raw minutes, for monetary deductions.
5. Store rule IDs, raw minutes, grace, post-grace minutes, and deductible minutes in daily rows and snapshots.
6. Keep Phase 10B.1 calculation behavior when the virtual fallback applies.
7. After all daily rows exist, call `calculate_employee_premiums_internal(v_entry_id)` only when `p_include_premiums` is true.
8. Update entry totals with returned premium totals.
9. Set `premium_calculated_at = now()` only after premium calculation completes without a blocking exception.
10. Keep prior versions immutable and current-version switching exactly as Phase 10B.1.

- [ ] **Step 5: Implement the internal premium calculator**

Create:

```sql
calculate_employee_premiums_internal(
  p_payroll_employee_entry_id uuid
) returns jsonb
```

For each daily breakdown:

1. Resolve the explicit day type.
2. Resolve its approved premium rule.
3. Insert one immutable day-type resolution.
4. Resolve payable segments.
5. Calculate ordinary day premium:
   - Skip a regular-workday day line.
   - Determine whether Phase 10B.1 already included one base multiplier for the segment:
     ```text
     included = 1 when daily regular earnings cover the ordinary segment
     included = 0 otherwise
     ```
   - Incremental multiplier:
     ```sql
     greatest(rule.regular_time_multiplier - included_base_multiplier, 0)
     ```
   - Ordinary premium amount:
     ```sql
     hourly_rate × rounded_minutes / 60 × incremental_multiplier
     ```
6. Calculate overtime:
   ```sql
   hourly_rate × rounded_minutes / 60
     × regular_time_multiplier
     × overtime_multiplier
   ```
7. Calculate night differential separately for each segment:
   ```sql
   applicable_segment_base_amount × night_percentage
   ```
8. Aggregate by `work_date` and `premium_type` before insertion so the unique line key remains valid.
9. Store source segment IDs, raw/rounded minutes, included base multiplier, day multiplier, overtime multiplier, night overlap, formula text, and rule version in `calculation_details`.
10. Insert premium snapshots for the selected rule, day resolution, attendance deduction rule, holiday version, and approved overtime approval items.
11. Write calculation events.
12. Return:
    ```json
    {
      "premiumEarningsRaw": 0,
      "premiumEarningsRounded": 0,
      "nightDifferentialRaw": 0,
      "nightDifferentialRounded": 0,
      "revisedGrossPayRaw": 0,
      "revisedGrossPayRounded": 0,
      "blockingExceptionCount": 0
    }
    ```

Formula requirements:

```text
revised gross raw =
  Phase 10B.1 gross raw
  + non-ND premium raw
  + night differential raw

revised gross rounded =
  Phase 10B.1 gross rounded
  + non-ND premium rounded
  + night differential rounded
```

Do not modify `gross_pay_raw` or `gross_pay_rounded`.

- [ ] **Step 6: Implement controlled period premium calculation**

Create:

```sql
calculate_payroll_premiums(
  p_payroll_period_id uuid,
  p_mode text default 'uncalculated',
  p_employee_ids uuid[] default null,
  p_idempotency_key uuid default null
) returns jsonb
```

Requirements:

- HR Admin actor.
- Period must be open or under review.
- Acquire the existing `payroll-calculation:<period-id>` advisory lock.
- Require at least one approved company-default premium rule covering the period.
- Create a `payroll_calculation_runs` row using mode `premium` or `premium_recalculate`; first extend the existing mode check to include those values.
- Select current entries that are base-calculated and either lack `premium_calculated_at`, are stale, or are selected.
- Call `calculate_payroll_employee_internal(run_id, employee_id, request_id, true)` so every result is a new full immutable version.
- Catch employee failures and create employee-scoped exceptions.
- Return `completed` or `completed_with_exceptions`.
- Send a safe notification without amounts.

Recreate `recalculate_payroll_employee(...)` to call the internal function with `p_include_premiums = true` when an approved company-default rule exists for the period; otherwise retain base-only recalculation and let readiness report missing premium calculation.

- [ ] **Step 7: Add concrete exception behavior**

Create blocking exceptions using the approved codes:

```text
MISSING_PREMIUM_RULE
CONFLICTING_PREMIUM_RULE
MISSING_COMPANY_DEFAULT_PREMIUM_RULE
INVALID_DAY_TYPE_RESOLUTION
MISSING_HOLIDAY_CONFIGURATION
INVALID_NIGHT_WINDOW
PREMIUM_INPUT_CHANGED
```

One employee’s exception must not roll back successful employees.

- [ ] **Step 8: Run calculation tests and commit**

```bash
npm test -- \
  src/features/payroll/premiums/formulas.test.ts \
  src/features/payroll/calculation/migration.test.ts \
  src/features/payroll/calculation/model.test.ts
```

Expected: PASS.

```bash
git add supabase/migrations/202607190003_payroll_premium_rules.sql \
  src/features/payroll/premiums/formulas.test.ts \
  src/features/payroll/calculation/migration.test.ts \
  src/features/payroll/calculation/model.test.ts
git commit -m "feat: calculate immutable payroll premiums"
```

---

### Task 7: Add stale detection, readiness, JSON payloads, and safe notification routes

**Files:**
- Modify: `supabase/migrations/202607190003_payroll_premium_rules.sql`
- Modify: `src/features/payroll/premiums/migration.test.ts`
- Modify: `src/features/payroll/premiums/security.test.ts`
- Modify: `src/features/payroll/calculation/migration.test.ts`
- Modify: `src/features/payroll/calculation/security.test.ts`

**Interfaces:**
- Consumes: premium calculation data.
- Produces: correct staleness, period readiness, extended read RPCs, and notifications.

- [ ] **Step 1: Add failing stale/readiness tests**

Add assertions:

```ts
test("premium and holiday changes mark only intersecting open entries stale", () => {
  assert.match(sql, /mark_payroll_stale_from_premium_rule/i);
  assert.match(sql, /mark_payroll_stale_from_attendance_deduction_rule/i);
  assert.match(sql, /mark_payroll_stale_from_holiday_count/i);
  assert.match(sql, /status in \('open','under_review'\)/i);
  assert.match(sql, /premium_marked_stale/i);
});

test("readiness blocks missing premium calculations", () => {
  const body = sql.match(
    /create or replace function public\.check_payroll_period_readiness[\s\S]*?\$\$;/i,
  )?.[0] ?? "";
  assert.match(body, /missingPremiumEntryCount/i);
  assert.match(body, /premium_calculated_at is null/i);
});

test("new payroll notification routes are allow-listed", () => {
  assert.match(sql, /\/payroll\/settings\/premium-rules/);
  assert.match(sql, /\/payroll\/settings\/attendance-deduction-rules/);
  assert.match(sql, /\/payroll\/approvals\/premium-rules/);
});
```

- [ ] **Step 2: Run focused tests**

```bash
npm test -- \
  src/features/payroll/premiums/migration.test.ts \
  src/features/payroll/premiums/security.test.ts \
  src/features/payroll/calculation/migration.test.ts \
  src/features/payroll/calculation/security.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement stale helpers and triggers**

Add:

```sql
mark_payroll_entries_stale_for_premium_scope(
  p_scope_type public.premium_rule_scope_type,
  p_employment_type public.employment_type,
  p_department_id uuid,
  p_position_id uuid,
  p_payroll_group_id uuid,
  p_effective_from date,
  p_effective_to date,
  p_reason text,
  p_source_type public.payroll_source_type,
  p_source_record_id uuid
) returns integer
```

It updates only current entries in open/under-review periods intersecting the effective range and matching the scope. Set:

```sql
status = 'stale',
is_stale = true,
stale_reason = p_reason
```

and write both existing payroll calculation events and `premium_marked_stale` events.

Call it after approved premium-rule or attendance-rule changes.

Add a trigger on `holiday_calendar_versions` that marks intersecting open entries stale when active holiday date, type, count, or active state changes. Existing attendance/overtime recalculation remains responsible for refreshing source revisions; payroll stale state prevents review until recalculated.

- [ ] **Step 4: Extend readiness**

Recreate `check_payroll_period_readiness(uuid)` and add:

```sql
select count(*) into v_missing_premium
from public.payroll_employee_entries entry
where entry.payroll_period_id = p_payroll_period_id
  and entry.is_current
  and entry.status in ('calculated','recalculated')
  and not entry.is_stale
  and entry.premium_calculated_at is null
  and not exists (
    select 1
    from public.payroll_employee_exclusions exclusion
    where exclusion.payroll_period_id = entry.payroll_period_id
      and exclusion.employee_id = entry.employee_id
      and exclusion.reversed_at is null
  );
```

Return:

```sql
'missingPremiumEntryCount', v_missing_premium
```

and include `v_missing_premium = 0` in `ready`.

- [ ] **Step 5: Extend JSON helper and read RPCs**

Recreate `payroll_employee_entry_json(...)` to include all seven premium fields.

Recreate:

```text
get_payroll_calculation_workspace
get_payroll_employee_calculation_detail
list_payroll_entry_exceptions
```

Workspace adds summary totals and premium counts.

Employee detail adds:

```json
{
  "day_type_resolutions": [],
  "premium_lines": [],
  "premium_events": []
}
```

Exceptions include source links for premium rule, attendance rule, holiday, attendance, and overtime sources.

- [ ] **Step 6: Replace the notification action URL validator**

Recreate `validate_notification_action_url(text)` by preserving every route from `202607190002` and adding:

```sql
or p_url = '/payroll/settings/premium-rules'
or starts_with(p_url, '/payroll/settings/premium-rules/')
or starts_with(p_url, '/payroll/settings/premium-rules?')
or p_url = '/payroll/settings/attendance-deduction-rules'
or starts_with(p_url, '/payroll/settings/attendance-deduction-rules?')
or p_url = '/payroll/approvals/premium-rules'
or starts_with(p_url, '/payroll/approvals/premium-rules?')
```

Premium approval notifications link to `/payroll/approvals/premium-rules`. Stale calculation notifications link to the period workspace. Payloads contain IDs, scope, status, and exception counts only.

- [ ] **Step 7: Run focused tests and commit**

```bash
npm test -- \
  src/features/payroll/premiums/migration.test.ts \
  src/features/payroll/premiums/security.test.ts \
  src/features/payroll/calculation/migration.test.ts \
  src/features/payroll/calculation/security.test.ts
```

Expected: PASS.

```bash
git add supabase/migrations/202607190003_payroll_premium_rules.sql \
  src/features/payroll/premiums/migration.test.ts \
  src/features/payroll/premiums/security.test.ts \
  src/features/payroll/calculation/migration.test.ts \
  src/features/payroll/calculation/security.test.ts
git commit -m "feat: gate payroll readiness on premiums"
```

---

### Task 8: Add TypeScript models, normalization, validation, labels, and safe errors

**Files:**
- Modify: `src/features/payroll/constants.ts`
- Modify: `src/features/payroll/types.ts`
- Modify: `src/features/payroll/normalize.ts`
- Modify: `src/features/payroll/validation.ts`
- Modify: `src/features/payroll/presentation.ts`
- Modify: `src/features/payroll/errors.ts`
- Create: `src/features/payroll/premiums/model.test.ts`
- Modify: `src/features/payroll/calculation/model.test.ts`
- Modify: `src/features/payroll/validation.test.ts`
- Modify: `src/features/payroll/presentation.test.ts`

**Interfaces:**
- Consumes: SQL JSON payload contracts.
- Produces: safe typed models used by queries, actions, and UI.

- [ ] **Step 1: Write failing model tests**

Create `model.test.ts` with representative rule, preset, attendance rule, day resolution, and premium line payloads. Assert:

```ts
assert.equal(rules.rules[0]?.scopeType, "payroll_group");
assert.equal(rules.rules[0]?.dayRules.length, 8);
assert.equal(rules.presets[0]?.countryCode, "PH");
assert.equal(detail.premiumLines[0]?.premiumType, "regular_overtime");
assert.equal(detail.dayTypeResolutions[0]?.combinedDayType, "regular_holiday_rest_day");
```

Add validation tests:

```ts
test("premium rule validation requires exact day coverage and legal metadata", () => {
  const result = validatePremiumRuleSetInput(validPremiumRuleRecord());
  assert.equal(result.data?.dayRules.length, 8);
  assert.equal(result.data?.sourceAgency, "DOLE/Bureau of Working Conditions");
});

test("premium rule validation rejects duplicate day types and invalid increments", () => {
  const input = validPremiumRuleRecord();
  input.day_rules = JSON.stringify([
    ...validDayRules().slice(0, 7),
    validDayRules()[0],
  ]);
  const result = validatePremiumRuleSetInput(input);
  assert.ok(result.state?.fieldErrors?.day_rules);
});

test("attendance rule validation accepts zero grace and exact-minute fallback settings", () => {
  const result = validateAttendanceDeductionRuleInput({
    scope_type: "company_default",
    late_grace_minutes: "0",
    undertime_grace_minutes: "0",
    late_rounding_mode: "exact_minutes",
    undertime_rounding_mode: "exact_minutes",
    effective_from: "2026-08-01",
    change_reason: "Initial policy",
  });
  assert.equal(result.data?.lateGraceMinutes, 0);
});
```

- [ ] **Step 2: Run focused tests**

```bash
npm test -- \
  src/features/payroll/premiums/model.test.ts \
  src/features/payroll/calculation/model.test.ts \
  src/features/payroll/validation.test.ts \
  src/features/payroll/presentation.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Add constants and types**

Add the exact contracts from the “Shared TypeScript contracts” section. Extend calculation/workspace/detail types exactly as specified.

- [ ] **Step 4: Add safe normalization**

Follow the existing `unknownRecord`, string, number, boolean, date, and array helper pattern in `normalize.ts`.

Export:

```ts
normalizePremiumRuleList(value: unknown): PremiumRuleList
normalizePremiumRuleSet(value: unknown): PremiumRuleSet | null
normalizeAttendanceDeductionRuleList(value: unknown): AttendanceDeductionRule[]
normalizePremiumApprovalQueue(value: unknown): PremiumApprovalQueue
normalizePremiumCoveragePreview(value: unknown): PremiumCoveragePreview
```

Extend calculation normalization for the new entry fields, readiness count, workspace totals, day resolutions, premium lines, and premium events. Unknown enum values must fall back safely rather than being cast blindly.

- [ ] **Step 5: Add validation**

Export:

```ts
validatePremiumRuleSetInput(input: Record<string, unknown>)
validateAttendanceDeductionRuleInput(input: Record<string, unknown>)
validatePremiumRuleCloneInput(input: Record<string, unknown>)
validatePremiumCalculationInput(input: Record<string, unknown>)
```

Validation requirements:

- UUID format for scope IDs and record IDs.
- Exactly one scope target.
- Effective date order.
- Required legal metadata.
- HTTPS source URL only.
- Exactly eight unique supported day types.
- Multipliers within the database range.
- `HH:MM` night windows.
- Exact mode requires no increment.
- Other rounding modes require integer 1–1440.
- Grace minutes are integer 0–1440.
- Change/rejection reasons are required where designed and limited to 1,000 characters.

- [ ] **Step 6: Add labels and safe error mapping**

Export label helpers:

```ts
premiumRuleScopeLabel
premiumDayTypeLabel
premiumTypeLabel
premiumTimeRoundingModeLabel
premiumStatusLabel
```

Add safe errors to `errors.ts`:

```ts
["PAYROLL_PREMIUM_SCOPE_INVALID", "Choose a valid premium-rule scope."],
["PAYROLL_PREMIUM_RULE_INVALID", "Review the premium-rule settings and try again."],
["PAYROLL_PREMIUM_RULE_NOT_FOUND", "The selected premium rule could not be found."],
["PAYROLL_PREMIUM_RULE_IMMUTABLE", "Approved premium rules cannot be edited."],
["PAYROLL_PREMIUM_RULE_STATUS_INVALID", "This premium rule cannot perform the selected action."],
["PAYROLL_PREMIUM_RULE_CONFLICT", "Another approved premium rule conflicts with this scope and date range."],
["PAYROLL_PREMIUM_RULE_REQUIRED", "Approve a company-default premium rule before calculating premiums."],
["PAYROLL_PREMIUM_ROUNDING_INVALID", "Review the premium-time rounding settings."],
["PAYROLL_ATTENDANCE_DEDUCTION_RULE_INVALID", "Review the attendance deduction settings."],
["PAYROLL_PREMIUM_CALCULATION_FAILED", "Payroll premiums could not be calculated."],
["PAYROLL_PREMIUM_IMMUTABLE", "Completed premium calculation records cannot be changed."],
```

- [ ] **Step 7: Run tests and commit**

```bash
npm test -- \
  src/features/payroll/premiums/model.test.ts \
  src/features/payroll/calculation/model.test.ts \
  src/features/payroll/validation.test.ts \
  src/features/payroll/presentation.test.ts
```

Expected: PASS.

```bash
git add src/features/payroll/constants.ts \
  src/features/payroll/types.ts \
  src/features/payroll/normalize.ts \
  src/features/payroll/validation.ts \
  src/features/payroll/presentation.ts \
  src/features/payroll/errors.ts \
  src/features/payroll/premiums/model.test.ts \
  src/features/payroll/calculation/model.test.ts \
  src/features/payroll/validation.test.ts \
  src/features/payroll/presentation.test.ts
git commit -m "feat: add premium payroll domain models"
```

---

### Task 9: Add server-only premium queries and controlled server actions

**Files:**
- Create: `src/features/payroll/premiums/queries.ts`
- Create: `src/features/payroll/premiums/queries.test.ts`
- Create: `src/app/(dashboard)/payroll/premiums/actions.ts`
- Create: `src/features/payroll/premiums/actions.test.ts`
- Modify: `src/features/payroll/calculation/queries.ts`
- Modify: `src/features/payroll/calculation/queries.test.ts`
- Modify: `src/app/(dashboard)/payroll/calculation/actions.ts`

**Interfaces:**
- Consumes: typed normalizers and database RPCs.
- Produces: server data APIs and form actions.

- [ ] **Step 1: Write failing query tests**

Create `queries.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./queries.ts", import.meta.url), "utf8");

test("premium queries are server-only and use protected RPCs", () => {
  assert.match(source, /import\s+["']server-only["']/);
  for (const rpc of [
    "list_premium_rule_sets",
    "get_premium_rule_set_detail",
    "list_attendance_deduction_rules",
    "list_premium_rule_approvals",
    "preview_premium_rule_coverage",
  ]) assert.match(source, new RegExp(`rpc\\(["']${rpc}["']`));
});

test("premium queries use the authenticated server client only", () => {
  assert.match(source, /@\/lib\/supabase\/server/);
  assert.doesNotMatch(source, /createAdminClient|service[_-]?role|SUPABASE_SERVICE_ROLE_KEY/i);
});

test("premium query errors are safe", () => {
  assert.doesNotMatch(source, /throw\s+error|error\.message/);
  assert.match(source, /Unable to load premium rules\./);
});
```

Create `actions.test.ts` to require all action names, role guards, validators, RPC calls, random request IDs, safe error mapping, and route revalidation.

- [ ] **Step 2: Run focused tests**

```bash
npm test -- \
  src/features/payroll/premiums/queries.test.ts \
  src/features/payroll/premiums/actions.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement server-only queries**

Export:

```ts
listPremiumRuleSets(): Promise<PremiumRuleList>
getPremiumRuleSetDetail(ruleSetId: string): Promise<PremiumRuleSet | null>
listAttendanceDeductionRules(): Promise<AttendanceDeductionRule[]>
listPremiumRuleApprovals(): Promise<PremiumApprovalQueue>
previewPremiumRuleCoverage(ruleSetId: string): Promise<PremiumCoveragePreview>
```

Use only `createClient` from `@/lib/supabase/server`. Normalize every result. Throw fixed safe errors.

- [ ] **Step 4: Implement premium server actions**

Create actions:

```ts
createPremiumRuleSetAction
clonePremiumRulePresetAction
clonePremiumRuleVersionAction
submitPremiumRuleSetAction
approvePremiumRuleSetAction
rejectPremiumRuleSetAction
createAttendanceDeductionRuleAction
cloneAttendanceDeductionRuleAction
submitAttendanceDeductionRuleAction
approveAttendanceDeductionRuleAction
rejectAttendanceDeductionRuleAction
calculatePayrollPremiumsAction
```

Authorization:

```text
create/clone/submit/calculate → requirePayrollAdministrator
approve/reject → requirePayrollApprover
```

Use `crypto.randomUUID()` for every request/idempotency key.

Revalidate:

```text
/payroll
/payroll/settings/premium-rules
/payroll/settings/attendance-deduction-rules
/payroll/approvals
/payroll/approvals/premium-rules
/payroll/periods
/payroll/periods/[periodId]
/payroll/periods/[periodId]/workspace
/payroll/periods/[periodId]/exceptions
/payroll/periods/[periodId]/employees/[employeeId]
/dashboard
/notifications
/
```

- [ ] **Step 5: Keep base actions focused**

Leave existing basis/exclusion/exception actions in `calculation/actions.ts`. Add only the premium-period action import or a shared refresh helper if required; do not move existing exported action names.

- [ ] **Step 6: Run tests and commit**

```bash
npm test -- \
  src/features/payroll/premiums/queries.test.ts \
  src/features/payroll/premiums/actions.test.ts \
  src/features/payroll/calculation/queries.test.ts \
  src/features/payroll/calculation/actions.test.ts
```

Expected: PASS.

```bash
git add src/features/payroll/premiums/queries.ts \
  src/features/payroll/premiums/queries.test.ts \
  'src/app/(dashboard)/payroll/premiums/actions.ts' \
  src/features/payroll/premiums/actions.test.ts \
  src/features/payroll/calculation/queries.ts \
  src/features/payroll/calculation/queries.test.ts \
  'src/app/(dashboard)/payroll/calculation/actions.ts'
git commit -m "feat: add premium payroll server APIs"
```

---

### Task 10: Build premium-rule settings, editor, detail, and approval pages

**Files:**
- Create: `src/app/(dashboard)/payroll/settings/premium-rules/page.tsx`
- Create: `src/app/(dashboard)/payroll/settings/premium-rules/new/page.tsx`
- Create: `src/app/(dashboard)/payroll/settings/premium-rules/[ruleSetId]/page.tsx`
- Create: `src/app/(dashboard)/payroll/approvals/premium-rules/page.tsx`
- Create: `src/components/payroll/premium-rule-list.tsx`
- Create: `src/components/payroll/premium-rule-form.tsx`
- Create: `src/components/payroll/premium-rule-detail.tsx`
- Create: `src/components/payroll/premium-rule-approval-list.tsx`
- Create: `src/features/payroll/premiums/settings-ui.test.ts`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: premium queries and actions.
- Produces: HR rule administration and Super Admin approvals.

- [ ] **Step 1: Write failing route/UI tests**

Create `settings-ui.test.ts` and assert:

```ts
for (const source of [listPage, newPage, detailPage, approvalsPage]) {
  assert.match(source, /requirePayrollAdministrator|requirePayrollApprover/);
}
assert.match(listPage, /listPremiumRuleSets/);
assert.match(detailPage, /getPremiumRuleSetDetail/);
assert.match(approvalsPage, /listPremiumRuleApprovals/);
assert.match(form, /Regular workday/);
assert.match(form, /Double regular holiday \+ rest day/);
assert.match(form, /Issuing agency/);
assert.match(form, /Source reference/);
assert.match(form, /Publication date/);
assert.match(form, /Source URL/);
assert.match(form, /Overtime rounding/);
assert.match(form, /Night window/);
assert.match(approvalList, /Approve/);
assert.match(approvalList, /Reject/);
assert.match(approvalList, /Coverage preview/);
```

Also assert that settings components do not render employee salaries or payroll amounts.

- [ ] **Step 2: Run the failing test**

```bash
npm test -- src/features/payroll/premiums/settings-ui.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Build the list page and component**

The server page:

```tsx
await requirePayrollAdministrator();
const rules = await listPremiumRuleSets();
```

Render filters for scope, status, effective date, and day type; show sections for active default, overrides, drafts, pending approvals, future approved, and history.

Actions available by status:

```text
draft → edit/submit
pending_approval → read-only
approved → clone as new version
rejected → read-only/clone
```

Preset cards use `clonePremiumRulePresetAction` and clearly state `Reference template — requires review and approval`.

- [ ] **Step 4: Build the rule editor**

Use one controlled client form with:

- Rule identity and scope target.
- Effective dates.
- Change reason.
- Legal source.
- Eight day-type cards.
- Day multiplier.
- Overtime multiplier.
- Additional-only checkbox.
- ND percentage.
- Night start/end.
- Independent OT/ND rounding mode and increment.

Serialize matrix rows into a hidden `day_rules` JSON field before submission. The server validator remains authoritative.

- [ ] **Step 5: Build detail and coverage preview**

The detail page shows:

- Immutable status/version metadata.
- Scope.
- Effective dates.
- Legal source.
- Rule matrix.
- Current-versus-proposed comparison when superseding.
- Coverage counts and conflicts.
- Submit/approve/reject/clone actions based on role/status.

- [ ] **Step 6: Build the approval inbox**

Require `requirePayrollApprover()`. Show premium rules and attendance rules in separate sections. Rejection requires a reason. Never display payroll amounts.

- [ ] **Step 7: Add responsive styles**

Add focused classes for:

```text
premium-rule-grid
premium-rule-card
premium-rule-matrix
premium-rule-day-card
premium-rule-source
premium-rule-comparison
premium-approval-grid
premium-coverage-summary
```

Desktop uses a matrix/table and side-by-side comparison. At the existing mobile breakpoint, render one day-type card per row and full-width approval controls.

- [ ] **Step 8: Run UI tests and commit**

```bash
npm test -- src/features/payroll/premiums/settings-ui.test.ts
```

Expected: PASS.

```bash
git add 'src/app/(dashboard)/payroll/settings/premium-rules' \
  'src/app/(dashboard)/payroll/approvals/premium-rules' \
  src/components/payroll/premium-rule-list.tsx \
  src/components/payroll/premium-rule-form.tsx \
  src/components/payroll/premium-rule-detail.tsx \
  src/components/payroll/premium-rule-approval-list.tsx \
  src/features/payroll/premiums/settings-ui.test.ts \
  src/app/globals.css
git commit -m "feat: add premium rule administration"
```

---

### Task 11: Build attendance deduction-rule administration

**Files:**
- Create: `src/app/(dashboard)/payroll/settings/attendance-deduction-rules/page.tsx`
- Create: `src/components/payroll/attendance-deduction-rule-list.tsx`
- Modify: `src/features/payroll/premiums/settings-ui.test.ts`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: attendance-rule queries/actions.
- Produces: effective-dated late/undertime policy administration.

- [ ] **Step 1: Extend the failing UI test**

Require:

```ts
assert.match(attendancePage, /requirePayrollAdministrator/);
assert.match(attendancePage, /listAttendanceDeductionRules/);
assert.match(attendanceList, /Late grace/);
assert.match(attendanceList, /Undertime grace/);
assert.match(attendanceList, /Deduct only minutes beyond the grace period/);
assert.match(attendanceList, /Raw late time/);
assert.match(attendanceList, /Deductible time/);
```

- [ ] **Step 2: Run the focused test**

```bash
npm test -- src/features/payroll/premiums/settings-ui.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Build the page and component**

Support:

- Company default and four group scopes.
- Separate late and undertime grace.
- Separate rounding modes and increments.
- Effective dates.
- Change reason.
- Draft/submission/approval/rejection history.
- Clone approved rule as a new draft.
- Preview example.

Example calculator is presentation-only:

```ts
const raw = 14;
const grace = 10;
const deductible = Math.max(raw - grace, 0);
```

It must not calculate payroll money.

- [ ] **Step 4: Run tests and commit**

```bash
npm test -- src/features/payroll/premiums/settings-ui.test.ts
```

Expected: PASS.

```bash
git add 'src/app/(dashboard)/payroll/settings/attendance-deduction-rules/page.tsx' \
  src/components/payroll/attendance-deduction-rule-list.tsx \
  src/features/payroll/premiums/settings-ui.test.ts \
  src/app/globals.css
git commit -m "feat: add attendance deduction rules"
```

---

### Task 12: Integrate premium totals, detail, exceptions, navigation, and responsive workspace behavior

**Files:**
- Modify: `src/components/payroll/payroll-calculation-workspace.tsx`
- Modify: `src/components/payroll/payroll-employee-calculation-detail.tsx`
- Modify: `src/components/payroll/payroll-exception-queue.tsx`
- Modify: `src/app/(dashboard)/payroll/periods/[periodId]/workspace/page.tsx`
- Modify: `src/app/(dashboard)/payroll/periods/[periodId]/employees/[employeeId]/page.tsx`
- Modify: `src/app/(dashboard)/payroll/periods/[periodId]/exceptions/page.tsx`
- Modify: `src/app/(dashboard)/payroll/page.tsx`
- Modify: `src/components/sidebar.tsx`
- Modify: `src/app/globals.css`
- Create: `src/features/payroll/premiums/workspace-ui.test.ts`
- Modify: `src/features/payroll/calculation/workspace-ui.test.ts`
- Modify: `src/features/payroll/calculation/settings-ui.test.ts`
- Modify: `src/features/payroll/routing.test.ts`

**Interfaces:**
- Consumes: extended calculation workspace/detail/exception payloads.
- Produces: complete Phase 10B.2A user workflow.

- [ ] **Step 1: Write failing workspace integration tests**

Create `workspace-ui.test.ts` and assert:

```ts
for (const text of [
  "Calculate premiums",
  "Premium earnings",
  "Night differential",
  "Revised gross pay",
  "Premium status",
  "Review premium exceptions",
]) assert.match(workspace, new RegExp(text));

assert.match(workspace, /calculatePayrollPremiumsAction/);
assert.match(detail, /Premium summary/);
assert.match(detail, /Day-type resolution/);
assert.match(detail, /Premium calculation history/);
assert.match(detail, /Raw minutes/);
assert.match(detail, /Rounded minutes/);
assert.match(exceptions, /Premium rule/);
assert.match(exceptions, /Holiday configuration/);
assert.match(sidebar, /Premium Rules/);
assert.match(sidebar, /Attendance Deductions/);
```

- [ ] **Step 2: Run focused UI tests**

```bash
npm test -- \
  src/features/payroll/premiums/workspace-ui.test.ts \
  src/features/payroll/calculation/workspace-ui.test.ts \
  src/features/payroll/calculation/settings-ui.test.ts \
  src/features/payroll/routing.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Extend the payroll workspace**

Add summary cards:

```text
Premium earnings
Night differential
Revised gross pay
Premium exceptions
Awaiting premium calculation
```

Add controlled action:

```tsx
<form action={calculatePayrollPremiumsAction}>
  <input type="hidden" name="payroll_period_id" value={workspace.period.id} />
  <input type="hidden" name="mode" value="uncalculated" />
  <button className="btn primary" type="submit">Calculate premiums</button>
</form>
```

Disable calculation when period is approved/locked or a calculation run is active.

Add employee columns:

```text
Day-type premiums
Overtime premium
Night differential
Revised gross pay
Premium status
```

Premium status is derived:

```text
isStale → Needs recalculation
blocking premium exception → Blocked
premiumCalculatedAt is null → Pending
otherwise → Calculated
```

- [ ] **Step 4: Extend employee detail**

Add:

1. Premium summary.
2. Premium-line table/cards.
3. Day-type resolution section.
4. Rule scope/version.
5. Source IDs shown only as safe links or shortened identifiers.
6. Calculation history.

Columns:

```text
Date
Premium type
Resolved day type
Raw minutes
Rounded minutes
Base hourly rate
Multiplier
Premium amount
Rule version
```

Use existing `formatPayrollMoney` and `formatPayrollMinutes`.

- [ ] **Step 5: Extend exceptions**

Add a category filter:

```text
all
premium_rule
holiday_configuration
night_window
premium_input_changed
```

Map codes to categories without hiding their exact code. Link to:

- Premium rule settings.
- Holiday settings.
- Attendance or overtime source.
- Employee payroll detail.
- Period workspace.

Do not add a manual premium-amount override.

- [ ] **Step 6: Add navigation**

In `Sidebar`, add HR items:

```tsx
["/payroll/settings/premium-rules", "Premium Rules", Settings],
["/payroll/settings/attendance-deduction-rules", "Attendance Deductions", Settings],
```

Add Super Admin item:

```tsx
["/payroll/approvals/premium-rules", "Premium Approvals", ShieldCheck],
```

In `/payroll`, add header links for premium rules and premium approvals.

- [ ] **Step 7: Update responsive CSS**

Preserve existing payroll breakpoints. Premium tables become scrollable on narrow screens; employee premium lines become stacked cards; action buttons become full-width; no value is hidden solely because of viewport size.

- [ ] **Step 8: Run tests and commit**

```bash
npm test -- \
  src/features/payroll/premiums/workspace-ui.test.ts \
  src/features/payroll/calculation/workspace-ui.test.ts \
  src/features/payroll/calculation/settings-ui.test.ts \
  src/features/payroll/routing.test.ts
```

Expected: PASS.

```bash
git add src/components/payroll/payroll-calculation-workspace.tsx \
  src/components/payroll/payroll-employee-calculation-detail.tsx \
  src/components/payroll/payroll-exception-queue.tsx \
  'src/app/(dashboard)/payroll/periods/[periodId]' \
  'src/app/(dashboard)/payroll/page.tsx' \
  src/components/sidebar.tsx \
  src/app/globals.css \
  src/features/payroll/premiums/workspace-ui.test.ts \
  src/features/payroll/calculation/workspace-ui.test.ts \
  src/features/payroll/calculation/settings-ui.test.ts \
  src/features/payroll/routing.test.ts
git commit -m "feat: integrate premiums into payroll workspace"
```

---

### Task 13: Add post-migration verification, documentation, and full regression evidence

**Files:**
- Create: `phase10b2a_post_migration_verification.sql`
- Modify: `README.md`
- Modify: `src/features/payroll/premiums/migration.test.ts`
- Modify: `src/features/payroll/premiums/security.test.ts`
- Modify: `docs/superpowers/specs/2026-07-19-phase-10b2a-premium-rules-design.md`

**Interfaces:**
- Consumes: completed implementation.
- Produces: deployment checklist and release evidence.

- [ ] **Step 1: Create read-only post-migration verification SQL**

The verification query must report PASS/FAIL for:

```text
8 premium tables exist with RLS
4 premium enum types exist
all protected public RPCs exist
public RPCs use SECURITY DEFINER and restricted search_path
authenticated can execute public RPCs
anon cannot execute public RPCs
internal helpers are not browser executable
immutable triggers exist
approved-range exclusion constraints exist
holiday_count exists and is constrained
payroll entry premium columns exist
daily grace columns exist
inactive statutory preset exists
stale triggers exist
readiness includes missing premium entries
notification URL validator includes all new routes
no approved premium rule was seeded
```

Use `to_regprocedure`, `pg_proc.prosecdef`, `pg_proc.proconfig`, `has_function_privilege`, `pg_trigger`, `pg_constraint`, `information_schema.columns`, and direct preset/rule counts. End with one ordered result set:

```text
check_name | passed | details
```

The script must perform no inserts, updates, deletes, or DDL.

- [ ] **Step 2: Add a verification static test**

Add:

```ts
const verification = await readFile(
  new URL("../../../../phase10b2a_post_migration_verification.sql", import.meta.url),
  "utf8",
).catch(() => "");

test("post-migration verification is read-only and covers premium controls", () => {
  assert.match(verification, /premium_rule_sets/);
  assert.match(verification, /payroll_premium_lines/);
  assert.match(verification, /security_definer/i);
  assert.match(verification, /missing premium/i);
  assert.doesNotMatch(verification, /\b(insert|update|delete|alter|drop|create)\b/i);
});
```

- [ ] **Step 3: Document deployment and first-use procedure**

Add to `README.md`:

```text
Phase 10B.2A migration:
supabase/migrations/202607190003_payroll_premium_rules.sql

Verification:
phase10b2a_post_migration_verification.sql

First use:
1. Apply migration 202607190003.
2. Run verification and require every check to pass.
3. Review the inactive Philippine reference preset.
4. Clone it into a company-default draft.
5. Confirm legal-source metadata and effective date.
6. Submit as HR Admin.
7. Approve as Super Admin.
8. Configure optional attendance grace rules.
9. Open a non-production payroll period.
10. Run base payroll calculation.
11. Run Calculate premiums.
12. Review premium lines, day types, exceptions, and revised gross totals.
13. Do not approve or lock until readiness is true.
```

Document that statutory presets are reference templates requiring legal and company-policy review.

- [ ] **Step 4: Run the complete automated suite**

```bash
npm test
npx tsc --noEmit
npm run build
```

Expected:

```text
all tests pass
TypeScript exits 0
Next.js production build exits 0
```

- [ ] **Step 5: Apply the migration in a preview Supabase project**

Apply only:

```text
supabase/migrations/202607190003_payroll_premium_rules.sql
```

Then run:

```text
phase10b2a_post_migration_verification.sql
```

Expected: every row has `passed = true`.

- [ ] **Step 6: Perform manual acceptance checks**

Verify:

1. Employee cannot open premium settings or payroll premium detail.
2. Manager cannot open premium settings or payroll premium detail.
3. HR can create and submit a premium draft.
4. HR cannot approve it.
5. Super Admin can approve it.
6. Approved rules are read-only.
7. Same-scope overlap is rejected.
8. Preset cloning creates a draft and does not activate a rule.
9. Double regular holiday can be configured only on a regular holiday.
10. Rest-day work up to a standard day uses the ordinary rest-day multiplier.
11. Rest-day work beyond a standard day splits the excess into overtime.
12. Regular pre/post shift work is overtime from the first approved minute.
13. Night overlap across midnight is correct.
14. Raw and rounded minutes are both visible.
15. Late/undertime grace deducts only excess minutes.
16. A changed approved rule marks only affected open entries stale.
17. Recalculation creates a new employee-entry version.
18. Previous premium lines remain available.
19. One employee exception does not undo successful calculations for others.
20. Missing premium calculation blocks review.
21. Approved and locked periods reject recalculation.
22. Notifications contain no payroll amounts.
23. Mobile pages remain usable without hidden data.

- [ ] **Step 7: Commit release evidence**

```bash
git add phase10b2a_post_migration_verification.sql \
  README.md \
  src/features/payroll/premiums/migration.test.ts \
  src/features/payroll/premiums/security.test.ts \
  docs/superpowers/specs/2026-07-19-phase-10b2a-premium-rules-design.md
git commit -m "docs: add phase 10b2a verification"
```

- [ ] **Step 8: Verify the final branch**

```bash
git status --short
git log --oneline --decorate -15
git diff --check main...HEAD
npm test
npx tsc --noEmit
npm run build
```

Expected:

```text
git status --short prints nothing
git diff --check prints nothing
all tests pass
TypeScript exits 0
Next.js production build exits 0
```

## Implementation notes that must not be changed silently

### Premium formula semantics

For a payable ordinary segment:

```text
included base multiplier =
  1 when Phase 10B.1 regular earnings already cover the segment
  0 otherwise

ordinary incremental premium =
  hourly rate
  × rounded ordinary minutes / 60
  × max(day multiplier − included base multiplier, 0)
```

For an overtime segment:

```text
full overtime amount =
  hourly rate
  × rounded overtime minutes / 60
  × day multiplier
  × overtime multiplier
```

For night differential:

```text
night differential =
  applicable ordinary-or-overtime base amount
  × night differential percentage
```

Night differential is not included in the ordinary or overtime premium line.

### Segment source rules

```text
regular scheduled time → finalized attendance interval
pre-shift/post-shift → active approved overtime segment
rest-day/holiday work → active approved overtime segment
pending/rejected/superseded overtime → zero payable minutes
```

### Locked-period correction boundary

Phase 10B.2A does not reopen or rewrite approved/locked calculations. Corrections for locked periods remain deferred to Phase 10B.2C linked adjustments.

## Self-review result

- Spec coverage: all approved architecture, data, workflow, UI, security, calculation, stale, readiness, testing, and rollout sections map to Tasks 2–13.
- Baseline compatibility: the plan uses existing payroll schedules as payroll groups, job titles as positions, and the current holiday/overtime/attendance model.
- Ambiguity resolution: no attendance rule preserves Phase 10B.1 zero-grace behavior; double special holidays block rather than receiving an invented multiplier; double regular holidays use one active holiday record with `holiday_count = 2`.
- Immutable calculation behavior: premium calculation creates a new complete employee-entry version rather than mutating a completed version.
- Placeholder scan: no deferred implementation placeholders remain.
- Type consistency: SQL payload names map to the shared TypeScript contracts and the specified normalizers.
