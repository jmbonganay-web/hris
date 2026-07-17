# Phase 8 Dashboard Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mixed mock/live dashboard with secure, live, role-specific operational analytics for HR/Super Admins, managers, and employees.

**Architecture:** A forward-only PostgreSQL migration exposes three role-scoped JSON analytics RPCs. A server-only dashboard feature module resolves the selected Manila date range, invokes the correct RPC, normalizes safe payloads, and renders reusable KPI/list/SVG/CSS chart components on the existing `/dashboard` route.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase PostgreSQL/Auth/RLS, Node test runner, Lucide React, existing Balanced spacing CSS.

## Global Constraints

- Replace `/dashboard`; do not add a separate analytics route.
- Default to the current calendar month in `Asia/Manila`.
- Support current month, last 7 days, last 30 days, current quarter, and custom date ranges.
- Custom ranges are inclusive, valid ISO dates, and at most 366 days.
- Use SVG/CSS charts only; add no chart dependency.
- HR/Super Admin sees organization-wide safe analytics.
- Managers see direct-report aggregates and safe labels only.
- Employees see only their own analytics.
- Preserve the personal attendance clock card for non-HR users.
- Never expose private notes, review reasons, storage paths, signed URLs, payroll data, government identifiers, bank data, or unrestricted custom metadata.
- All privileged SQL functions use `SECURITY DEFINER`, `set search_path = pg_catalog, public`, explicit authorization, revoked default privileges, and authenticated-only execution.
- Preserve Phase 1–7 behavior and the Balanced spacing system.
- Use forward-only migrations; do not rewrite applied migrations.

---

## Task 1: Dashboard contracts, date ranges, normalization, and chart geometry

**Files:**
- Create: `src/features/dashboard/types.ts`
- Create: `src/features/dashboard/range.ts`
- Create: `src/features/dashboard/range.test.ts`
- Create: `src/features/dashboard/normalize.ts`
- Create: `src/features/dashboard/normalize.test.ts`
- Create: `src/features/dashboard/chart.ts`
- Create: `src/features/dashboard/chart.test.ts`

**Interfaces:**
- Produces `DashboardPreset`, `DashboardRange`, `resolveDashboardRange`, `dashboardRangeQuery`, role payload types, `normalizeDashboardPayload`, and `buildTrendPolyline`.

- [ ] Write failing tests proving current-month Manila defaults, preset calculations, invalid custom fallback, 366-day maximum, safe numeric normalization, and deterministic SVG points.
- [ ] Run `node --no-warnings --test --experimental-strip-types src/features/dashboard/range.test.ts src/features/dashboard/normalize.test.ts src/features/dashboard/chart.test.ts` and confirm module-not-found failures.
- [ ] Implement the minimal contracts and pure functions.
- [ ] Re-run the focused tests and confirm all pass.
- [ ] Commit with `feat: add dashboard analytics contracts`.

## Task 2: Role-scoped dashboard analytics migration

**Files:**
- Create: `supabase/migrations/202607170004_dashboard_analytics.sql`
- Create: `src/features/dashboard/migration.test.ts`
- Create: `src/features/dashboard/security.test.ts`

**Interfaces:**
- Produces `get_hr_dashboard_analytics(date,date)`, `get_manager_dashboard_analytics(date,date)`, and `get_employee_dashboard_analytics(date,date)`, each returning safe `jsonb`.

- [ ] Write failing migration tests for the three functions, date validation, HR authorization, `manager_id = current_employee_id()` scoping, employee ownership, fixed search paths, definer privileges, revokes/grants, and forbidden sensitive tokens in returned JSON builders.
- [ ] Run the focused tests and confirm the migration is missing.
- [ ] Implement one transactional forward-only migration with safe aggregates, daily attendance trends, leave/overtime/document counts, recent hires or personal balances, and action-link counts.
- [ ] Ensure manager payloads contain no document IDs/files or sensitive metadata and employee payloads use only `current_employee_id()`.
- [ ] Run migration/security tests and commit with `feat: add role-scoped dashboard analytics`.

## Task 3: Server dashboard query dispatcher

**Files:**
- Create: `src/features/dashboard/queries.ts`
- Create: `src/features/dashboard/queries.test.ts`

**Interfaces:**
- Consumes the three analytics RPCs and `getCurrentRole()`/employee profile context.
- Produces `getDashboardAnalytics(range)` returning a normalized discriminated union with `kind: "hr" | "manager" | "employee"`.

- [ ] Write failing source and normalization tests proving server-only usage, role routing, manager fallback to employee when no direct reports exist, and generic error mapping.
- [ ] Implement the dispatcher using the authenticated Supabase server client.
- [ ] Run focused tests and TypeScript validation.
- [ ] Commit with `feat: add dashboard analytics queries`.

## Task 4: Dashboard components and route replacement

**Files:**
- Create: `src/components/dashboard/dashboard-period-filter.tsx`
- Create: `src/components/dashboard/dashboard-metric-grid.tsx`
- Create: `src/components/dashboard/dashboard-trend-chart.tsx`
- Create: `src/components/dashboard/dashboard-breakdown-chart.tsx`
- Create: `src/components/dashboard/dashboard-action-list.tsx`
- Create: `src/components/dashboard/dashboard-recent-people.tsx`
- Create: `src/components/dashboard/dashboard-upcoming-leave.tsx`
- Create: `src/components/dashboard/employee-dashboard-details.tsx`
- Modify: `src/app/(dashboard)/dashboard/page.tsx`
- Create: `src/app/(dashboard)/dashboard/loading.tsx`
- Create: `src/app/(dashboard)/dashboard/error.tsx`
- Create: `src/features/dashboard/ui.test.ts`

**Interfaces:**
- Consumes `getDashboardAnalytics`, `resolveDashboardRange`, existing attendance clock context, schedule projection, document compliance/notifications, and the shared dashboard types.

- [ ] Write failing UI source tests proving mock imports are removed, the period filter and role branches exist, lightweight chart components render accessible SVG/CSS output, personal clock remains, and loading/error routes exist.
- [ ] Build reusable components with explicit empty states and drill-down links to existing modules.
- [ ] Replace `/dashboard` with current-month role-specific analytics and GET-based date filters.
- [ ] Add safe loading and error boundaries.
- [ ] Run focused UI tests and TypeScript validation.
- [ ] Commit with `feat: build role-specific analytics dashboard`.

## Task 5: Balanced spacing, regression coverage, verification, and packaging

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/features/layout/balanced-spacing.test.ts`
- Create: `src/features/dashboard/e2e.test.ts`
- Modify: `README.md`
- Create outside repository: `/mnt/data/hris-repository-phase-8-dashboard-analytics.zip`
- Create outside repository: `/mnt/data/phase-8-dashboard-analytics-report.md`
- Create outside repository: `/mnt/data/phase-8-dashboard-analytics.sha256`

**Interfaces:**
- Produces responsive dashboard layout classes and release artifacts.

- [ ] Add failing spacing/e2e tests for dashboard grids, chart responsiveness, mock-data removal, migration ordering, environment safety, and approved route ownership.
- [ ] Add scoped Balanced spacing classes for dashboard metrics, analytics grid, charts, legends, action lists, and mobile stacking.
- [ ] Update README with Phase 8 migration/deployment and dashboard behavior.
- [ ] Run `npm test`, `npx tsc --noEmit`, and `npm run build`; record exact evidence.
- [ ] Package a clean ZIP excluding `.git`, `.next`, `node_modules`, and secret env files; verify archive integrity and SHA-256.
- [ ] Commit with `test: verify Phase 8 dashboard analytics`.

## Acceptance checklist

- [ ] HR/Super Admin dashboard contains no mock data and shows organization-wide live metrics.
- [ ] Manager dashboard is limited to current direct reports and retains personal attendance clocking.
- [ ] Employee dashboard shows only personal attendance, leave, document, notification, and schedule information.
- [ ] Current month is the default in Asia/Manila.
- [ ] Preset and custom filters work and reject ranges over 366 days.
- [ ] Charts remain understandable with text and without color.
- [ ] No sensitive fields appear in SQL JSON payloads, server props, or browser code.
- [ ] Existing Phase 1–7 tests remain green.
- [ ] Production build succeeds.
