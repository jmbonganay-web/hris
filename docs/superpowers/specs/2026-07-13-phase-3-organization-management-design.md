# Phase 3 Organization Management Design

**Project:** HRIS MVP  
**Date:** 2026-07-13  
**Status:** Approved design, pending implementation-plan approval

## 1. Goal

Add production-ready organization management for departments and job titles on top of the existing Supabase-connected employee module. HR administrators must be able to create, view, edit, search, filter, paginate, and soft-archive organization records without breaking historical employee relationships.

## 2. Scope

### Included

- Department management
- Job-title management
- Department-head assignment from active employees
- Employee counts for departments and job titles
- Soft archive for departments and job titles
- Search, status filters, department filters, and server-side pagination
- Active-only selectors for new employee assignments
- Preservation of archived values on existing employee records
- Department-aware job-title options in employee forms
- Server-side validation of department/job-title compatibility
- HR Admin and Super Admin authorization
- Loading, empty, error, success, and confirmation states
- Database migration, seed updates, README updates, and production-build verification

### Excluded

- Salary grades
- Compensation ranges
- Leave-allocation defaults
- Multi-level organization charts
- Permanent deletion
- Bulk imports
- Advanced reporting

## 3. Architecture

Phase 3 will follow the existing feature-based pattern used by Employee Management.

```text
src/
├── app/(dashboard)/settings/
│   ├── page.tsx
│   ├── departments/
│   │   ├── page.tsx
│   │   ├── loading.tsx
│   │   ├── error.tsx
│   │   ├── actions.ts
│   │   ├── new/page.tsx
│   │   └── [id]/
│   │       ├── page.tsx
│   │       ├── not-found.tsx
│   │       └── edit/page.tsx
│   └── job-titles/
│       ├── page.tsx
│       ├── loading.tsx
│       ├── error.tsx
│       ├── actions.ts
│       ├── new/page.tsx
│       └── [id]/
│           ├── page.tsx
│           ├── not-found.tsx
│           └── edit/page.tsx
├── components/organization/
│   ├── department-form.tsx
│   ├── job-title-form.tsx
│   ├── archive-department-button.tsx
│   └── archive-job-title-button.tsx
└── features/organization/
    ├── auth.ts
    ├── departments/
    │   ├── queries.ts
    │   ├── types.ts
    │   └── validation.ts
    └── job-titles/
        ├── queries.ts
        ├── types.ts
        └── validation.ts
```

The existing employee authorization helper may be reused or moved into a shared authorization module if doing so is necessary for both modules. No unrelated refactoring will be performed.

## 4. Database Design

A new migration will add:

```text
departments.department_head_id uuid nullable
departments.archived_at timestamptz nullable
job_titles.department_id uuid nullable
job_titles.archived_at timestamptz nullable
```

Relationships:

- `departments.department_head_id → employees.id` with `ON DELETE SET NULL`
- `job_titles.department_id → departments.id` with `ON DELETE SET NULL`

Indexes will cover:

- department head
- department archive state
- job-title department
- job-title archive state

The existing RLS policies already allow authenticated reads and HR-admin management. The migration will preserve those policies and will not introduce hard-delete UI actions.

### Uniqueness

- Department names remain globally unique.
- Department codes remain globally unique when present.
- Job-title uniqueness will be changed from global title uniqueness to title-per-department uniqueness where feasible. A title with no department is treated as belonging to the unassigned scope.

## 5. Archive Behavior

Archiving sets:

```text
archived_at = current timestamp
is_active = false
```

Archived records:

- remain linked to existing employees
- remain visible on employee detail and edit screens when already assigned
- are excluded from new assignments
- are excluded from default active lists
- can be viewed through an archived-status filter

Archiving a record with assigned active employees is allowed after a clear confirmation warning that includes the assignment count. Employees are not automatically reassigned.

## 6. Department Module

### List page

Columns:

- Department
- Code
- Department Head
- Employees
- Status
- Actions

Controls:

- Search by name or code
- Status filter: active, inactive, archived, all
- Pagination
- Add Department button for HR roles

### Create and edit

Fields:

- Name, required
- Code, optional but unique
- Description, optional
- Department Head, optional active employee
- Active status

Validation:

- normalized trimmed values
- uppercase code
- duplicate name/code handling
- valid, non-archived department-head employee

### Detail page

Shows department metadata, head, assignment count, creation/update dates, and actions.

## 7. Job-Title Module

### List page

Columns:

- Job Title
- Department
- Employees
- Status
- Actions

Controls:

- Search by title
- Department filter
- Status filter
- Pagination
- Add Job Title button for HR roles

### Create and edit

Fields:

- Title, required
- Department, optional
- Description, optional
- Active status

Validation:

- normalized trimmed title
- valid active department for new assignments
- duplicate title within the same department

### Detail page

Shows title metadata, department, assignment count, creation/update dates, and actions.

## 8. Employee Integration

Employee option queries will change to return:

```text
Department: id, name, archived_at
Job title: id, title, department_id, archived_at
```

Rules:

- New employee forms show only active, non-archived departments and job titles.
- Editing an employee keeps the currently assigned archived department or job title visible as a disabled or clearly labeled current value.
- Selecting a department filters job-title options in the client UI.
- Server Actions independently verify that a selected job title belongs to the selected department when the job title has a department.
- Archived records cannot be newly assigned.

## 9. Authorization

Read access follows existing RLS behavior. Management routes and mutations require:

```text
super_admin OR hr_admin
```

Authorization is enforced in:

- server-rendered management pages
- create actions
- update actions
- archive actions

Unauthorized users are redirected to Settings or Dashboard with a user-facing error state. Hidden buttons alone are never treated as authorization.

## 10. Error and State Handling

Each module includes:

- route-level loading UI
- route-level error UI with retry
- empty-state guidance
- field-level validation errors
- duplicate-record messages
- archive confirmation dialogs
- success banners through query parameters
- safe fallback messages for unexpected Supabase errors

No raw database error text is shown to users.

## 11. Responsive UX

- Desktop uses structured tables.
- Mobile uses stacked cards or scroll-safe tables depending on the existing CSS pattern.
- Important actions maintain touch-friendly dimensions.
- Forms use semantic labels and accessible error messaging.
- Archive controls use explicit text, not ambiguous icon-only buttons.

## 12. Seed and Documentation Updates

`supabase/seed.sql` will include starter departments and department-linked job titles using idempotent inserts.

`README.md` will document:

- the new migration file
- Phase 3 routes
- local test steps
- archive behavior
- role requirements

## 13. Testing and Verification

### Functional checks

- Create, edit, view, search, filter, paginate, and archive a department.
- Create, edit, view, search, filter, paginate, and archive a job title.
- Assign a valid department head.
- Confirm assignment counts.
- Confirm archived records disappear from new employee selectors.
- Confirm existing employee records still display archived assignments.
- Confirm department selection filters job titles.
- Confirm mismatched department/job-title submissions are rejected server-side.
- Confirm Employee-role users cannot manage organization records.

### Build checks

- Search for unresolved Git conflict markers.
- Run TypeScript validation.
- Run the Next.js production build.
- Ensure `.env.local`, `.git`, `.next`, and `node_modules` are excluded from the delivery ZIP.

## 14. Acceptance Criteria

Phase 3 is complete when:

1. Department and job-title pages use live Supabase data.
2. HR roles can create, view, edit, search, filter, paginate, and archive records.
3. Employee users cannot access management actions.
4. Department heads and assignment counts work.
5. Archived values remain visible historically but cannot be newly assigned.
6. Job titles are filtered and validated by department.
7. Local type-check and production build pass.
8. The migration, seed data, README, and clean downloadable ZIP are included.
