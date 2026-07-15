# Phase 5B-2B Overtime and Holidays Design

**Date:** 2026-07-15  
**Status:** Approved design pending written-spec review  
**Project:** HRIS MVP  
**Depends on:** Phase 5A Attendance MVP, Phase 5B-1 Work Schedules, Phase 5B-2A Attendance Policy and Daily Calculations

## 1. Goal

Phase 5B-2B adds effective-dated overtime policy management, immutable holiday management, overtime and holiday-work detection, HR approval workflows, supersession history, employee-safe visibility, and explicit recalculation.

It builds on finalized Phase 5B-2A attendance calculation revisions.

## 2. Approved scope

### Included

- Effective-dated overtime policy
- Default 30-minute qualifying threshold
- HR-managed holiday calendar
- Regular Holiday
- Special Non-Working Holiday
- Company Holiday
- Immutable holiday replacement versions
- Pre-shift overtime detection
- Post-shift overtime detection
- Rest-day overtime detection
- Holiday-work detection
- Separate pre-shift and post-shift approval items
- Full approval or full rejection
- HR Admin and Super Admin approval
- Rejection reason required
- Approval note optional
- Supersession after recalculation
- Employee overtime history
- HR approval queue
- Explicit overtime recalculation
- Holiday-aware attendance classification
- Audit and security controls
- Safe employee projections

### Excluded

- Payroll computation
- Salary values
- Overtime pay multipliers
- Holiday pay multipliers
- Night differential
- Payslip generation
- Government deductions
- Manager approval
- Partial approval
- External holiday imports
- Automatic historical recalculation after policy or holiday changes
- Permanent deletion

## 3. Core decisions

- Overtime requires HR approval.
- Minimum qualifying time defaults to 30 minutes.
- The threshold is effective-dated and configurable.
- Pre-shift and post-shift segments are detected independently.
- Each qualifying segment creates its own approval item.
- Rest-day work qualifies when finalized worked minutes reach the threshold.
- Holiday work is separate from normal overtime.
- Holiday work takes precedence over rest-day overtime.
- Holiday work produces no late or undertime.
- Holiday without attendance is `holiday`, not `absent`.
- Missing clock-out remains `missing_clock_out` even on holidays.
- HR approves all detected minutes or rejects all detected minutes.
- Rejection reason is required.
- Approval note is optional.
- Recalculation supersedes old detections and approval items.
- Employees see status and minutes but not protected HR reasons.

## 4. Architecture

Phase 5B-2B uses:

```text
overtime_policy_versions
holiday_calendar_groups
holiday_calendar_versions
overtime_detection_groups
overtime_detection_revisions
overtime_approval_items
```

Attendance calculation revisions remain the authoritative source for finalized attendance inputs.

The overtime detector reads the active finalized attendance calculation revision, resolves the applicable overtime policy and holiday version, creates immutable detection revisions, and creates separate approval items for each qualifying segment.

## 5. Data model

### 5.1 `overtime_policy_versions`

```text
id uuid primary key
effective_date date not null
minimum_qualifying_minutes integer not null
created_by uuid not null
created_at timestamptz not null
change_reason text null
```

Rules:

- One version per effective date
- Applicable version is the newest effective on or before the attendance date
- Default threshold is 30 minutes before the first explicit row exists
- Minimum value is 1 minute
- Maximum value is 480 minutes
- Past-effective versions require a reason
- Versions are immutable
- Versions are never permanently deleted
- Backdated policy creation does not automatically recalculate existing detections

### 5.2 `holiday_calendar_groups`

```text
id uuid primary key
active_version_id uuid null
created_by uuid not null
created_at timestamptz not null
updated_at timestamptz not null
```

A group provides a stable identity across immutable holiday versions.

### 5.3 `holiday_calendar_versions`

```text
id uuid primary key
holiday_group_id uuid not null
revision_number integer not null
holiday_date date not null
holiday_name text not null
holiday_type text not null
is_active boolean not null
created_by uuid not null
created_at timestamptz not null
change_reason text null
```

Holiday types:

```text
regular_holiday
special_non_working_holiday
company_holiday
```

Rules:

- Versions are append-only
- `revision_number` increments per group
- A replacement updates `active_version_id` atomically
- Previous versions remain unchanged
- Past or current effective changes require a reason
- Deactivation creates an inactive replacement version
- Only one active holiday version may apply to a date
- No edit or delete workflow exists

### 5.4 `overtime_detection_groups`

```text
id uuid primary key
employee_id uuid not null
attendance_date date not null
segment_type text not null
active_revision_id uuid null
created_at timestamptz not null
updated_at timestamptz not null
```

Segment types:

```text
pre_shift
post_shift
rest_day
holiday_work
```

Unique identity:

```text
employee_id + attendance_date + segment_type
```

### 5.5 `overtime_detection_revisions`

```text
id uuid primary key
detection_group_id uuid not null
revision_number integer not null
attendance_calculation_revision_id uuid not null
attendance_record_id uuid null
schedule_assignment_id uuid null
schedule_version_id uuid null
overtime_policy_version_id uuid null
holiday_version_id uuid null
segment_type text not null
detected_start_at timestamptz null
detected_end_at timestamptz null
detected_minutes integer not null
meets_threshold boolean not null
is_active boolean not null
calculation_source text not null
calculated_by uuid null
calculated_at timestamptz not null
recalculation_reason text null
```

Rules:

- Revisions are append-only
- Revision numbers increment within each group
- Active revision changes atomically
- Every revision references the attendance calculation revision used
- Schedule, policy, and holiday sources are preserved
- Only finalized attendance may produce active detections
- Protected recalculation reasons are HR-only
- No direct updates or deletes are allowed

### 5.6 `overtime_approval_items`

```text
id uuid primary key
detection_revision_id uuid not null
status text not null
detected_minutes integer not null
approved_minutes integer not null
reviewed_by uuid null
reviewed_at timestamptz null
approval_note text null
rejection_reason text null
created_at timestamptz not null
superseded_at timestamptz null
superseded_by_item_id uuid null
```

Statuses:

```text
pending
approved
rejected
superseded
```

Rules:

- One approval item per qualifying detection revision
- Pending items use `approved_minutes = 0`
- Approved items use `approved_minutes = detected_minutes`
- Rejected items use `approved_minutes = 0`
- Partial approval is prohibited
- Rejection reason is required
- Approval note is optional
- Superseded items no longer count in active approved totals
- No direct update or delete policies exist

## 6. Attendance classification changes

Phase 5B-2B adds holiday context to attendance calculation revisions:

```text
holiday_version_id
holiday_name
holiday_type
is_holiday
```

Approved attendance statuses become:

```text
present
absent
holiday
missing_clock_out
rest_day_worked
unscheduled_attendance
```

### Holiday with no attendance

```text
base_status = holiday
worked_minutes = 0
late_minutes = null
undertime_minutes = null
is_provisional = false
```

Rules:

- Never absent
- No overtime or holiday-work item
- Scheduled timestamps may remain visible
- Applies whether the holiday falls on a scheduled workday or rest day

### Holiday with completed attendance

```text
base_status = present
is_holiday = true
late_minutes = null
undertime_minutes = null
worked_minutes = finalized calculation
```

The UI labels the day as `Holiday work`.

### Holiday with missing clock-out

```text
base_status = missing_clock_out
is_holiday = true
worked_minutes = null
late_minutes = null
undertime_minutes = null
```

No holiday-work approval is created until the clock-out is corrected and attendance is finalized.

## 7. Detection prerequisites

Detection runs only when:

- Attendance calculation revision is active
- Attendance calculation is finalized
- Clock-in exists
- Clock-out exists
- Worked minutes exist
- The result is valid for the employee/date

No detection runs for:

```text
provisional attendance
absence
holiday without attendance
missing clock-out
incomplete attendance
```

## 8. Detection precedence

Priority:

```text
1. Holiday work
2. Rest-day overtime
3. Pre-shift overtime
4. Post-shift overtime
```

Consequences:

- Holiday work suppresses rest-day, pre-shift, and post-shift detection
- Rest-day work suppresses pre-shift and post-shift detection
- Pre-shift and post-shift remain independent on normal scheduled workdays

## 9. Normal scheduled workday detection

### Pre-shift

```text
detected_start_at = actual clock-in
detected_end_at = scheduled start
detected_minutes = completed minutes before scheduled start
```

Create an approval item only when:

```text
detected_minutes >= effective minimum threshold
```

When threshold is met, all detected minutes qualify.

### Post-shift

```text
detected_start_at = scheduled end
detected_end_at = actual clock-out
detected_minutes = completed minutes after scheduled end
```

The threshold applies independently.

Example:

```text
Pre-shift: 20 minutes
Post-shift: 20 minutes
Result: no approval items
```

## 10. Rest-day overtime

When finalized attendance occurs on a scheduled rest day and no holiday applies:

```text
segment_type = rest_day
detected_minutes = finalized worked_minutes
```

Rules:

- Threshold applies to total finalized worked minutes
- At threshold or above, all worked minutes qualify
- No pre-shift or post-shift items
- No late or undertime

## 11. Holiday work

When an active holiday applies and completed attendance exists:

```text
segment_type = holiday_work
detected_minutes = finalized worked_minutes
```

Rules:

- Threshold applies to finalized worked minutes
- At threshold or above, all worked minutes qualify
- Exactly one holiday-work approval item per date
- No late or undertime
- Holiday work remains separate from overtime

## 12. Break handling

- Holiday work and rest-day work reuse finalized `worked_minutes`
- Scheduled break deduction occurs only in the attendance calculation
- Overtime detection never deducts a break again
- Pre-shift and post-shift segments are measured directly from timestamps

## 13. Whole-minute precision

All detection uses completed whole minutes.

```text
29m 59s -> 29 minutes
30m 00s -> 30 minutes
```

## 14. Detection revision behavior

When a detection changes:

1. Old revision becomes inactive
2. Old approval item becomes superseded
3. New revision is created
4. New qualifying revision receives a pending approval item
5. Old approved minutes stop counting

When recalculated below threshold:

- Old item becomes superseded
- A new non-qualifying revision is retained for history
- No new approval item is created

Below-threshold storage is explicit:

- An initially detected positive segment below the threshold creates a non-qualifying revision without an approval item
- A zero-minute segment does not create a new group during initial detection
- When an existing active segment recalculates to zero minutes, a zero-minute non-qualifying revision supersedes the old revision and approval item

When unchanged:

- No new revision
- No new approval item
- Existing approval status remains

## 15. Overtime policy management

Routes:

```text
/settings/overtime-policy
/settings/overtime-policy/new
```

Visible to HR Admin and Super Admin.

The list page shows:

- Current policy
- Minimum qualifying minutes
- Effective date
- Upcoming versions
- Historical versions
- Created by
- Created at
- Change reason

When no explicit policy exists:

```text
Implicit default policy
Minimum qualifying minutes: 30
```

Policy versions have no edit or delete controls.

## 16. Holiday calendar management

Routes:

```text
/settings/holidays
/settings/holidays/new
/settings/holidays/[holidayGroupId]
/settings/holidays/[holidayGroupId]/replace
```

Create fields:

```text
holiday date
holiday name
holiday type
```

Replacement fields:

```text
replacement date
replacement name
replacement type
active/deactivated
change reason
```

Warnings:

```text
Existing finalized attendance and overtime results will not change automatically.
Run explicit recalculation for affected dates after saving.
```

## 17. HR overtime approval queue

Route:

```text
/admin/overtime
```

Filters:

```text
date range
employee
department
segment type
holiday type
status
```

Summary metrics:

```text
pending items
approved items
rejected items
superseded items
total detected minutes
total active approved minutes
```

Only active, non-superseded approved items count toward approved totals.

## 18. Approval detail

Route:

```text
/admin/overtime/[approvalItemId]
```

Displays:

- Employee
- Attendance date
- Segment type
- Holiday name/type
- Detected start/end
- Detected minutes
- Attendance calculation revision
- Schedule assignment/version
- Overtime policy version
- Holiday version
- Approval status
- Created at
- Prior superseded items

## 19. Approval workflow

### Approval

```text
status = approved
approved_minutes = detected_minutes
reviewed_by = current HR profile
reviewed_at = current timestamp
approval_note = optional
```

### Rejection

```text
status = rejected
approved_minutes = 0
reviewed_by = current HR profile
reviewed_at = current timestamp
rejection_reason = required
```

Review is blocked when:

```text
status is not pending
detection revision is inactive
item is superseded
detected minutes no longer match active revision
```

Safe stale error:

```text
OVERTIME_ITEM_STALE
```

## 20. Employee overtime view

Route:

```text
/overtime
```

Employees see only their own items.

Visible:

```text
attendance date
segment type
detected minutes
approved minutes
status
approval date
holiday name/type
```

Hidden:

```text
approval note
rejection reason
reviewer ID
policy change reason
holiday replacement reason
recalculation reason
internal source IDs
```

Superseded items remain visible as inactive history.

## 21. Attendance-page integration

Employee and HR attendance pages may show:

```text
Pre-shift: Pending · 35m
Post-shift: Approved · 60m
Rest-day overtime: Pending · 240m
Holiday work: Approved · 480m
```

Holiday without attendance:

```text
Holiday
Worked: 0
No approval required
```

Holiday with completed attendance:

```text
Regular Holiday
Holiday work
Worked: 8h
Holiday-work approval: Pending
```

## 22. Recalculation

Route:

```text
/admin/overtime/recalculate
```

Inputs:

```text
employee scope
start date
end date
recalculation reason
```

Initial scopes:

```text
one employee
all active employees
```

Rules:

- Past and current finalized dates allowed
- Future dates rejected
- Reason required
- Reason maximum 1,000 characters
- Attendance calculation revisions are not modified
- Active finalized attendance is the source
- Previous detections and approvals remain
- Changed results supersede old active items
- Unchanged results create nothing new
- Newly qualifying results create pending items
- Below-threshold results create no approval item

## 23. Protected database functions

Required functions:

```text
create_overtime_policy_version
create_holiday
replace_holiday_version
calculate_overtime_for_attendance_day
recalculate_overtime_range
review_overtime_approval_item
```

Requirements:

- `security definer`
- Fixed `search_path`
- Role validation
- Row locking
- Atomic revision and supersession
- Safe application error codes
- No raw database errors
- Internal calculation helpers revoked from `public`, `anon`, and `authenticated`

## 24. Authorization

### Employee

May:

- Read own safe overtime history
- View status and minutes
- View holiday name/type

May not:

- Review items
- View protected reasons
- View other employees
- Directly mutate any overtime or holiday table

### HR Admin and Super Admin

May:

- Manage overtime policies
- Manage holiday versions
- View all detections and approvals
- Approve and reject pending items
- Run recalculation
- View supersession and revision history

Managers have no approval permission in this phase.

## 25. RLS and safe projections

### Policy

- HR read only
- Protected creation function
- No update/delete

### Holiday

- HR reads groups and versions
- Employees receive safe holiday context only through projections
- No update/delete
- Protected create/replace functions

### Detection

- HR reads all
- Employees receive safe own projections only
- No direct insert/update/delete
- Active revision pointers mutate only in protected functions

### Approval

- HR reads all
- Employees receive safe own projection
- Review through protected function only
- No direct update/delete

## 26. Approval concurrency

The review function receives:

```text
approval_item_id
expected_status
decision
review_text
```

Before decision:

```text
status must be pending
detection must be active
item must not be superseded
detected minutes must match active revision
```

Stale error:

```text
OVERTIME_ITEM_STALE
```

## 27. Audit integration

Reuse:

```text
employee_audit_logs
```

Entity types:

```text
overtime_policy
holiday_calendar
overtime_detection
overtime_approval
```

Actions:

```text
overtime_policy.created
holiday.created
holiday.replaced
holiday.deactivated
overtime_detection.created
overtime_detection.recalculated
overtime_detection.superseded
overtime_approval.approved
overtime_approval.rejected
overtime_approval.superseded
```

Safe audit data may include:

```text
employee ID
attendance date
segment type
holiday type
detected minutes
approved minutes
status
revision number
policy version ID
holiday version ID
calculation source
```

Audit JSON must exclude:

```text
overtime policy reason
holiday replacement reason
recalculation reason
approval note
rejection reason
attendance notes
correction reasons
internal exceptions
```

## 28. Error handling

Safe user-facing errors:

```text
An overtime policy already exists for this effective date.
A reason is required for a backdated policy.
An active holiday already exists for this date.
This holiday changed while you were reviewing it.
This overtime item changed while you were reviewing it.
A rejection reason is required.
Only pending items can be reviewed.
The selected attendance result is not finalized.
The selected date range contains future dates.
Overtime recalculation could not be completed.
```

Do not expose:

```text
SQLSTATE
constraint names
raw Supabase errors
stack traces
function source
internal exception text
```

## 29. Automated testing

### Policy

- Default 30-minute policy
- Effective version resolution
- Duplicate date rejection
- Backdated reason
- Range validation
- Immutability

### Holiday

- All approved holiday types
- Active holiday resolution
- Duplicate active date
- Replacement revision
- Deactivation revision
- Historical preservation
- Past-date reason
- Holiday precedence

### Detection

- Pre-shift threshold
- Post-shift threshold
- Independent thresholds
- Rest-day overtime
- Holiday work
- Below-threshold history
- Whole-minute precision
- Missing clock-out exclusion
- Holiday without attendance exclusion
- Provisional exclusion
- Break not deducted twice

### Approval

- Pending item creation
- Full approval
- Full rejection
- Required rejection reason
- Optional approval note
- Partial approval rejection
- Stale review rejection
- Superseded item rejection
- Active approved totals exclude superseded items

### Recalculation

- Unchanged result no-op
- Changed result supersedes old item
- Approved item becomes superseded
- Replacement item starts pending
- Below-threshold replacement creates no item
- History remains
- Future date rejection
- Required reason

### Security

- Employee sees own safe items only
- Employee cannot review
- Protected reasons hidden
- HR can review
- Direct mutations fail
- Internal functions revoked
- Fixed search paths
- Audit JSON excludes protected text

### Integration

- Clock-out creates qualifying items
- HR correction supersedes items
- Approved correction request recalculates
- Manual attendance recalculation triggers overtime calculation
- Holiday replacement does not silently recalculate
- Explicit recalculation applies new holiday/policy
- Attendance pages show summaries
- Employee page shows safe history
- HR queue totals use active items only

## 30. Final verification

```bash
npm test
npx tsc --noEmit
npm run build
```

Required routes:

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
/overtime
```

## 31. Acceptance criteria

```text
[ ] Effective-dated overtime policy works
[ ] Default 30-minute threshold works before first explicit policy
[ ] Backdated policy requires a reason
[ ] HR can create and replace immutable holiday versions
[ ] Holiday without attendance is not absent
[ ] Holiday missing clock-out remains missing clock-out
[ ] Holiday work suppresses rest-day and normal overtime
[ ] Pre-shift and post-shift thresholds are independent
[ ] Rest-day overtime uses finalized worked minutes
[ ] Holiday work uses finalized worked minutes
[ ] Break is never deducted twice
[ ] Qualifying detections create pending approval items
[ ] HR can fully approve or reject
[ ] Rejection requires a reason
[ ] Partial approval is impossible
[ ] Recalculation supersedes stale detections and approvals
[ ] Unchanged detection creates no new revision
[ ] Employees see only safe own history
[ ] HR queue shows active totals correctly
[ ] Protected reasons never appear in audit JSON
[ ] Direct mutation policies are absent
[ ] All tests pass
[ ] TypeScript passes
[ ] Production build passes
```
