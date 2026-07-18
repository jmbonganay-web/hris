# Phase 10B.1 Payroll Calculation Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secure, database-native payroll calculation foundation with effective-dated basis rules, controlled runs, versioned employee snapshots, exceptions, recalculation, readiness checks, and payroll workspace UI.

**Architecture:** A forward-only Supabase migration owns calculation state, decimal math, concurrency, RLS, snapshots, audit events, and protected RPCs. Next.js server-only query modules and server actions normalize RPC JSON into typed workspace, employee-detail, exception, and basis-rule screens.

**Tech Stack:** PostgreSQL/Supabase RLS and RPCs, Next.js 16 App Router, React 19 server components and server actions, TypeScript 5.9, Node test runner.

## Global Constraints

- Preserve all Phase 1–10A behavior and forward-only migration history.
- Use PostgreSQL `numeric`; never floating-point money types.
- No basis rule activates automatically.
- Only HR Admin and Super Admin access calculation data; only Super Admin approves basis rules or ignores blockers.
- Recalculation creates immutable versions; locked/approved periods reject calculation.
- Notifications and browser errors contain no payroll amounts or raw SQL details.
- Keep employee calculations independent within a controlled period run.

---

### Task 1: Migration contracts and test scaffold

**Files:**
- Create: `src/features/payroll/calculation/migration.test.ts`
- Create: `src/features/payroll/calculation/security.test.ts`
- Create: `src/features/payroll/calculation/formulas.test.ts`
- Create: `supabase/migrations/202607190001_payroll_calculation_foundation.sql`

- [ ] Write failing static tests for tables, constraints, RLS, RPC names, numeric formulas, idempotency, advisory/row locks, immutability, exception isolation, readiness integration, and safe notifications.
- [ ] Run targeted tests and confirm they fail.
- [ ] Implement the forward-only migration.
- [ ] Run targeted tests and confirm they pass.
- [ ] Commit.

### Task 2: Types, normalization, validation, and presentation

**Files:**
- Modify: `src/features/payroll/constants.ts`
- Modify: `src/features/payroll/types.ts`
- Modify: `src/features/payroll/normalize.ts`
- Modify: `src/features/payroll/validation.ts`
- Modify: `src/features/payroll/presentation.ts`
- Create: `src/features/payroll/calculation/model.test.ts`

- [ ] Write failing tests for basis input, action identity/reasons, enum values, normalizers, and display formatting.
- [ ] Implement typed calculation models and safe normalization.
- [ ] Run targeted tests.
- [ ] Commit.

### Task 3: Server-only query modules

**Files:**
- Create: `src/features/payroll/calculation/queries.ts`
- Create: `src/features/payroll/calculation/queries.test.ts`

- [ ] Write failing tests for protected RPC calls and service-role exclusion.
- [ ] Implement workspace, employee detail, exception list, basis list, and run-history queries.
- [ ] Run targeted tests.
- [ ] Commit.

### Task 4: Protected server actions

**Files:**
- Create: `src/app/(dashboard)/payroll/calculation/actions.ts`
- Create: `src/features/payroll/calculation/actions.test.ts`
- Modify: `src/features/payroll/errors.ts`

- [ ] Write failing tests for authorization, RPCs, request IDs, validation, revalidation, and redaction.
- [ ] Implement basis workflow, run, recalculation, exception, and exclusion actions.
- [ ] Run targeted tests.
- [ ] Commit.

### Task 5: Payroll workspace and employee detail

**Files:**
- Create: `src/components/payroll/payroll-calculation-workspace.tsx`
- Create: `src/components/payroll/payroll-employee-calculation-detail.tsx`
- Create: `src/app/(dashboard)/payroll/periods/[periodId]/workspace/page.tsx`
- Create: `src/app/(dashboard)/payroll/periods/[periodId]/employees/[employeeId]/page.tsx`
- Modify: `src/components/payroll/payroll-period-detail.tsx`
- Create: `src/features/payroll/calculation/workspace-ui.test.ts`

- [ ] Write failing route/UI tests.
- [ ] Implement authorized workspace, filters, progress summaries, version history, daily rows, and source snapshots.
- [ ] Run targeted tests.
- [ ] Commit.

### Task 6: Exception queue and basis settings

**Files:**
- Create: `src/components/payroll/payroll-exception-queue.tsx`
- Create: `src/components/payroll/payroll-basis-rule-list.tsx`
- Create: `src/app/(dashboard)/payroll/periods/[periodId]/exceptions/page.tsx`
- Create: `src/app/(dashboard)/payroll/settings/basis-rules/page.tsx`
- Create: `src/features/payroll/calculation/settings-ui.test.ts`

- [ ] Write failing tests for role gating, reason requirements, presets, and no amount leakage.
- [ ] Implement pages and forms.
- [ ] Run targeted tests.
- [ ] Commit.

### Task 7: Styling, navigation, and regression integration

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/components/sidebar.tsx`
- Modify: `src/features/payroll/actions.test.ts`
- Modify: `src/features/payroll/routing.test.ts`
- Modify: `src/features/payroll/ui.test.ts`

- [ ] Add responsive workspace, cards, filters, tables, timelines, and mobile layouts.
- [ ] Add payroll basis and workspace navigation where role-appropriate.
- [ ] Update regression contracts.
- [ ] Run payroll and full test suites.
- [ ] Commit.

### Task 8: Verification and packaging

**Files:**
- Create: `phase10b1_post_migration_verification.sql`
- Create: `phase-10b1-payroll-calculation-foundation-report.md`
- Modify: `README.md`

- [ ] Add post-migration checks for tables, RLS, RPC security, grants, no active basis default, idempotency, and readiness.
- [ ] Run `npm test`.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm run build`.
- [ ] Verify forbidden files are excluded.
- [ ] Create sanitized `hris-github` ZIP and SHA-256 checksum.
