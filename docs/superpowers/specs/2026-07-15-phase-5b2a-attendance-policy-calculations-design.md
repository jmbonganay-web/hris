# Phase 5B-2A Attendance Policy and Daily Calculations Design

**Date:** 2026-07-15  
**Status:** Approved  
**Project:** HRIS MVP  
**Depends on:** Phase 5A Attendance MVP and Phase 5B-1 Work Schedules

## 1. Goal

Phase 5B-2A connects attendance records with effective-dated work schedules and one company-wide effective-dated attendance policy.

It adds:

- Late-minute calculation
- Undertime calculation
- Worked-minute calculation
- Scheduled workday and rest-day classification
- Absence generation
- Missing clock-out finalization
- Provisional and finalized calculation states
- Append-only calculation revisions
- Explicit manual recalculation
- Daily attendance finalization
- Employee-visible calculated attendance
- HR revision history and monitoring
- Audit integration

Phase 5B-2A excludes overtime compensation rules and holiday calendars. Those remain in Phase 5B-2B.

## 2. Approved scope

### Included

- One company-wide effective-dated attendance policy
- One fixed late grace period
- No undertime grace period
- Exact completed whole-minute calculations
- Fixed scheduled break deduction
- Actual early clock-in and late clock-out included in worked minutes
- Rest-day worked status
- Unscheduled attendance status
- Absence snapshots after the Manila date ends
- Missing clock-out finalization
- Provisional clock-in calculations
- Finalized clock-out calculations
- Append-only recalculation revisions
- Event-driven calculations
- Supabase scheduled daily finalization
- Manual HR recalculation
- Employee visibility of active calculated results
- HR visibility of revision history and protected reasons
- Audit history for policy, calculations, recalculations, and finalization

### Excluded

- Overtime qualification or pay
- Holiday calendars
- Special or regular holiday classification
- Overnight shifts
- Multiple attendance sessions per day
- Direct override of calculated late, undertime, or worked totals
- Automatic historical recalculation after policy or schedule changes
- Permanent deletion of policies, calculation groups, revisions, or finalization runs

## 3. Architecture

Phase 5B-2A uses:

```text
attendance_policy_versions
attendance_calculation_groups
attendance_calculation_revisions
attendance_finalization_runs
```

The policy table stores immutable effective-dated rules. Each employee/date has one calculation group. Every calculation or recalculation creates a new immutable revision. The group points to the active revision used by employee pages and reports.

A Supabase scheduled database job runs shortly after midnight in `Asia/Manila` and finalizes the previous date.

## 4. Data model

### 4.1 `attendance_policy_versions`

```text
id uuid primary key
effective_date date not null
late_grace_minutes integer not null
created_by uuid not null
created_at timestamptz not null
change_reason text null
```

Rules:

- One policy version per effective date
- Applicable policy is the newest version effective on or before the attendance date
- Grace period is an integer from 0 through 120 minutes
- Past-effective versions require a reason
- Future versions may be created in advance
- Policy versions are immutable and never permanently deleted
- Backdated policy creation does not automatically recalculate finalized attendance
- Before the first explicit policy exists, calculations may use an implicit zero-minute grace default

### 4.2 `attendance_calculation_groups`

```text
id uuid primary key
employee_id uuid not null
attendance_date date not null
active_revision_id uuid null
created_at timestamptz not null
updated_at timestamptz not null
```

Rules:

- Unique constraint on `employee_id + attendance_date`
- A group may exist without an attendance record
- Absences receive calculation groups
- `active_revision_id` points to the current accepted revision
- Employee pages and reports use only the active revision
- Application users receive no direct mutation access

### 4.3 `attendance_calculation_revisions`

```text
id uuid primary key
calculation_group_id uuid not null
revision_number integer not null
attendance_record_id uuid null
schedule_assignment_id uuid null
schedule_version_id uuid null
policy_version_id uuid null
base_status text not null
is_provisional boolean not null
scheduled_start_at timestamptz null
scheduled_end_at timestamptz null
scheduled_minutes integer null
actual_clock_in_at timestamptz null
actual_clock_out_at timestamptz null
worked_minutes integer null
late_minutes integer null
undertime_minutes integer null
is_late boolean not null
is_undertime boolean not null
is_corrected boolean not null
is_recalculated boolean not null
calculation_source text not null
calculated_by uuid null
calculated_at timestamptz not null
recalculation_reason text null
```

Approved base statuses:

```text
present
absent
missing_clock_out
rest_day_worked
unscheduled_attendance
```

Approved calculation sources:

```text
clock_in
clock_out
hr_create
hr_correction
correction_approval
daily_finalization
manual_recalculation
manual_finalization
```

Rules:

- Revisions are append-only
- `revision_number` starts at 1 and increments per group
- New revision insertion and active-revision activation are atomic
- Previous revisions are never updated or deleted
- Employees see only the active revision
- HR may inspect full revision history
- Recalculation reasons are HR-only, trimmed, and limited to 1,000 characters
- Recalculation reasons are excluded from general audit JSON
- Source references remain immutable

### 4.4 `attendance_finalization_runs`

```text
id uuid primary key
target_date date not null
run_source text not null
status text not null
started_at timestamptz not null
completed_at timestamptz null
employees_processed integer not null default 0
absences_created integer not null default 0
missing_clock_outs_finalized integer not null default 0
unchanged_results_skipped integer not null default 0
error_count integer not null default 0
started_by uuid null
manual_reason text null
```

Run sources:

```text
scheduled_job
manual
```

Statuses:

```text
running
completed
completed_with_errors
failed
```

Rules:

- Only one running finalization may exist for a target date
- Scheduled runs target the previous Manila date
- Manual runs may target past dates only
- Manual runs require a reason
- Manual reasons are limited to 1,000 characters
- Re-running a completed date skips equivalent unchanged results
- Error counts do not expose private details

## 5. Calculation inputs

Each revision records the source data used:

```text
attendance record
schedule assignment
schedule version
attendance policy version
attendance date
company timezone: Asia/Manila
```

For each employee/date, the calculator resolves:

1. Attendance record
2. Schedule assignment effective on the date
3. Schedule version effective on the date
4. Policy effective on the date
5. Scheduled workday or rest day

## 6. Whole-minute precision

All calculations use completed whole minutes:

```text
floor((later_timestamp - earlier_timestamp) / 60 seconds)
```

Examples:

```text
8:10:45 AM relative to 8:00 AM = 10 minutes
4:54:59 PM relative to 5:00 PM = 5 minutes
```

Seconds are truncated, not rounded upward.

## 7. Late calculation

The fixed company grace period applies to the policy version effective on the attendance date.

```text
if actual clock-in <= scheduled start + grace:
  late minutes = 0
else:
  late minutes = completed minutes from scheduled start to actual clock-in
```

If a 10-minute grace applies:

```text
8:08 AM clock-in for 8:00 AM start = 0 late minutes
8:15 AM clock-in for 8:00 AM start = 15 late minutes
```

Early clock-ins produce zero late minutes.

## 8. Undertime calculation

There is no undertime grace period.

```text
if actual clock-out < scheduled end:
  undertime minutes = completed minutes from actual clock-out to scheduled end
else:
  undertime minutes = 0
```

Undertime is calculated only for completed scheduled workdays.

Missing clock-out revisions use:

```text
undertime_minutes = null
is_undertime = false
```

## 9. Worked-minute calculation

### Scheduled completed attendance

```text
worked minutes =
  completed minutes from actual clock-in to actual clock-out
  - scheduled break minutes
```

Rules:

- Use actual early clock-in
- Use actual late clock-out
- Deduct the fixed scheduled break once
- Floor result at zero
- Extra time is not labeled overtime in this phase

### Rest-day attendance

Worked minutes use actual elapsed time minus the schedule break when a schedule version applies. Late and undertime remain unavailable.

### Unscheduled attendance

Worked minutes use actual elapsed time with no break deduction. Scheduled minutes, late, and undertime remain unavailable.

## 10. Base-status resolution

### `present`

Use when a schedule applies, the date is a selected workday, and attendance has both clock-in and clock-out.

Independent flags may include:

```text
late
undertime
corrected
recalculated
```

### `absent`

Use when a schedule applies, the date is a selected workday, no attendance exists, and the Manila date has ended.

```text
attendance_record_id = null
worked_minutes = 0
late_minutes = 0
undertime_minutes = 0
is_provisional = false
```

No absence is created for an unassigned employee or rest day.

### `missing_clock_out`

Use when a schedule applies, the date is a selected workday, clock-in exists, clock-out is missing, and the date has ended or HR explicitly finalizes it.

```text
actual clock-in retained
actual clock-out = null
late minutes may be available
worked minutes = null
undertime minutes = null
is_provisional = false
```

### `rest_day_worked`

Use when a schedule applies, the weekday is not selected, and attendance exists.

```text
scheduled_minutes = 0
worked minutes calculated
late minutes = null
undertime minutes = null
```

### `unscheduled_attendance`

Use when no assignment applies and attendance exists.

```text
schedule references = null
scheduled timestamps = null
scheduled minutes = null
worked minutes calculated when completed
late minutes = null
undertime minutes = null
```

No absence result is created for unassigned employees.

## 11. Provisional and finalized behavior

### Clock-in

Creates or refreshes a provisional active revision:

```text
base status = present, rest_day_worked, or unscheduled_attendance
is_provisional = true
late minutes may be available
worked minutes = null
undertime minutes = null
```

### Clock-out

Creates a finalized active revision:

```text
is_provisional = false
worked minutes calculated
late and undertime calculated for scheduled workdays
```

### Daily finalization

For the previous Manila date:

- Create absence revisions
- Finalize missing clock-out revisions
- Skip completed equivalent finalized results
- Record run metrics

### Manual recalculation

Creates a new immutable revision with:

```text
is_recalculated = true
```

Previous revisions remain available.

## 12. Corrected and recalculated flags

`is_corrected` is true when the underlying attendance was created or changed through:

```text
HR attendance creation
HR attendance correction
approved employee correction request
```

`is_recalculated` is true when the active revision was created through explicit manual recalculation.

Both may be true simultaneously.

## 13. Policy management

### Policy list

```text
/settings/attendance-policy
```

Visible to HR Admin and Super Admin.

Displays:

- Current policy
- Late grace minutes
- Effective date
- Upcoming versions
- Historical versions
- Created by and date
- Change reason

Policy versions have no edit or delete controls.

### Create policy

```text
/settings/attendance-policy/new
```

Fields:

```text
effective date
late grace minutes
change reason
```

Validation:

- Whole integer from 0 through 120
- Duplicate effective date rejected
- Past-effective version requires a reason
- Reason maximum 1,000 characters
- Backdated creation does not automatically recalculate finalized results

## 14. Employee attendance UI

The employee attendance view adds:

```text
Date
Schedule
Clock in
Clock out
Worked
Late
Undertime
Status
Calculation state
Actions
```

Employees see only the active revision.

Employees may see:

- Base status
- Scheduled start and end
- Actual clock-in and clock-out
- Worked minutes
- Late minutes
- Undertime minutes
- Provisional or finalized state
- Corrected and recalculated indicators

Employees may not see:

- Previous revisions
- Recalculation reasons
- Policy change reasons
- Internal error information
- Unnecessary calculated-by identifiers

## 15. HR attendance UI

The HR attendance view adds filters for:

```text
date range
employee
department
base status
late
undertime
missing clock-out
provisional
finalized
corrected
recalculated
unassigned schedule
```

Summary counts:

```text
present
absent
missing clock-out
rest day worked
unscheduled attendance
late
undertime
provisional
```

## 16. Calculation details

```text
/admin/attendance/[employeeId]/[attendanceDate]/calculation
```

Displays the active result and full HR-only revision history.

Active result includes:

- Status and flags
- Scheduled timestamps and minutes
- Actual timestamps
- Worked, late, and undertime minutes
- Provisional/finalized state
- Source references
- Calculation source
- Calculated by and at

Revision history includes:

- Revision number
- Status and minute totals
- Flags
- Source
- Actor
- Timestamp
- Recalculation reason

## 17. Manual recalculation

```text
/admin/attendance/recalculate
```

Inputs:

```text
employee scope
start date
end date
recalculation reason
```

Initial UI scope:

```text
one employee
all active employees
```

The database interface accepts an employee-ID array so selected employees and department scope can be added later.

Rules:

- Date range required
- End date must not precede start date
- Future dates rejected
- Reason required and limited to 1,000 characters
- New revisions are append-only
- Existing revisions remain unchanged
- One invalid input prevents the operation from starting
- No group may be left with a revision inserted but not activated

Confirmation:

```text
Recalculate attendance?

This creates new calculation revisions. Previous revisions will remain available in history.
```

## 18. Daily finalization monitoring

```text
/admin/attendance/finalization
```

Displays:

```text
target date
started at
completed at
status
employees processed
absences created
missing clock-outs finalized
unchanged results skipped
errors
```

HR may manually run finalization for a past date with a required reason.

A Supabase scheduled database job invokes the protected finalization function shortly after midnight Manila time.

## 19. Dashboard integration

The employee dashboard attendance card adds calculated context.

Examples:

```text
Clocked in at 8:15 AM
Late: 15 minutes
Calculation: Provisional
```

```text
Worked: 7h 45m
Late: 15m
Undertime: 0m
Calculation: Finalized
```

```text
Missing clock-out
Late: 15m
Worked time unavailable
```

```text
Rest day worked
Worked: 4h 20m
```

```text
Unscheduled attendance
Worked: 8h 5m
Schedule-based calculations unavailable
```

## 20. Protected database functions

Required functions:

```text
create_attendance_policy_version
calculate_attendance_day
recalculate_attendance_range
finalize_attendance_date
```

Each function must:

- Use `security definer`
- Use `set search_path = pg_catalog, public`
- Validate the authenticated role
- Lock the calculation group before revision creation
- Insert the revision and activate it atomically
- Reject future dates for recalculation and finalization
- Return safe error codes
- Revoke execution from `public` and `anon`
- Grant only the minimum required authenticated execution

Employee clock flows may calculate only the authenticated employee and affected date.

HR Admin and Super Admin may run manual recalculation and finalization.

## 21. Event integration

Successful events trigger single-day calculation:

```text
employee clock-in
employee clock-out
HR attendance creation
HR attendance correction
approved correction request
```

Schedule assignment changes and policy creation do not silently rewrite finalized history. HR receives recalculation guidance after backdated changes.

## 22. RLS and safe projections

### Policy versions

Employees may read only safe fields required to explain their active calculation. Employees cannot read `change_reason`.

HR Admin and Super Admin may read all policy fields.

No role receives update or delete access.

### Calculation groups and revisions

Employees access only their own active result through a safe projection.

The projection excludes:

```text
recalculation reason
previous revisions
internal error metadata
unnecessary calculated-by identifiers
```

HR Admin and Super Admin may read all groups and revisions.

No authenticated role may directly insert, update, or delete revisions or change `active_revision_id`.

### Finalization runs

HR Admin and Super Admin may read runs. Employees receive no access.

Mutations occur only through protected functions.

## 23. Calculation integrity constraints

The database enforces:

```text
one group per employee/date
one revision number per group
active_revision_id belongs to the same group
all minute values are null or >= 0
missing_clock_out has null worked and undertime minutes
absent has no attendance record
rest_day_worked has null late and undertime minutes
unscheduled_attendance has null late and undertime minutes
finalized present attendance has worked minutes
provisional revisions cannot be absent or missing_clock_out
```

## 24. Audit integration

Reuse:

```text
employee_audit_logs
```

Entity types:

```text
attendance_policy
attendance_calculation
attendance_finalization
```

Actions:

```text
attendance_policy.created
attendance_calculation.created
attendance_calculation.recalculated
attendance_calculation.finalized
attendance_finalization.started
attendance_finalization.completed
attendance_finalization.failed
```

Safe audit values may include:

```text
attendance date
base status
revision number
scheduled minutes
worked minutes
late minutes
undertime minutes
provisional state
policy version ID
schedule version ID
calculation source
affected employee count
```

Audit JSON must exclude:

```text
policy change reason
recalculation reason
manual finalization reason
employee notes
attendance correction reasons
internal exception text
```

## 25. Error handling

User-facing errors include:

```text
No attendance policy applies to this date.
No schedule version applies to this attendance date.
Attendance calculations are temporarily unavailable.
This attendance result changed while you were reviewing it.
The selected date range contains future dates.
A recalculation reason is required.
A policy version already exists for this effective date.
Finalization is already running for this date.
The recalculation could not be completed.
```

Do not expose SQLSTATE values, constraint names, raw SQL, stack traces, raw Supabase errors, or database function source.

## 26. Automated testing

### Unit tests

- Whole-minute truncation
- Late grace threshold
- Full lateness after grace is exceeded
- Early clock-in
- Undertime
- Break deduction
- Worked-minute zero floor
- Rest-day worked
- Unscheduled attendance
- Absence
- Missing clock-out
- Provisional and finalized rules
- Corrected and recalculated flags

### Policy tests

- Effective policy selection
- Duplicate effective date
- Backdated reason
- Grace limits
- Immutability

### Revision tests

- First revision
- Revision increment
- Active revision replacement
- Previous revision preservation
- Source-reference preservation
- Invalid status/minute combinations
- Group locking for concurrent recalculation

### Finalization tests

- Previous Manila date
- Absence creation
- Missing clock-out finalization
- Current-day exclusion
- Rest-day absence exclusion
- Unassigned employee exclusion
- Idempotent rerun
- Concurrent-run rejection
- Error counting

### Security tests

- Employees see only own active revision
- Employees cannot see reasons or previous revisions
- Employees cannot mutate policies or calculations
- HR can view history
- Fixed function search paths
- Restricted grants
- Audit JSON excludes private text
- Direct revision update and delete fail

### Integration tests

- Clock-in creates provisional revision
- Clock-out creates finalized revision
- HR correction creates a new revision
- Approved correction request recalculates
- Schedule change does not silently rewrite finalized history
- Manual recalculation preserves old revisions
- Finalization creates absences and missing-clock-out results
- Employee and HR pages use active revisions only

## 27. Final verification

```bash
npm test
npm run build
```

Required routes:

```text
/settings/attendance-policy
/settings/attendance-policy/new
/admin/attendance/recalculate
/admin/attendance/finalization
/admin/attendance/[employeeId]/[attendanceDate]/calculation
```

## 28. Acceptance criteria

```text
[ ] HR can create immutable attendance policy versions
[ ] Backdated policies require reasons
[ ] Late grace is applied exactly as approved
[ ] Undertime has no grace period
[ ] Worked minutes use actual timestamps and fixed break deduction
[ ] Early and late extra time remains in worked minutes
[ ] Rest-day attendance is classified separately
[ ] Unscheduled attendance is calculated without schedule rules
[ ] Absences are finalized only after the Manila date ends
[ ] Missing clock-out keeps worked and undertime unavailable
[ ] Clock-in creates a provisional revision
[ ] Clock-out creates a finalized revision
[ ] Recalculations create append-only revisions
[ ] Employees see only active results
[ ] HR can inspect revision history
[ ] Daily finalization is scheduled in Supabase
[ ] Manual finalization and recalculation are available
[ ] Audit JSON excludes every private reason and note
[ ] Employees cannot mutate calculation data
[ ] All automated tests pass
[ ] Production build passes
```
