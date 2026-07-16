# Northstar HRIS MVP

A responsive HRIS application built with Next.js, TypeScript, and Supabase. The current version includes authentication, organization management, expanded employee profiles, protected HR data, attendance, versioned work schedules, overtime and holidays, and HR attendance reports with payroll-ready exports.

## Implemented modules

- Supabase email/password authentication
- Cookie-based sessions and protected dashboard routes
- Forgot-password and reset-password flows
- Role-aware access for `super_admin`, `hr_admin`, and `employee`
- Employee list, search, filters, pagination, detail, create, edit, and soft archive
- Department list, search, filters, pagination, detail, create, edit, department heads, employee counts, and soft archive
- Job-title list, department/status filters, pagination, detail, create, edit, employee counts, and soft archive
- Department-aware job-title filtering in employee forms
- Server-side prevention of archived, inactive, or mismatched organization assignments
- Row Level Security policies for the current HRIS foundation
- Expanded employee profile tabs for overview, personal information, employment, and emergency contacts
- HR-only profile editing with employee self-view restrictions
- Multiple emergency contacts with a single primary contact
- Manager hierarchy validation that blocks self-management and circular reporting chains
- Private Supabase avatar storage with signed URLs, image validation, replacement, and removal
- Encrypted HR-only government IDs and payroll/bank details
- Masked-by-default sensitive values with 30-second reveal controls
- HMAC-based duplicate prevention for SSS, PhilHealth, Pag-IBIG, and TIN
- Append-only metadata logging for every successful sensitive-value reveal
- Encrypted HR notes with role-aware ownership, soft deletion, and Super Admin restoration
- Immutable employee Activity timeline with safe trigger-backed audit events
- Server-authoritative employee clock-in and clock-out with correction requests
- Versioned work schedules and effective-dated employee assignments
- Effective-dated attendance policies and append-only daily calculation revisions
- Late, undertime, worked-minute, absence, rest-day, and unscheduled-attendance calculations
- Automated Manila-date finalization with manual HR recalculation and revision history
- Effective-dated overtime thresholds, immutable holidays, overtime approvals, and employee overtime history
- HR-only Operational and Payroll attendance reports with CSV and XLSX exports
- Employee and HR leave management with effective-dated policies, immutable requests, balance ledger, attendance integration, and private documents

Document management, dashboard analytics, notifications, and payroll computation remain future phases.

## Requirements

- Node.js 22 or newer
- npm 10 or newer
- A Supabase project

## 1. Install

```bash
npm install
```

## 2. Configure environment variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Add:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
HRIS_DATA_ENCRYPTION_KEY=<independent 32-byte base64url secret>
HRIS_DATA_HASH_KEY=<different independent 32-byte base64url secret>
```

Never place a Supabase secret or service-role key in a `NEXT_PUBLIC_` variable.

## 3. Run database migrations

Apply the files in this order through **Supabase → SQL Editor**:

```text
supabase/migrations/202607130001_initial_hris_foundation.sql
supabase/migrations/202607130002_employee_management.sql
supabase/migrations/202607130003_organization_management.sql
supabase/migrations/202607130004_expanded_employee_profile.sql
supabase/migrations/202607140001_sensitive_employee_details.sql
supabase/migrations/202607140002_hr_notes_audit_history.sql
supabase/migrations/202607140003_attendance_mvp.sql
supabase/migrations/202607140004_work_schedules.sql
supabase/migrations/202607150001_attendance_policy_calculations.sql
supabase/migrations/202607150002_overtime_holidays.sql
supabase/migrations/202607150003_overtime_holidays_privilege_hardening.sql
supabase/migrations/202607150004_attendance_reports_payroll_export.sql
supabase/migrations/202607150005_fix_employee_attendance_summary_ambiguity.sql
supabase/migrations/202607160001_leave_management.sql
```

The Phase 3 migration adds:

- `departments.department_head_id`
- `departments.archived_at`
- `job_titles.department_id`
- `job_titles.archived_at`
- Department/job-title lookup indexes
- Active job-title uniqueness within each department

Optionally run:

```text
supabase/seed.sql
```

## 4. Create the first admin

Create a user under **Supabase → Authentication → Users**, then run:

```sql
update public.profiles
set role = 'super_admin'
where id = (
  select id from auth.users where email = 'YOUR_EMAIL_ADDRESS'
);
```

## 5. Configure Supabase URLs

Under **Authentication → URL Configuration**:

- Site URL: your Vercel production URL
- Redirect URLs:
  - `http://localhost:3000/auth/callback`
  - `https://your-project.vercel.app/auth/callback`

## 6. Run locally

```bash
npm run dev
```

Open `http://localhost:3000/login`.

## 7. Test and validate

```bash
npm test
npx tsc --noEmit
npm run build
```

The tests use the Node.js built-in test runner and do not add a test-framework dependency.

## Phase 3 acceptance checklist

1. Create, edit, view, search, filter, paginate, and archive departments.
2. Assign an active employee as department head.
3. Confirm department employee counts update after employee changes.
4. Create, edit, view, filter, paginate, and archive job titles.
5. Confirm duplicate active job-title names are blocked within the same department.
6. Confirm archived organization records remain visible on existing employee details.
7. Confirm archived/inactive records disappear from new employee selectors.
8. Confirm employee job-title options filter by department.
9. Confirm server actions reject department/job-title mismatches.
10. Confirm employee-role users are redirected away from organization-management routes.

## Vercel variables

Add these under **Vercel → Project Settings → Environment Variables** and redeploy:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `HRIS_DATA_ENCRYPTION_KEY`
- `HRIS_DATA_HASH_KEY`


## Phase 4A expanded employee profiles

Phase 4A adds:

- Responsive employee profile tabs for Overview, Personal, Employment, and Emergency Contacts
- Dedicated HR-only edit forms per profile section
- Multiple emergency contacts with one primary contact
- Active-manager selection with self-management and circular-chain protection
- Probation, regularization, work-schedule, and reporting-manager fields
- A private `employee-avatars` Supabase Storage bucket with signed URLs
- Employee self-view restrictions enforced through server authorization and RLS

After applying `202607130004_expanded_employee_profile.sql`, Supabase creates the private avatar bucket and its policies automatically. The bucket accepts JPG, PNG, and WebP files up to 5 MB.

### Phase 4A routes

```text
/employees/[id]?tab=overview
/employees/[id]?tab=personal
/employees/[id]?tab=employment
/employees/[id]?tab=emergency
/employees/[id]/personal/edit
/employees/[id]/employment/edit
/employees/[id]/manager/edit
/employees/[id]/emergency-contacts/new
/employees/[id]/emergency-contacts/[contactId]/edit
```

### Phase 4A acceptance checklist

1. HR Admin and Super Admin can edit every Phase 4A profile section.
2. Employee-role users can view only their own expanded profile.
3. Profile photos upload to the private bucket and display through signed URLs.
4. Invalid file types and files larger than 5 MB are rejected.
5. Multiple emergency contacts can be created, but only one remains primary.
6. The current primary contact cannot be deleted while other contacts remain.
7. Only active, non-archived employees can be newly assigned as managers.
8. Self-management and circular reporting chains are rejected.
9. Existing archived organization values and historical managers remain readable.
10. `npm test`, `npx tsc --noEmit`, and `npm run build` pass.

## Phase 4B-1 protected government and payroll details

Phase 4B-1 adds an HR-only sensitive-data area with server-side encryption and masked display. Apply `supabase/migrations/202607140001_sensitive_employee_details.sql` before opening the new routes.

### Generate the two server-only keys

Generate each value independently:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Store the first output as `HRIS_DATA_ENCRYPTION_KEY` and the second, different output as `HRIS_DATA_HASH_KEY`.

- Store local values only in `.env.local`.
- Add both values to the appropriate Vercel Production, Preview, and Development environments.
- Back up both values in a secure password manager before entering production data.
- Losing the encryption key makes stored encrypted values unrecoverable.
- Changing the hash key breaks duplicate matching until existing rows are rehashed.
- Never expose either key through a `NEXT_PUBLIC_` variable.

### Phase 4B-1 routes

```text
/employees/[id]/sensitive
/employees/[id]/sensitive/edit
```

Only `super_admin` and `hr_admin` users can open these routes or invoke their Server Actions. Employee-role users receive no database policy for either sensitive table.

### Storage and reveal behavior

- SSS, PhilHealth, Pag-IBIG, TIN, account name, and account number are encrypted using AES-256-GCM before storage.
- SSS, PhilHealth, Pag-IBIG, and TIN use keyed HMAC-SHA256 hashes for duplicate detection.
- Normal page reads select only last-four metadata, bank name, and payroll account type.
- Protected inputs are never prefilled. Leaving one blank preserves the current value.
- Explicit Clear controls remove the complete encrypted/hash/last-four group.
- Revealed plaintext remains only in component state and hides after 30 seconds, on **Hide now**, refresh, or navigation.
- Every successful reveal inserts one metadata-only row in `sensitive_data_access_logs` before plaintext is returned.
- Access-log rows have no update or delete RLS policy.

### Phase 4B-1 acceptance checklist

1. Super Admin and HR Admin can view masked values, reveal one value at a time, edit values, and explicitly clear values.
2. Employee-role users cannot see the tab or open either sensitive route.
3. Submitted protected values are not readable as plaintext in `employee_sensitive_details`.
4. Ciphertext starts with `v1.` and government hashes contain 64 hexadecimal characters.
5. Duplicate government IDs produce field-level errors; duplicate bank account numbers remain allowed.
6. Every successful reveal creates one metadata-only access-log row.
7. A failed access-log insert returns a generic error and never returns plaintext.
8. `npm test`, `npx tsc --noEmit`, and `npm run build` pass.


## Phase 4B-2 encrypted HR notes and audit history

Phase 4B-2 adds encrypted HR notes and an immutable employee Activity timeline. Apply this migration after Phase 4B-1 and before deploying the updated application:

```text
supabase/migrations/202607140002_hr_notes_audit_history.sql
supabase/migrations/202607140003_attendance_mvp.sql
supabase/migrations/202607140004_work_schedules.sql
supabase/migrations/202607150001_attendance_policy_calculations.sql
```

The existing `HRIS_DATA_ENCRYPTION_KEY` encrypts HR note content. Do not rotate it without migrating both Phase 4B-1 sensitive data and Phase 4B-2 HR note ciphertext.

### Phase 4B-2 protected routes

```text
/employees/[id]/hr-notes
/employees/[id]/hr-notes/new
/employees/[id]/hr-notes/[noteId]/edit
/employees/[id]/hr-notes/deleted
/employees/[id]/activity
```

### HR note permissions

- Super Admin can view, create, edit, soft-delete, view deleted, and restore any note.
- HR Admin can view all active notes and create notes, but can edit or soft-delete only notes they created.
- HR Admin cannot open the deleted-note archive or restore notes.
- Employee-role users cannot see the HR Notes or Activity tabs and cannot open their routes directly.
- Notes are never permanently deleted through the application.

### Audit behavior

- PostgreSQL triggers own row-based audit events for profile, employment, manager, emergency contact, avatar, archive, sensitive-detail, and HR-note changes.
- Sensitive reveals use `log_sensitive_data_reveal` to insert the compliance record and Activity row atomically before plaintext is returned.
- Audit rows are append-only and contain only approved field names and safe employment before/after values.
- HR note text, ciphertext, government IDs, hashes, last-four values, bank values, and revealed plaintext must never appear in `employee_audit_logs`.
- Activity is ordered newest first and paginated at 20 rows per page.

### Phase 4B-2 acceptance checklist

1. Apply `202607140002_hr_notes_audit_history.sql` and reload the PostgREST schema cache.
2. Confirm `employee_hr_notes` and `employee_audit_logs` both have RLS enabled.
3. Confirm Super Admin can create, edit, soft-delete, view deleted, and restore any note.
4. Confirm HR Admin can edit or delete only notes they created and cannot open the deleted archive.
5. Confirm Employee users cannot see or directly open HR Notes or Activity routes.
6. Create one event in every audit category and confirm exactly one Activity row appears for each action.
7. Reveal a sensitive value and confirm one compliance row plus one Activity row are created.
8. Confirm failed reveal logging returns no plaintext.
9. Search `employee_audit_logs` and confirm no protected values or ciphertext are present.
10. Confirm audit rows cannot be updated or deleted through authenticated API access.
11. Run `npm test`, `npx tsc --noEmit`, and `npm run build` successfully.

## Phase 5A attendance MVP

Phase 5A adds server-authoritative employee clock-in/clock-out, daily attendance history, HR corrections, employee correction requests, and immutable attendance audit events.

Apply this migration **before** deploying the Phase 5A application code:

```text
supabase/migrations/202607140003_attendance_mvp.sql
```

Company attendance dates and all displayed work times use:

```text
Asia/Manila
```

PostgreSQL generates employee clock timestamps. The employee clock actions never accept official clock-in or clock-out values from the browser.

### Phase 5A routes

Employee routes:

```text
/attendance
/attendance/corrections
/attendance/corrections/new
```

HR Admin and Super Admin routes:

```text
/admin/attendance
/admin/attendance/new
/admin/attendance/[employeeId]
/admin/attendance/[employeeId]/records/[recordId]/edit
/admin/attendance/corrections
/admin/attendance/corrections/[requestId]
```

### Role matrix

| Capability | Employee | HR Admin | Super Admin |
|---|---:|---:|---:|
| Clock in/out | Own record | Own record | Own record |
| View attendance | Own only | All employees | All employees |
| Submit/cancel correction request | Own only | Own only | Own only |
| Create missing official record | No | Yes | Yes |
| Correct official record | No | Yes | Yes |
| Approve/reject another user’s request | No | Yes | Yes |
| Review own request | No | No | No |
| Permanently delete attendance | No | No | No |

HR creation and correction require a reason. Employees may request changes for the current company date and previous 30 calendar days. Only one pending request is allowed per employee and attendance date.

### Attendance audit privacy

Attendance events are written to `employee_audit_logs` through protected database functions. Safe audit values may include:

```text
attendance_date
clock_in_at
clock_out_at
status
is_corrected
request_type
request_status
```

The following private text must never appear in audit JSON or application logs:

```text
clock_in_note
clock_out_note
last_correction_reason
correction request reason
employee note
review note
```

Attendance and correction-request records have no permanent-delete workflow or authenticated delete policy.

### Deployment and verification

1. Back up the development database.
2. Run the complete `202607140003_attendance_mvp.sql` migration in Supabase SQL Editor.
3. Confirm `attendance_records` and `attendance_correction_requests` have RLS enabled.
4. Confirm all attendance RPCs are `SECURITY DEFINER` and executable only by `authenticated` users.
5. Deploy the application code after the migration succeeds.
6. Run:

```bash
npm install
npm test
npx tsc --noEmit
npm run build
```

In environments that expose an unusually high CPU count, this equivalent build command limits Next.js worker creation without changing production code:

```bash
CIRCLE_NODE_TOTAL=2 npm run build
```

### Manual Phase 5A QA

Employee:

1. Clock in and confirm one attendance row plus one `attendance.clocked_in` audit row.
2. Double-click or use two tabs and confirm only one record exists for the company date.
3. Clock out and confirm one `attendance.clocked_out` audit row.
4. Leave a previous date open and confirm the next clock-in is blocked.
5. Confirm only personal attendance and correction requests are visible.
6. Submit and cancel a pending correction request.
7. Confirm every `/admin/attendance` route is blocked.

HR Admin and Super Admin:

1. View all attendance records and filter by employee, department, date, and status.
2. Create a missing record with a required reason.
3. Correct an existing record with a required reason.
4. Approve or reject another person’s pending correction request.
5. Confirm self-review is blocked.
6. Confirm approval creates one `attendance.corrected` and one `attendance_correction.approved` audit entry.
7. Confirm no permanent-delete control exists.

Security and boundaries:

1. Confirm private notes and reasons are absent from `employee_audit_logs`.
2. Confirm direct authenticated `UPDATE` and `DELETE` attempts on both attendance tables fail.
3. Confirm employee clock timestamps match PostgreSQL time rather than browser values.
4. Confirm cross-date and overnight values are rejected.
5. Confirm request dates at day 0 and day 30 succeed, while day 31 fails.

## Phase 5B-1 work schedules and employee assignments

Phase 5B-1 adds reusable, versioned work schedules and effective-dated employee schedule assignments. Apply this migration **before** deploying the Phase 5B-1 application code:

```text
supabase/migrations/202607140004_work_schedules.sql
```

### Phase 5B-1 routes

HR Admin and Super Admin routes:

```text
/settings/work-schedules
/settings/work-schedules/new
/settings/work-schedules/[id]
/settings/work-schedules/[id]/edit
/settings/work-schedules/[id]/versions/new
/settings/work-schedules/assign
/settings/work-schedules/assign/bulk
/employees/[id]/schedule
```

Employee self-service route:

```text
/my-schedule
```

### Schedule behavior

- A schedule template stores its reusable code, name, description, and archive state.
- Working days, start time, end time, and unpaid break duration are stored in immutable effective-dated versions.
- Creating a new version preserves the rules used on earlier dates.
- Archived templates cannot receive new assignments, but existing and historical assignments remain resolvable. Restoring a template makes it assignable again.
- A new employee assignment ends the preceding active assignment one day before its effective start date.
- Conflicting assignments beginning on or after the new effective date are retained for audit history but marked superseded.
- Backdated versions and assignments require a private reason limited to 1,000 characters.
- Employee self-service receives a protected projection that excludes descriptions, change reasons, assignment reasons, and creator metadata.
- Employees without an assigned schedule may continue to clock in and out. The interface displays **Unassigned schedule** and does not perform scheduled-hour calculations.
- Phase 5B-1 does not calculate late time, undertime, overtime, absence, holiday effects, or rest-day pay.
- Schedule templates, versions, and assignments have no permanent-delete workflow.

### Phase 5B-1 deployment and verification

1. Back up the development database.
2. Run the complete `202607140004_work_schedules.sql` migration in Supabase SQL Editor.
3. Confirm RLS is enabled for all three schedule tables.
4. Confirm schedule mutation functions use fixed search paths and are executable only by authenticated users.
5. Deploy the application after the migration succeeds.
6. Run:

```bash
npm install
npm test
npx tsc --noEmit
npm run build
```

### Manual Phase 5B-1 QA

HR Admin and Super Admin:

1. Create a template and initial version.
2. Edit only the template code, name, and description.
3. Create a future version and confirm existing versions cannot be edited or deleted.
4. Archive and restore a template, and confirm archived templates cannot receive new assignments.
5. Assign one employee and confirm the preceding assignment ends one day earlier.
6. Confirm conflicting future assignments are marked superseded rather than deleted.
7. Bulk assign multiple employees and confirm one invalid employee rolls back the entire operation.
8. Confirm backdated versions and assignments require reasons.

Employee:

1. Confirm **My Schedule** shows only the authenticated employee's current and upcoming schedule.
2. Confirm working days, start/end time, break duration, rest-day state, and unassigned state display correctly.
3. Confirm an unassigned employee can still use attendance.
4. Confirm schedule-management routes are blocked.

Audit and privacy:

1. Confirm assignment created, ended, and superseded events use the affected employee ID.
2. Confirm template and version events use a null employee ID.
3. Confirm descriptions and private reasons do not appear in audit JSON.
4. Confirm one mutation creates no duplicate audit entries.


## Phase 5B-2A attendance policy and daily calculations

Phase 5B-2A connects Phase 5A attendance records to Phase 5B-1 work schedules. It adds immutable company attendance-policy versions and append-only daily calculation revisions for late time, undertime, worked minutes, absences, missing clock-outs, rest-day work, and unscheduled attendance.

Apply migrations in this order before deploying the Phase 5B-2A application code:

```text
1. supabase/migrations/202607140003_attendance_mvp.sql
2. supabase/migrations/202607140004_work_schedules.sql
3. supabase/migrations/202607150001_attendance_policy_calculations.sql
4. Reload the PostgREST schema cache
5. Deploy the application code
```

The Phase 5B-2A migration enables `pg_cron`. Supabase currently exposes Cron as a Postgres module backed by `pg_cron`; enable the Cron integration or `pg_cron` extension in the Supabase Dashboard before running the migration when the project has not enabled it yet.

### Phase 5B-2A routes

HR Admin and Super Admin:

```text
/settings/attendance-policy
/settings/attendance-policy/new
/admin/attendance/recalculate
/admin/attendance/finalization
/admin/attendance/[employeeId]/[attendanceDate]/calculation
```

Employee attendance remains available at:

```text
/attendance
/dashboard
```

### Calculation behavior

- Company dates and schedule timestamps use `Asia/Manila`.
- One effective-dated company policy supplies a fixed late grace period from 0 through 120 minutes.
- When clock-in is within grace, late minutes are zero. Once grace is exceeded, every completed minute after scheduled start counts as late.
- There is no undertime grace period.
- Completed whole minutes are used; seconds are truncated rather than rounded upward.
- Scheduled worked minutes use actual clock-in and clock-out and deduct the configured schedule break exactly once.
- Early arrival and time after scheduled end remain included in worked minutes but are not classified as overtime in this phase.
- Clock-in creates a provisional revision. Clock-out creates a finalized revision.
- Daily finalization creates absences only for scheduled workdays after the Manila date ends and finalizes previous-day missing clock-outs.
- Rest days without attendance and employees without schedules do not receive absence revisions.
- Recalculation creates a new immutable revision and preserves every previous result.
- Employee and HR attendance lists merge calculation-only days, including finalized absences, with raw clock records.

### Calculation privacy and integrity

- Employees receive only their own active calculation revision through a safe projection.
- Employees cannot view previous revisions, recalculation reasons, policy reasons, internal errors, or unnecessary actor identifiers.
- HR Admin and Super Admin can view full revision history and protected reasons.
- Application users have no direct insert, update, or delete policy for calculation groups or revisions.
- Policy versions and calculation revisions are immutable.
- Policy reasons, recalculation reasons, manual finalization reasons, attendance notes, and attendance correction reasons never enter general audit JSON.
- HR corrects source attendance, schedule, or policy data and recalculates; arbitrary calculated totals cannot be typed directly.

### Verify the scheduled finalization job

After applying the migration, run:

```sql
select jobid, jobname, schedule, command, active
from cron.job
where jobname = 'finalize-attendance-daily';
```

Expected: exactly one active job scheduled at `16:05 UTC`, which is `00:05 Asia/Manila`. The SQL command computes the previous date in `Asia/Manila` before invoking the protected finalization function.

Inspect recent runs with:

```sql
select *
from cron.job_run_details
where jobid = (
  select jobid
  from cron.job
  where jobname = 'finalize-attendance-daily'
)
order by start_time desc
limit 10;
```

### Verify schema and RLS

```sql
select
  relname,
  relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in (
    'attendance_policy_versions',
    'attendance_calculation_groups',
    'attendance_calculation_revisions',
    'attendance_finalization_runs'
  )
order by relname;
```

Expected: all four tables report `relrowsecurity = true`.

### Manual calculation QA

Use a disposable employee and schedule to verify:

1. Clock in within grace and confirm `0` late minutes.
2. Clock in after grace and confirm all completed minutes after scheduled start count as late.
3. Clock out early and confirm exact undertime minutes with no grace.
4. Confirm the schedule break is deducted once from completed worked minutes.
5. Confirm early arrival and late departure remain included in worked minutes.
6. Clock on a rest day and confirm **Rest day worked** with no late or undertime values.
7. Clock while unassigned and confirm **Unscheduled attendance** with no schedule-based values.
8. Leave a record open past midnight and confirm **Missing clock-out** has null worked and undertime minutes.
9. Run finalization for a past workday without attendance and confirm an **Absent** calculation-only day appears in employee and HR attendance lists.
10. Recalculate the same employee/date and confirm revision 2 becomes active while revision 1 remains unchanged.

### Privacy QA

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

Confirm the result contains no policy reason, recalculation reason, manual finalization reason, attendance note, correction reason, or internal exception text.

### Final verification

```bash
npm install
npm test
npx tsc --noEmit
npm run build
```

## Phase 5B-2B overtime and holidays

Apply the migration after Phase 5B-2A:

```text
supabase/migrations/202607150002_overtime_holidays.sql
```

Phase 5B-2B adds effective-dated overtime thresholds, immutable holiday versions, holiday-aware attendance revisions, immutable overtime detections, full HR approval/rejection, employee-safe history, and explicit overtime recalculation.

### Employee routes

```text
/overtime
/attendance
```

### HR Admin and Super Admin routes

```text
/settings/overtime-policy
/settings/overtime-policy/new
/settings/holidays
/settings/holidays/new
/settings/holidays/[holidayGroupId]
/settings/holidays/[holidayGroupId]/replace
/admin/overtime
/admin/overtime/[approvalItemId]
/admin/overtime/recalculate
```

### Calculation and security behavior

- The implicit overtime threshold is 30 completed whole minutes.
- Pre-shift and post-shift segments qualify independently.
- Holiday work overrides rest-day and normal scheduled overtime.
- Rest-day overtime overrides pre-shift and post-shift overtime.
- Holiday and rest-day work reuse finalized attendance worked minutes; breaks are never deducted twice.
- Approval always accepts all detected minutes; rejection accepts zero and requires a reason.
- Recalculation supersedes changed active detections and approval items while preserving history.
- Employee overtime history is provided only through `get_my_overtime_items` and excludes protected reasons, reviewer IDs, internal source IDs, and policy/holiday change reasons.
- Direct table mutation is unavailable to authenticated clients; protected writes use fixed-search-path security-definer functions.
- Holiday or policy changes never silently recalculate historical attendance or overtime.

### Verification

```bash
npm test
npx tsc --noEmit
npm run build
```


## Phase 5C attendance reports and payroll export

Apply Phase 5C after all Phase 5B-2B migrations:

```text
1. supabase/migrations/202607150002_overtime_holidays.sql
2. supabase/migrations/202607150003_overtime_holidays_privilege_hardening.sql
3. supabase/migrations/202607150004_attendance_reports_payroll_export.sql
4. Reload the PostgREST schema cache
5. Deploy the updated application
```

### Access and routes

Phase 5C is available only to HR Admin and Super Admin:

```text
/reports
/api/reports/export/csv
/api/reports/export/xlsx
```

Employees and managers do not receive organization-wide report or export access.

### Report modes and limits

- **Operational mode:** up to 31 inclusive Asia/Manila calendar days; may include provisional attendance for live monitoring.
- **Payroll mode:** up to 366 inclusive Asia/Manila calendar days; active finalized attendance revisions only.
- Future report dates are rejected.
- Screen page sizes are 25, 50, or 100 rows.
- Every CSV dataset and every XLSX worksheet is limited to 25,000 rows.
- Phase 5C prepares attendance data for payroll but does not calculate salary, overtime pay, holiday pay, deductions, contributions, or payslips.

### Export package

CSV downloads are available for four datasets:

```text
Daily Attendance
Employee Summary
Exceptions
Overtime & Holiday Work
```

The XLSX download contains the same four datasets as visible worksheets with frozen headers, filters, explicit date/timestamp cells, integer-minute values, and `HH:MM` display values. Formula-like text is stored as plain text. Files are generated in memory, are not stored, and successful downloads require a safe organization-level audit event.

### Phase 5C verification

After applying the migration, confirm the six public report functions use `SECURITY DEFINER`, authenticated execution only, and fixed `pg_catalog, public` search paths. Confirm the two internal source views and internal helpers are not selectable or executable by `public`, `anon`, or `authenticated`.

Run application verification:

```bash
npm install
npm test
npx tsc --noEmit
npm run build
```

Manual QA:

1. Sign in as HR Admin or Super Admin and open `/reports`.
2. Confirm the current Asia/Manila month is selected by default.
3. Confirm Operational mode separates finalized and provisional totals and rejects ranges over 31 days.
4. Confirm Payroll mode excludes provisional rows and rejects ranges over 366 days.
5. Download all four CSV datasets and the XLSX workbook; confirm each file uses the selected filters.
6. Confirm a result over 25,000 rows is rejected before download.
7. Confirm successful exports create `attendance_report.csv_exported` or `attendance_report.xlsx_exported` audit entries without employee names, timestamps, revision IDs, notes, reasons, or file bytes.
8. Sign in as an employee and confirm `/reports` and both export endpoints are inaccessible.

### Phase 5C query-plan review in preview

Run query-plan checks only in a preview Supabase project using an existing HR Admin or Super Admin profile UUID. Replace `HR_PROFILE_UUID` and the sample dates before running. Do not copy employee rows or production timing output into source control.

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'HR_PROFILE_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"HR_PROFILE_UUID","role":"authenticated"}', true);

explain (analyze, buffers)
select *
from public.get_attendance_daily_report(
  'payroll', date '2026-01-01', date '2026-12-31',
  null, null, null, false, null, null, 1, 100, false
);

explain (analyze, buffers)
select *
from public.get_employee_attendance_summary(
  'payroll', date '2026-01-01', date '2026-12-31',
  null, null, null, false, false, 1, 100, false
);

explain (analyze, buffers)
select *
from public.get_overtime_holiday_report(
  'payroll', date '2026-01-01', date '2026-12-31',
  null, null, null, false, null, null, null, 1, 100, false
);

rollback;
```

Confirm the plans use the report date and active-pointer indexes and do not perform unbounded sequential scans over all attendance revisions or overtime approvals.


## Phase 6 leave management

Apply the Phase 6 migrations in filename order only after all Phase 5C migrations, including `202607150005_fix_employee_attendance_summary_ambiguity.sql`. Existing Phase 6 installations must also apply `202607160002_fix_leave_request_detail_runtime.sql`, `202607160003_fix_leave_draft_delete.sql`, and `202607160004_fix_employee_manager_summary.sql`. Company leave and attendance dates use `Asia/Manila`.

### Deployment and storage checklist

1. Apply `supabase/migrations/202607160001_leave_management.sql`, `202607160002_fix_leave_request_detail_runtime.sql`, `202607160003_fix_leave_draft_delete.sql`, and `202607160004_fix_employee_manager_summary.sql` in filename order after Phase 5C.
2. Confirm the `leave-documents` Supabase Storage bucket exists and remains **private** (`public = false`).
3. Confirm authenticated users cannot list arbitrary bucket objects. Attachment access must use the protected preparation, finalization, and signed-download routes.
4. Create the initial leave types and their effective-dated policy versions.
5. Configure employee exclusions and annual allocation overrides before year opening.
6. Preview the selected leave year, then run year opening. Re-running the same year is idempotent and must not duplicate allocations or carryover.
7. Create allocations for mid-year hires individually and enter the manually prorated units as the employee-year override.
8. Review open leave-attendance conflicts after attendance corrections, schedule changes, or holiday changes.
9. Never expose employee notes, review reasons, cancellation reasons, attachment paths, filenames, or signed URLs in general audit JSON, CSV, XLSX, URLs, or logs.
10. Verify both employee and HR role access before deployment.

### Request and attachment rules

- Employees may backdate requests by up to 30 calendar days and submit requests up to 365 calendar days ahead. HR Admin and Super Admin may create older historical requests when required.
- One request cannot cross December 31; submit separate requests for separate calendar years.
- Whole-day, first-half, and second-half leave are supported. Half-day leave is limited to a single date.
- Requests containing no chargeable scheduled workdays are rejected.
- Pending and approved overlaps are rejected, and pending balance reservations are included when validating available units.
- Supporting files are limited to PDF, JPG/JPEG, and PNG.
- A request may contain no more than five attachments, with a maximum size of 10 MB per file.
- Attachments may be added, replaced, or removed only while the request remains a draft.

### Initial operating procedure

1. Open `/settings/leave-types` and create each leave type with its first effective policy version.
2. Open `/admin/leave/year-opening`, select the target year, and review the preview before generation.
3. Use `/admin/leave/balances` for employee exclusions, yearly overrides, individual allocations, and reason-required adjustments.
4. Use `/admin/leave` for pending review, rejection, approved-request cancellation, and HR-created requests.
5. Use `/admin/leave/conflicts` after attendance or calendar corrections.
6. Use `/reports` for leave balance, usage, and conflict reports. Exports must remain free of confidential leave content.

### Phase 6 verification

```bash
npm ci
npm test
npx tsc --noEmit
npm run build
```

Before production deployment, apply the migration in a preview Supabase project, confirm `leave-documents` is private, and complete employee and HR workflow checks.
