# Phase 5B-1 Work Schedules and Employee Schedule Assignment Design

**Date:** 2026-07-14  
**Status:** Approved design pending written-spec review  
**Project:** HRIS MVP  
**Depends on:** Phase 5A Attendance MVP

## 1. Goal

Phase 5B-1 adds reusable, versioned work schedules and effective-dated employee schedule assignments while preserving historical schedule rules.

The phase adds:

- Reusable work schedule templates
- Weekly working-day patterns
- One start time, end time, and unpaid break duration per template version
- Effective-dated schedule versions
- Individual and bulk employee assignment
- Assignment history without overlaps
- Template archive and restore
- Employee self-service schedule visibility
- Schedule information on the attendance dashboard
- Audit history for schedule and assignment changes

Phase 5B-1 displays schedule information only. It does not calculate lateness, undertime, overtime, absence, or holiday effects.

---

## 2. Approved scope

### Included

- Reusable schedule templates
- Weekly repeating workday patterns
- Same hours on every selected workday
- Same-day shifts only
- One unpaid break duration
- Effective-dated schedule versions
- Effective-dated employee assignments
- Current, future, and backdated assignments
- Required reasons for backdated versions and assignments
- Individual employee assignment
- Atomic bulk assignment
- Automatic ending of preceding assignments
- Superseding of conflicting future assignments
- Schedule archive and restore
- Employee schedule self-service
- Unassigned employees may continue to clock in and out
- Audit integration
- Responsive HR and employee interfaces

### Excluded

- Overnight shifts
- Rotating schedules
- Different hours by weekday
- Employee schedule-change requests
- Schedule approval workflow
- Break clock-in and clock-out
- Late, undertime, overtime, absence, rest-day, or holiday calculations
- Automatic recalculation of historical attendance
- Permanent deletion of schedule templates, versions, or assignments

---

## 3. Architecture

Phase 5B-1 uses three schedule tables:

```text
work_schedule_templates
work_schedule_versions
employee_schedule_assignments
```

The template stores identity and archive state. Versions store immutable effective-dated working rules. Assignments store each employee’s effective-dated schedule history.

For a target attendance date, schedule resolution is:

1. Find the non-superseded employee assignment covering the date.
2. Load the referenced schedule template.
3. Load the latest version whose `effective_date` is on or before the target date.
4. Determine whether the target weekday is a selected working day.

This model preserves historical schedule behavior while permitting future schedule changes.

---

## 4. Data model

### 4.1 `work_schedule_templates`

```text
id uuid primary key
code text not null unique
name text not null
description text null
is_archived boolean not null default false
created_by uuid not null
created_at timestamptz not null
updated_by uuid null
updated_at timestamptz not null
archived_by uuid null
archived_at timestamptz null
```

Rules:

- `code` is normalized before storage.
- Example normalization: `regular day` becomes `REGULAR-DAY`.
- `code` is unique case-insensitively after normalization.
- `name` is required.
- `description` is optional and limited to 1,000 characters.
- Archived templates cannot be used for new assignments.
- Archived templates remain resolvable for existing and historical assignments.
- A template may be restored.
- Code, name, and description may be updated without creating a new version.
- Templates are never permanently deleted.

### 4.2 `work_schedule_versions`

```text
id uuid primary key
schedule_template_id uuid not null
effective_date date not null
working_days text[] not null
start_time time not null
end_time time not null
break_minutes integer not null default 0
change_reason text null
created_by uuid not null
created_at timestamptz not null
```

Allowed `working_days` values:

```text
monday
tuesday
wednesday
thursday
friday
saturday
sunday
```

Rules:

- At least one working day is required.
- Duplicate weekdays are rejected.
- Start time must be earlier than end time.
- Overnight schedules are rejected.
- `break_minutes` must be zero or greater.
- Break duration must be shorter than the shift duration.
- Only one version may exist per template and effective date.
- Versions are immutable after insertion.
- Creating a version with a past effective date requires a reason.
- `change_reason` is trimmed and limited to 1,000 characters.
- Scheduled work minutes are derived as `(end time - start time) - break minutes` and are not stored separately.

### 4.3 `employee_schedule_assignments`

```text
id uuid primary key
employee_id uuid not null
schedule_template_id uuid not null
effective_start_date date not null
effective_end_date date null
assignment_reason text null
is_superseded boolean not null default false
superseded_at timestamptz null
superseded_by_assignment_id uuid null
created_by uuid not null
created_at timestamptz not null
updated_by uuid null
updated_at timestamptz not null
```

Rules:

- Employees may have multiple historical assignments.
- Active assignment ranges cannot overlap.
- Superseded assignments are retained but ignored by schedule resolution.
- A new assignment ends the immediately preceding assignment one day before the new start date.
- Existing assignments beginning on or after the new start date are marked superseded.
- Future assignments fully covered by the new range are marked superseded.
- An explicit end date must be on or after the start date.
- An explicit end date may leave an unassigned gap afterward.
- Backdated assignments require a reason.
- Current and future assignments do not require a reason.
- `assignment_reason` is trimmed and limited to 1,000 characters.
- Employees may have periods without an assigned schedule.
- Assignments are never permanently deleted.

### 4.4 Preventing overlaps

Overlap prevention is enforced inside protected assignment functions.

The final non-superseded ranges for an employee must satisfy the inverse of this overlap condition:

```text
existing.start <= new.end
and new.start <= existing.end
```

Null end dates are treated as open-ended. The function locks the employee’s assignment rows before changing them, so concurrent assignments cannot produce overlapping active ranges.

---

## 5. Audit model refinement

The existing `employee_audit_logs.employee_id` column is currently required. Template and version events are not naturally associated with one employee.

Phase 5B-1 will therefore make `employee_audit_logs.employee_id` nullable.

Rules:

- Template and version events use `employee_id = null`.
- Assignment events use the affected employee’s ID.
- Existing employee activity queries continue filtering by a concrete employee ID, so organization-level events do not appear in an unrelated employee timeline.
- The existing employee foreign key remains in place for non-null values.

Entity types:

```text
schedule_template
schedule_version
schedule_assignment
```

Actions:

```text
schedule_template.created
schedule_template.updated
schedule_template.archived
schedule_template.restored
schedule_version.created
schedule_assignment.created
schedule_assignment.ended
schedule_assignment.superseded
```

Safe audit values may include:

```text
schedule_template_id
schedule code
schedule name
effective date
working days
start time
end time
break minutes
assignment start date
assignment end date
```

Audit JSON must exclude:

```text
template description
version change reason
assignment reason
unrelated employee personal information
```

---

## 6. Roles and permissions

### 6.1 Employee

Employees may:

- View only their own current schedule assignment
- View their own upcoming assignment changes
- View the template and versions required to display those assignments
- View working days, start time, end time, and break duration
- Continue clocking in and out when unassigned

Employees may not:

- Create or update templates
- Create schedule versions
- Archive or restore templates
- Create or modify assignments
- View another employee’s assignment
- Request a schedule change in Phase 5B-1

### 6.2 HR Admin

HR Admin may:

- View all templates, versions, and assignments
- Create schedule templates
- Update template identity fields
- Create effective-dated versions
- Archive and restore templates
- Assign one employee
- Assign multiple employees atomically
- Backdate assignments with a required reason
- View assignment reasons and version change reasons

### 6.3 Super Admin

Super Admin has the same operational schedule permissions as HR Admin with unrestricted administrative oversight.

There is no approval queue. Valid changes take effect according to their effective dates.

---

## 7. Schedule workflows

### 7.1 Create template and initial version

Inputs:

```text
code
name
description
initial effective date
working days
start time
end time
break duration
change reason when backdated
```

The transaction:

1. Authorizes HR Admin or Super Admin.
2. Normalizes and validates the code.
3. Validates schedule rules.
4. Creates the template.
5. Creates the initial version.
6. Writes template and version audit entries.
7. Commits atomically.

If any step fails, neither row remains.

### 7.2 Update template information

Editable fields:

```text
code
name
description
```

Working rules cannot be changed through this flow.

Audit action:

```text
schedule_template.updated
```

### 7.3 Create schedule version

Inputs:

```text
effective date
working days
start time
end time
break duration
change reason
```

Rules:

- Versions are insert-only.
- Duplicate template/effective-date pairs are rejected.
- Past-effective versions require a reason.
- Existing attendance is not recalculated.
- Future versions may be prepared in advance.

Audit action:

```text
schedule_version.created
```

### 7.4 Archive and restore

Archiving prevents new assignments while preserving historical resolution. Restoring makes the template assignable again.

Audit actions:

```text
schedule_template.archived
schedule_template.restored
```

### 7.5 Individual assignment

Inputs:

```text
employee
schedule template
effective start date
optional effective end date
assignment reason when backdated
```

The protected transaction:

1. Authorizes HR Admin or Super Admin.
2. Locks the employee assignment set.
3. Validates that the employee exists and is active.
4. Validates that the template exists and is not archived.
5. Validates the date range.
6. Requires a reason when backdated.
7. Ends the preceding assignment one day before the new start.
8. Marks conflicting future assignments as superseded.
9. Creates the new assignment.
10. Writes one audit entry per affected assignment.
11. Commits atomically.

### 7.6 Bulk assignment

Inputs:

```text
schedule template
employee IDs
effective start date
optional effective end date
assignment reason when backdated
```

Before submission, the interface previews:

```text
employees selected
current assignments that will end
future assignments that will be superseded
employees without an existing assignment
```

Rules:

- Duplicate employee IDs are rejected.
- Every employee must exist and be active.
- The template must be active.
- The operation is all-or-nothing.
- One invalid employee prevents all changes.
- Assignment processing locks employees in a stable order to reduce deadlock risk.
- Every affected employee receives individual assignment audit entries.

---

## 8. Schedule resolution

For a target employee and date:

```text
assignment:
employee_id matches
is_superseded = false
effective_start_date <= target date
effective_end_date is null or effective_end_date >= target date
```

Select at most one assignment.

Then select the version:

```text
schedule_template_id matches
effective_date <= target date
order by effective_date descending
limit 1
```

Possible outcomes:

- **Scheduled workday:** target weekday exists in `working_days`.
- **Rest day:** assignment and version exist, but target weekday is not selected.
- **Unassigned schedule:** no assignment covers the date.
- **Missing schedule version:** assignment exists but no version is effective on the date. HR sees a configuration error; the employee sees schedule information unavailable.

---

## 9. Pages and routes

### HR schedule list

```text
/settings/work-schedules
```

Displays active, archived, or all templates; search; current rules; assigned employee count; upcoming version indicator; and archive status.

### Create schedule

```text
/settings/work-schedules/new
```

### Schedule details

```text
/settings/work-schedules/[id]
```

### Edit template information

```text
/settings/work-schedules/[id]/edit
```

### Create schedule version

```text
/settings/work-schedules/[id]/versions/new
```

### Individual assignment

```text
/settings/work-schedules/assign
```

### Bulk assignment

```text
/settings/work-schedules/assign/bulk
```

### Employee schedule history for HR

```text
/employees/[id]/schedule
```

### Employee self-service

```text
/my-schedule
```

Employees cannot edit schedule data.

---

## 10. Dashboard and navigation

The employee dashboard attendance card adds schedule information such as:

```text
Scheduled today: 8:00 AM–5:00 PM
```

Possible states:

```text
Scheduled workday
Rest day
Unassigned schedule
Upcoming schedule change
Schedule information unavailable
```

Phase 5B-1 does not calculate attendance compliance.

Navigation additions:

- HR Admin and Super Admin: **Work Schedules** under Settings
- HR employee profile: **Schedule** tab
- Employee: **My Schedule**

---

## 11. Validation

### Template

```text
code required
code normalized
code unique
name required
description maximum 1,000 characters
```

### Version

```text
effective date required
at least one working day
allowed weekday values only
no duplicate weekdays
start time required
end time required
end time later than start time
break minutes >= 0
break minutes shorter than shift
past-effective version requires reason
reason maximum 1,000 characters
```

### Assignment

```text
employee exists
employee active
template exists
template not archived
start date required
end date >= start date
backdated assignment requires reason
reason maximum 1,000 characters
duplicate employees rejected in bulk input
final assignment ranges do not overlap
```

---

## 12. Security and RLS

Employees may select only their own assignments and only templates and versions referenced by their assignments. They receive no insert, update, or delete policies for schedule tables.

HR Admin and Super Admin may read all schedule data.

All mutations use protected Server Actions and security-definer database functions that:

- Use `set search_path = pg_catalog, public`
- Verify HR Admin or Super Admin role
- Validate every affected employee and template
- Lock affected rows before temporal changes
- Complete atomically
- Revoke execution from `public` and `anon`
- Grant execution only to `authenticated`
- Reject permanent deletion

Schedule versions have no update or delete policy for authenticated users.

---

## 13. Error handling

User-facing errors include:

```text
A schedule with this code already exists.
Select at least one working day.
The end time must be later than the start time.
Break duration must be shorter than the shift.
A version already exists for this effective date.
Archived schedules cannot be assigned.
A reason is required for backdated changes.
The selected employee is not eligible for assignment.
One or more selected employees are no longer eligible.
The bulk assignment could not be completed. No assignments were changed.
Schedule information is temporarily unavailable.
```

The interface must not expose raw SQL messages, constraint names, stack traces, or Supabase internals.

Private reasons and descriptions must never be written to application logs.

---

## 14. Responsive behavior

On mobile:

- Template tables become cards
- Working-day checkboxes use a compact wrapping grid
- Assignment previews appear above the submit action
- Bulk selection uses a full-width searchable list
- Long names and reasons wrap safely
- Actions remain accessible without horizontal scrolling
- Schedule summaries remain readable at 375px width

---

## 15. Automated testing

### Unit tests

Cover code normalization, shift-minute calculation, break validation, weekday validation, effective version selection, assignment range validation, backdated reason rules, schedule resolution, rest days, and unassigned states.

### Migration and security tests

Verify unique normalized codes, unique template/effective-date versions, version immutability, no employee mutations, no permanent delete policies, archived-template rejection, fixed search paths, restricted grants, audit exclusion of private descriptions and reasons, and nullable audit `employee_id` behavior.

### Transaction tests

Cover atomic template creation, preceding assignment ending, future assignment superseding, overlap prevention, bulk rollback, duplicate employee rejection, archive/restore behavior, historical resolution, and concurrent assignment safety.

### Route and action tests

Cover HR authorization, employee self-service scoping, archived schedule rejection, backdated reason validation, private retry-state safety, atomic bulk RPC usage, and management-route protection.

### Role QA

Confirm employees see only their schedules, HR can manage schedules, archived schedules cannot be newly assigned, backdated changes require reasons, bulk operations are atomic, and unassigned employees can still use attendance.

---

## 16. Final verification

```bash
npm test
npm run build
```

The build must include:

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

---

## 17. Acceptance criteria

```text
[ ] HR can create a reusable schedule and initial version
[ ] HR can update template identity fields
[ ] HR can create immutable effective-dated versions
[ ] HR can archive and restore templates
[ ] HR can assign schedules individually
[ ] HR can assign schedules atomically in bulk
[ ] Preceding assignments end correctly
[ ] Future conflicts are retained but marked superseded
[ ] Active assignments never overlap
[ ] Backdated versions and assignments require reasons
[ ] Employees can view current and upcoming schedules
[ ] Unassigned employees can continue using attendance
[ ] Historical attendance is not rewritten
[ ] Assignment events appear in employee activity
[ ] Template and version events are stored without a false employee association
[ ] Audit JSON excludes descriptions and reasons
[ ] Employees cannot mutate schedule data
[ ] All automated tests pass
[ ] Production build passes
```

## 18. Implementation security refinement

Employee schedule self-service will use a protected security-definer RPC that returns only the fields required for current and upcoming schedule display. Employees will not receive direct base-table access to schedule templates, versions, or assignments. This prevents template descriptions, version change reasons, assignment reasons, and creator metadata from being queried through the API while preserving the approved employee experience. HR Admin and Super Admin retain RLS-protected base-table read access.

