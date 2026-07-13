# Phase 4A Expanded Employee Profile Design

**Date:** 2026-07-13  
**Status:** Approved for implementation planning  
**Product:** HRIS MVP  
**Scope:** Core employee profile expansion only

## 1. Goal

Expand the existing employee module into a structured, secure employee profile experience that supports personal information, employment information, emergency contacts, manager assignment, and private profile-photo storage.

Phase 4A must preserve the current employee directory and Phase 3 organization-management behavior while adding focused profile sections and dedicated edit flows.

## 2. Scope

### Included

- Expanded employee profile header and summary
- Responsive profile tabs
- Personal-information section and edit flow
- Employment-information section and edit flow
- Multiple emergency contacts with one primary contact
- Manager assignment with hierarchy validation
- Private Supabase Storage avatar uploads
- Signed avatar URLs
- HR-only editing
- Employee self-view access
- Loading, empty, unauthorized, missing-record, success, and error states
- Database migrations and RLS policies
- Automated tests and manual QA

### Excluded

- Government IDs
- Bank information
- HR-only notes
- Employee activity history
- Documents module
- Payroll data
- Employee self-editing
- Public employee directory

These features are deferred to Phase 4B or later phases.

## 3. Approved Product Decisions

- Use a **hybrid profile model**.
- Super Admin and HR Admin can edit Phase 4A profile data.
- Employees can view only their own expanded profile.
- Employees cannot edit profile data during Phase 4A.
- Profile photos use a private Supabase Storage bucket.
- Emergency contacts support multiple records with exactly one primary contact when contacts exist.
- Only active, non-archived employees can be newly assigned as managers.
- Self-management and circular reporting relationships are blocked.
- Each profile section uses a dedicated edit route rather than one large form or inline editing.

## 4. Architecture

### 4.1 Existing `employees` table

Keep frequently queried employment and directory fields in `public.employees`:

- `id`
- `profile_id`
- `employee_number`
- `first_name`
- `last_name`
- `work_email`
- `personal_email` if already present for compatibility
- `phone` if already present for compatibility
- `department_id`
- `job_title_id`
- `manager_id`
- `employment_type`
- `employment_status`
- `hire_date`
- `work_location`
- `archived_at`
- `created_at`
- `updated_at`

Phase 4A may add common employment fields directly to `employees` when they are needed in directory or reporting queries:

- `probation_end_date`
- `regularization_date`
- `work_schedule`
- `avatar_path`

### 4.2 New `employee_personal_details` table

Purpose: store optional personal-profile fields separately from the directory record.

Fields:

- `id uuid primary key`
- `employee_id uuid unique not null references public.employees(id) on delete cascade`
- `middle_name text`
- `preferred_name text`
- `date_of_birth date`
- `gender text`
- `civil_status text`
- `nationality text`
- `personal_email text`
- `phone text`
- `address_line_1 text`
- `address_line_2 text`
- `city text`
- `state_province text`
- `postal_code text`
- `country text`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `created_by uuid references auth.users(id)`
- `updated_by uuid references auth.users(id)`

Constraints:

- One personal-details row per employee.
- Optional email must be valid at application level.
- Empty strings are normalized to `null` before persistence.

### 4.3 New `employee_emergency_contacts` table

Purpose: store multiple emergency contacts per employee.

Fields:

- `id uuid primary key default gen_random_uuid()`
- `employee_id uuid not null references public.employees(id) on delete cascade`
- `full_name text not null`
- `relationship text not null`
- `phone text not null`
- `email text`
- `is_primary boolean not null default false`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `created_by uuid references auth.users(id)`
- `updated_by uuid references auth.users(id)`

Constraints:

- Multiple contacts are allowed.
- A partial unique index ensures only one `is_primary = true` record per employee.
- When contacts exist, the application must ensure one contact is primary.

### 4.4 Avatar storage

Bucket:

```text
employee-avatars
```

Configuration:

- Private bucket
- Maximum file size: 5 MB
- Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`

Storage path format:

```text
{employee-id}/{generated-uuid}.{extension}
```

The database stores only `employees.avatar_path`.

Profile pages request short-lived signed URLs server-side. Storage paths and signed URLs are never treated as authorization boundaries.

## 5. Routes

### Main profile

```text
/employees/[id]
```

The current employee-detail route becomes the expanded employee profile.

### Dedicated edit routes

```text
/employees/[id]/personal/edit
/employees/[id]/employment/edit
/employees/[id]/emergency-contacts
/employees/[id]/manager/edit
```

Emergency contacts may use nested routes for focused forms:

```text
/employees/[id]/emergency-contacts/new
/employees/[id]/emergency-contacts/[contactId]/edit
```

## 6. Profile UI

### 6.1 Header

Display:

- Signed profile photo or initials fallback
- Legal full name
- Preferred name when available
- Employee number
- Job title
- Department
- Employment status
- Work email
- HR-only actions

Actions for Super Admin and HR Admin:

- Update photo
- Edit personal information
- Edit employment information
- Change manager

### 6.2 Tabs

```text
Overview
Personal
Employment
Emergency Contacts
```

Requirements:

- Accessible tab semantics
- Keyboard navigation
- Responsive horizontal scrolling on mobile
- URL-query or route-state support so refresh preserves the active tab
- No inline editing in profile cards

### 6.3 Overview tab

Summary cards:

- Contact details
- Employment summary
- Manager
- Primary emergency contact
- Important dates
- Profile completeness

Profile completeness is a descriptive percentage based only on populated Phase 4A fields. It must not imply employee performance or quality.

### 6.4 Personal tab

Display:

- Legal names
- Preferred name
- Date of birth
- Gender
- Civil status
- Nationality
- Personal email
- Phone
- Full address

### 6.5 Employment tab

Display:

- Employee number
- Work email
- Department
- Job title
- Manager
- Employment type
- Employment status
- Hire date
- Probation end date
- Regularization date
- Work location
- Work schedule

The edit flow must reuse active departments and department-scoped job titles from Phase 3.

### 6.6 Emergency Contacts tab

Support:

- Multiple contacts
- Primary-contact badge
- Add contact
- Edit contact
- Delete contact with confirmation
- Set as primary

Rules:

- If the first contact is created, it becomes primary automatically.
- Creating or editing a contact as primary unsets the previous primary contact atomically.
- Deleting the only contact is allowed.
- Deleting the primary contact while other contacts remain is blocked until another contact is set as primary, or the delete action must atomically promote a selected replacement.

## 7. Authorization

### 7.1 Roles

| Role | View any employee | View own profile | Edit Phase 4A data | Manage avatars |
|---|---:|---:|---:|---:|
| Super Admin | Yes | Yes | Yes | Yes |
| HR Admin | Yes | Yes | Yes | Yes |
| Employee | No | Yes | No | No |

### 7.2 Server-side authorization

Every query and Server Action must verify the authenticated user and role.

Employee self-view resolution uses the authenticated user's `profiles.id` linked to `employees.profile_id`.

Unauthorized direct access to another employee profile must return an unauthorized state or redirect to the current employee's own profile. It must not reveal whether the requested employee exists.

### 7.3 RLS

RLS policies must enforce:

- HR roles can read and manage all Phase 4A records.
- Employees can read only records linked to their own employee row.
- Employees cannot insert, update, or delete Phase 4A records.
- Anonymous users have no access.

### 7.4 Storage policies

Storage policies must enforce:

- HR roles can upload, replace, and delete avatars for any employee.
- Employees can read only their own avatar object through authenticated server-generated signed URLs.
- Anonymous access is denied.

## 8. Manager Assignment

### Candidate rules

A manager candidate must be:

- Active
- Not archived
- Not the employee being edited

### Circular-reporting validation

Before updating `employees.manager_id`, traverse the proposed manager's reporting chain.

Reject when:

- The proposed manager is the employee.
- The proposed manager eventually reports to the employee.
- The hierarchy contains an existing cycle.
- The proposed manager is inactive or archived.

Existing inactive or archived managers remain visible on historical records but cannot be newly assigned.

## 9. Queries and Services

Recommended focused interfaces:

```ts
getEmployeeProfile(employeeId: string): Promise<EmployeeProfile>
getEmployeePersonalDetails(employeeId: string): Promise<EmployeePersonalDetails | null>
getEmployeeEmploymentDetails(employeeId: string): Promise<EmployeeEmploymentDetails>
getEmployeeEmergencyContacts(employeeId: string): Promise<EmergencyContact[]>
getManagerOptions(employeeId: string): Promise<ManagerOption[]>
getEmployeeAvatarSignedUrl(path: string | null): Promise<string | null>
```

Mutation interfaces:

```ts
updateEmployeePersonalDetails(input: UpdatePersonalDetailsInput): Promise<ActionResult>
updateEmployeeEmploymentDetails(input: UpdateEmploymentDetailsInput): Promise<ActionResult>
updateEmployeeManager(input: UpdateManagerInput): Promise<ActionResult>
createEmergencyContact(input: CreateEmergencyContactInput): Promise<ActionResult>
updateEmergencyContact(input: UpdateEmergencyContactInput): Promise<ActionResult>
deleteEmergencyContact(input: DeleteEmergencyContactInput): Promise<ActionResult>
uploadEmployeeAvatar(input: UploadAvatarInput): Promise<ActionResult>
removeEmployeeAvatar(input: RemoveAvatarInput): Promise<ActionResult>
```

Each mutation must:

1. Authenticate.
2. Authorize.
3. Validate input.
4. Validate related records.
5. Persist atomically where multiple writes are required.
6. Revalidate affected routes.
7. Return safe user-facing errors.

## 10. Validation

### Personal details

- Names: trimmed, sensible length limits
- Personal email: optional, valid format
- Phone: required only when business rules demand it; otherwise optional but validated
- Date of birth: cannot be in the future
- Postal code and address fields: length limits

### Employment details

- Employee number and work email remain unique
- Department must be active and not archived for new assignments
- Job title must be active, not archived, and belong to the selected department
- Hire date must be valid
- Probation end date cannot precede hire date
- Regularization date cannot precede hire date
- Manager must satisfy hierarchy rules

### Emergency contacts

- Full name required
- Relationship required
- Phone required
- Optional email must be valid
- Only one primary contact

### Avatar

- MIME type must be JPEG, PNG, or WebP
- File size must not exceed 5 MB
- File extension is derived from validated MIME type
- Filename is generated server-side

## 11. Error Handling and States

Required states:

- Profile loading skeleton
- Tab-section loading state
- No personal details yet
- No emergency contacts yet
- Missing employee
- Unauthorized access
- Validation errors
- Database failure
- Signed-URL failure
- Upload failure
- Successful update
- Delete confirmation

Production UI messages must be generic and safe. Detailed Supabase errors are logged server-side only.

## 12. Testing

### Automated tests

Cover:

- Super Admin profile access
- HR Admin profile access
- Employee self-view access
- Employee blocked from another profile
- Employee edit rejection
- Personal-details validation
- Employment-date validation
- Department/job-title relationship validation
- Manager self-assignment rejection
- Circular-manager rejection
- Inactive/archived manager rejection
- First emergency contact becomes primary
- Primary-contact replacement behavior
- Primary-contact delete protection
- Avatar MIME-type validation
- Avatar file-size validation
- Signed URL behavior with and without an avatar path

### Manual QA

Verify:

- Desktop, tablet, and mobile layouts
- Keyboard navigation across tabs and forms
- Screen-reader labels
- Avatar upload, replacement, and removal
- Profile fallback initials
- Empty personal-details state
- Multiple emergency contacts
- Primary-contact transitions
- Manager validation messages
- Archived manager display
- Employee self-view restrictions
- HR editing permissions
- Vercel deployment with production environment variables

## 13. Migration and Deployment

Create a new migration after Phase 3, for example:

```text
supabase/migrations/202607130004_phase_4a_employee_profiles.sql
```

The migration must:

- Add new `employees` columns
- Create personal-details and emergency-contact tables
- Add indexes and constraints
- Add timestamp triggers
- Add RLS policies
- Create the private storage bucket if not already present
- Add storage policies
- Reload the PostgREST schema cache where needed

Deployment sequence:

1. Back up the working Phase 3 project.
2. Apply the Phase 4A migration to Supabase.
3. Confirm bucket and policies exist.
4. Install/update code locally.
5. Run tests.
6. Run TypeScript validation.
7. Run production build.
8. Run manual QA locally.
9. Commit and push.
10. Confirm Vercel deployment and production behavior.

## 14. Acceptance Criteria

Phase 4A is complete when:

- Expanded employee profiles use real Supabase data.
- Super Admin and HR Admin can edit personal and employment information.
- Employees can view only their own expanded profile.
- Multiple emergency contacts are supported with one primary contact.
- Manager assignment blocks self-management and circular reporting.
- Profile photos use private Supabase Storage and signed URLs.
- Existing Phase 2 and Phase 3 employee and organization features continue to work.
- Loading, empty, error, unauthorized, and success states are present.
- Automated tests pass.
- TypeScript validation passes.
- Production build passes.
- Vercel deployment works with the migration applied.
