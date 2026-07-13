# Phase 4A Expanded Employee Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure, responsive expanded employee profiles with personal details, employment details, multiple emergency contacts, validated manager assignment, and private Supabase avatar storage.

**Architecture:** Keep directory-critical fields on `employees`; add focused personal and emergency-contact tables. Read profile sections through server-side queries, mutate them through HR-only Server Actions, and enforce employee self-view with RLS and route authorization. Store avatars in a private Supabase bucket and render them using signed URLs.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase PostgreSQL/Auth/Storage, CSS, Node test runner.

## Global Constraints

- Super Admin and HR Admin can edit Phase 4A profile data.
- Employees can view only their own expanded profile and cannot edit it.
- Avatar bucket is private; accepted types are JPEG, PNG, and WebP; maximum size is 5 MB.
- Only active, non-archived employees can be newly assigned as managers.
- Self-management and circular reporting chains are blocked.
- Multiple emergency contacts are allowed, but only one can be primary.
- No new runtime dependencies.
- `.env.local`, `.git`, `.next`, and `node_modules` must not be included in the delivery ZIP.

---

### Task 1: Database schema, RLS, storage, and migration

**Files:**
- Create: `supabase/migrations/202607130004_expanded_employee_profile.sql`
- Modify: `supabase/seed.sql`

**Interfaces:**
- Produces tables `employee_personal_details` and `employee_emergency_contacts`.
- Produces employee columns `avatar_path`, `probation_end_date`, `regularization_date`, and `work_schedule`.
- Produces private storage bucket `employee-avatars` and policies.

- [ ] Create the migration with idempotent columns, tables, indexes, the single-primary trigger, RLS policies, storage bucket, and storage object policies.
- [ ] Add representative personal details and emergency contacts to `supabase/seed.sql` using existing employee records where available.
- [ ] Scan the migration for destructive statements and verify no existing employee relationship is removed.

### Task 2: Domain types, validation, authorization, and manager-cycle tests

**Files:**
- Modify: `src/features/employees/types.ts`
- Modify: `src/features/employees/auth.ts`
- Create: `src/features/employees/profile-validation.ts`
- Create: `src/features/employees/profile-validation.test.ts`
- Create: `src/features/employees/manager-validation.ts`
- Create: `src/features/employees/manager-validation.test.ts`

**Interfaces:**
- Produces `PersonalDetailsInput`, `EmploymentDetailsInput`, `EmergencyContactInput`, `AvatarValidationResult`, and profile record types.
- Produces `requireEmployeeProfileAccess(employeeId)` and `requireEmployeeProfileManager(employeeId)`.
- Produces `wouldCreateManagerCycle(employeeId, managerId, records)` and `validateManagerAssignment(...)`.

- [ ] Write failing tests for personal form validation, emergency primary data, avatar size/type validation, self-management, direct cycles, and indirect cycles.
- [ ] Run `npm test` and confirm failures are caused by missing implementations.
- [ ] Implement the smallest validation and authorization helpers that satisfy the tests.
- [ ] Run `npm test` and confirm all tests pass.

### Task 3: Profile queries and signed-avatar URLs

**Files:**
- Modify: `src/features/employees/queries.ts`
- Create: `src/features/employees/profile-queries.ts`
- Create: `src/features/employees/profile-queries.test.ts`

**Interfaces:**
- Produces `getExpandedEmployeeProfile(id)`, `getEmployeePersonalDetails(id)`, `getEmployeeEmergencyContacts(id)`, `getManagerOptions(employeeId, currentManagerId)`, and `getEmployeeAvatarSignedUrl(path)`.

- [ ] Write a source-contract test that verifies foreign-key-qualified manager, department, and job-title relationships are used.
- [ ] Implement server queries with explicit foreign-key names and safe Supabase error logging.
- [ ] Ensure regular employees receive no data for another employee through route authorization and RLS.
- [ ] Run tests and TypeScript validation.

### Task 4: Profile Server Actions and avatar lifecycle

**Files:**
- Create: `src/app/(dashboard)/employees/[id]/profile-actions.ts`

**Interfaces:**
- Produces `updatePersonalDetails`, `updateEmploymentDetails`, `updateManager`, `createEmergencyContact`, `updateEmergencyContact`, `deleteEmergencyContact`, `uploadEmployeeAvatar`, and `removeEmployeeAvatar`.

- [ ] Implement HR-only actions with field validation and friendly errors.
- [ ] Validate organization assignments through the Phase 3 helper before employment updates.
- [ ] Validate manager availability and cycle safety before manager updates.
- [ ] Enforce primary emergency-contact rules and block deletion of the sole primary when other contacts remain.
- [ ] Upload avatars to `{employeeId}/{uuid}.{extension}`, update the database, then remove the old object; clean up the new object on database failure.
- [ ] Revalidate all affected employee routes after successful mutations.

### Task 5: Responsive profile header, tabs, and overview

**Files:**
- Replace: `src/app/(dashboard)/employees/[id]/page.tsx`
- Create: `src/components/employees/profile/avatar-panel.tsx`
- Create: `src/components/employees/profile/profile-tabs.tsx`
- Create: `src/components/employees/profile/profile-overview.tsx`
- Create: `src/components/employees/profile/profile-section.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Uses query parameter `tab=overview|personal|employment|emergency`.
- Shows edit actions only when `canManage` is true.

- [ ] Build the profile header with signed avatar or initials fallback.
- [ ] Add keyboard-accessible responsive tabs and preserve success/error query parameters.
- [ ] Add overview cards for contact, employment, manager, primary emergency contact, important dates, and profile completeness.
- [ ] Add dedicated read-only Personal, Employment, and Emergency Contacts tab content.
- [ ] Add mobile layouts without horizontal table overflow.

### Task 6: Personal, employment, manager, and avatar forms

**Files:**
- Create: `src/app/(dashboard)/employees/[id]/personal/edit/page.tsx`
- Create: `src/app/(dashboard)/employees/[id]/employment/edit/page.tsx`
- Create: `src/app/(dashboard)/employees/[id]/manager/edit/page.tsx`
- Replace: `src/app/(dashboard)/employees/[id]/edit/page.tsx`
- Create: `src/components/employees/profile/personal-details-form.tsx`
- Create: `src/components/employees/profile/employment-details-form.tsx`
- Create: `src/components/employees/profile/manager-form.tsx`
- Create: `src/components/employees/profile/avatar-upload-form.tsx`

**Interfaces:**
- Existing `/employees/[id]/edit` redirects to `/employees/[id]/employment/edit`.
- Forms use `useActionState` with `EmployeeActionState`-compatible states.

- [ ] Create focused personal and employment edit forms with field-level errors.
- [ ] Reuse active departments and department-filtered job titles from Phase 3.
- [ ] Add manager selector with current historical manager visibility and valid active options.
- [ ] Add image preview, type/size client checks, pending upload feedback, replace, and remove controls.
- [ ] Verify employees cannot open edit routes.

### Task 7: Emergency-contact management routes and forms

**Files:**
- Create: `src/app/(dashboard)/employees/[id]/emergency-contacts/new/page.tsx`
- Create: `src/app/(dashboard)/employees/[id]/emergency-contacts/[contactId]/edit/page.tsx`
- Create: `src/components/employees/profile/emergency-contact-form.tsx`
- Create: `src/components/employees/profile/delete-emergency-contact-button.tsx`

**Interfaces:**
- Uses dedicated create, edit, and delete actions from `profile-actions.ts`.

- [ ] Build add and edit forms with primary-contact control.
- [ ] Add delete confirmation and explain the primary-contact restriction.
- [ ] Return to the Emergency Contacts tab with success messages.
- [ ] Add not-found behavior for invalid employee or contact IDs.

### Task 8: Documentation and verification

**Files:**
- Modify: `README.md`
- Modify: `.env.example` only if a new variable is required.

**Interfaces:**
- Documents migration `202607130004_expanded_employee_profile.sql` and bucket setup.

- [ ] Document migration, Supabase storage behavior, local testing, and Phase 4A routes.
- [ ] Run `npm test` and require zero failures.
- [ ] Run `npx tsc --noEmit` and require exit code 0.
- [ ] Run `npm run build` and require exit code 0.
- [ ] Scan for merge markers and hardcoded secrets.
- [ ] Remove `.env.local`, `.next`, `node_modules`, `.git`, and build metadata from the delivery copy.
- [ ] Create `hris-frontend-phase4a-expanded-profile.zip` and list its top-level contents.
