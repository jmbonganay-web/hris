# Phase 3 Organization Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add production-ready department and job-title management backed by Supabase, and integrate active organization records into employee create/edit workflows while preserving historical archived assignments.

**Architecture:** Extend the existing Supabase schema with soft-archive and relationship fields, then add isolated organization feature modules for validation, queries, actions, and UI. Employee organization selection remains in the existing employee module but gains department-aware job-title filtering and server-side relationship validation.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.7, Supabase SSR/PostgreSQL/RLS, Node 22 built-in test runner, existing CSS component system.

## Global Constraints

- Preserve existing authentication and employee CRUD behavior.
- Use soft archive (`archived_at` plus `is_active = false`) rather than permanent deletion.
- Archived departments and job titles remain visible on existing employee records but cannot be newly assigned.
- Only `super_admin` and `hr_admin` can access or mutate organization settings.
- Do not expose service-role credentials or bypass Supabase RLS.
- Do not add runtime dependencies.
- Keep mobile-first responsive behavior and accessible labels, actions, and confirmation states.

---

### Task 1: Database migration and seed data

**Files:**
- Create: `supabase/migrations/202607130003_organization_management.sql`
- Modify: `supabase/seed.sql`

**Interfaces:**
- Produces: `departments.department_head_id`, `departments.archived_at`, `job_titles.department_id`, `job_titles.archived_at`, partial job-title uniqueness, supporting indexes.

- [x] **Step 1: Add the organization migration**

Create idempotent SQL that adds the new columns and foreign keys, drops global job-title uniqueness, creates a case-insensitive unique partial index per department for non-archived titles, and creates lookup indexes.

- [x] **Step 2: Update seed data**

Seed three departments and department-linked job titles with `where not exists` guards so seeding works after the unique-constraint change.

- [x] **Step 3: Verify SQL syntax structurally**

Run repository checks for unresolved conflict markers and inspect migration statements for idempotency.

### Task 2: Organization validation with tests

**Files:**
- Create: `src/features/organization/types.ts`
- Create: `src/features/organization/validation.ts`
- Create: `src/features/organization/validation.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `validateDepartment(formData)`, `validateJobTitle(formData)`, organization action-state and record types.

- [x] **Step 1: Write failing validation tests**

Test required department names/codes, uppercase code normalization, optional UUID handling, required job-title names, and invalid UUID rejection.

- [x] **Step 2: Run tests and verify RED**

Run `npm test`; expect module-not-found failures because validation is not implemented.

- [x] **Step 3: Implement minimal validators and types**

Use dependency-free TypeScript helpers that return normalized database inputs or field errors.

- [x] **Step 4: Run tests and verify GREEN**

Run `npm test`; expect all validation tests to pass.

### Task 3: Organization authorization and queries

**Files:**
- Create: `src/features/organization/auth.ts`
- Create: `src/features/organization/queries.ts`

**Interfaces:**
- Produces: `requireOrganizationAdmin()`, `getDepartments()`, `getDepartment()`, `getJobTitles()`, `getJobTitle()`, `getActiveEmployeeOptions()`, and active option queries.

- [x] **Step 1: Add role guard**

Authenticate with Supabase, load profile role, and redirect unauthorized users to `/settings?error=unauthorized`.

- [x] **Step 2: Add paginated department queries**

Support search, status filters, department-head joins, and active employee counts without fetching unnecessary employee fields.

- [x] **Step 3: Add paginated job-title queries**

Support search, department/status filters, department joins, and active employee counts.

- [x] **Step 4: Add option/detail queries**

Return active department/job-title options and active employee candidates for department heads.

### Task 4: Department management UI and actions

**Files:**
- Create: `src/app/(dashboard)/settings/departments/actions.ts`
- Create: `src/components/organization/department-form.tsx`
- Create: `src/components/organization/archive-organization-button.tsx`
- Create: `src/app/(dashboard)/settings/departments/page.tsx`
- Create: `src/app/(dashboard)/settings/departments/new/page.tsx`
- Create: `src/app/(dashboard)/settings/departments/[id]/page.tsx`
- Create: `src/app/(dashboard)/settings/departments/[id]/edit/page.tsx`
- Create: `src/app/(dashboard)/settings/departments/loading.tsx`
- Create: `src/app/(dashboard)/settings/departments/error.tsx`

**Interfaces:**
- Produces: department create/update/archive workflows and all department routes.

- [x] **Step 1: Implement server actions**

Require organization-admin role, validate input, validate department-head employee IDs, handle duplicate name/code errors, soft archive, revalidate, and redirect with status messages.

- [x] **Step 2: Implement accessible form and archive confirmation**

Use `useActionState`, field-level errors, pending states, and explicit confirmation showing assigned employee count.

- [x] **Step 3: Implement list/detail/create/edit pages**

Provide search, status filter, pagination, responsive table/card behavior, loading, empty, error, and success states.

### Task 5: Job-title management UI and actions

**Files:**
- Create: `src/app/(dashboard)/settings/job-titles/actions.ts`
- Create: `src/components/organization/job-title-form.tsx`
- Create: `src/app/(dashboard)/settings/job-titles/page.tsx`
- Create: `src/app/(dashboard)/settings/job-titles/new/page.tsx`
- Create: `src/app/(dashboard)/settings/job-titles/[id]/page.tsx`
- Create: `src/app/(dashboard)/settings/job-titles/[id]/edit/page.tsx`
- Create: `src/app/(dashboard)/settings/job-titles/loading.tsx`
- Create: `src/app/(dashboard)/settings/job-titles/error.tsx`

**Interfaces:**
- Produces: job-title create/update/archive workflows and all job-title routes.

- [x] **Step 1: Implement server actions**

Require organization-admin role, validate department references, handle per-department duplicate title errors, soft archive, revalidate employee and settings routes, and redirect with status messages.

- [x] **Step 2: Implement form and pages**

Add department selection, search, status/department filters, pagination, assigned employee count, and responsive states.

### Task 6: Employee organization integration with tests

**Files:**
- Create: `src/features/employees/organization-validation.ts`
- Create: `src/features/employees/organization-validation.test.ts`
- Modify: `src/features/employees/types.ts`
- Modify: `src/features/employees/queries.ts`
- Modify: `src/app/(dashboard)/employees/actions.ts`
- Modify: `src/components/employees/employee-form.tsx`
- Modify: `src/app/(dashboard)/employees/[id]/edit/page.tsx`

**Interfaces:**
- Produces: department-aware active option loading and `validateEmployeeOrganizationAssignment()`.

- [x] **Step 1: Write failing assignment tests**

Cover active assignments, archived selections, inactive selections, and department/job-title mismatch behavior.

- [x] **Step 2: Run tests and verify RED**

Run `npm test`; expect missing-module failures.

- [x] **Step 3: Implement pure and Supabase-backed validation**

Allow an archived/inactive current value only when editing the employee already assigned to it; reject all new archived/inactive assignments and mismatched department relationships.

- [x] **Step 4: Update queries and form behavior**

Load active options, append current archived options on edit, filter job titles by selected department in the client, and reset incompatible selections.

- [x] **Step 5: Enforce checks in create/update actions**

Return actionable validation errors before insert/update.

- [x] **Step 6: Run tests and verify GREEN**

Run `npm test`; expect all tests to pass.

### Task 7: Settings navigation, copy, and styling

**Files:**
- Modify: `src/app/(dashboard)/settings/page.tsx`
- Modify: `src/app/globals.css`
- Modify: `README.md`

**Interfaces:**
- Produces: direct Settings links, accurate backend status copy, and responsive organization module styles.

- [x] **Step 1: Replace placeholder Settings controls**

Link Departments and Job titles to their real routes and remove outdated mock-data messaging.

- [x] **Step 2: Add organization styles**

Add reusable management-list, responsive-card, detail, form, and archive-warning styles without changing unrelated visual tokens.

- [x] **Step 3: Document migration and testing**

Update README with the Phase 3 migration order, local test command, and organization acceptance checklist.

### Task 8: Verification and clean packaging

**Files:**
- Verify: all modified project files
- Create: final ZIP outside project root

**Interfaces:**
- Produces: a deployable clean project archive.

- [x] **Step 1: Search for merge markers and secrets**

Run `grep -R` excluding build/dependency directories and verify `.env.local` is excluded from the archive.

- [x] **Step 2: Run automated tests**

Run `npm test`; expect all tests to pass.

- [x] **Step 3: Run type and production verification**

Run `npx tsc --noEmit` and `npm run build`; expect successful completion.

- [x] **Step 4: Package the project**

Create a ZIP excluding `.env.local`, `.git`, `.next`, `node_modules`, macOS metadata, and TypeScript build cache.
