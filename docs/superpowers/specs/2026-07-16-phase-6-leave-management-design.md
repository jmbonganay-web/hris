# Phase 6 Leave Management Design

**Date:** 2026-07-16  
**Status:** Approved  
**Project:** HRIS MVP  
**Depends on:** Phase 5A Attendance MVP, Phase 5B-1 Work Schedules, Phase 5B-2A Attendance Policy and Daily Calculations, Phase 5B-2B Overtime and Holidays, Phase 5C Attendance Reports and Payroll Export

## 1. Goal

Phase 6 adds a secure leave-management domain with configurable leave types, calendar-year entitlements, immutable submitted requests, whole-day and half-day leave, HR approval, append-only balance accounting, carryover, supporting documents, attendance integration, conflict handling, and leave-aware reporting.

The implementation must preserve historical policy and request context, prevent negative tracked balances, integrate atomically with attendance recalculation, and follow the authorization, audit, and immutable-revision patterns established in earlier phases.

## 2. Approved scope

### Included

- Calendar-year leave cycle from January 1 through December 31
- HR-defined leave types with stable identities and effective-dated immutable versions
- Paid and unpaid leave
- Configurable balance tracking per leave type
- Fixed annual allocations
- Employee-specific yearly allocation overrides
- Manual proration for mid-year hires
- HR-triggered, idempotent year-opening allocation generation
- Configurable carryover, disabled by default
- Optional carryover caps
- Carryover expiration at the end of the following calendar year
- Whole-day leave
- First-half and second-half leave for single-day requests
- Scheduled-workday charging only
- Holiday and rest-day non-chargeable treatment
- Employee drafts
- Immutable submitted request revisions
- Employee submission, withdrawal, and history
- HR-created requests on behalf of employees
- HR approval, rejection, and approved-request cancellation
- Whole-request approval or rejection only
- Logical pending balance reservations
- Append-only balance ledger
- Positive and negative HR balance adjustments with required reasons
- Earliest-expiring balance consumption
- Private supporting-document storage
- Automatic attendance recalculation after leave decisions
- Paid-leave and unpaid-leave attendance classifications
- Leave-attendance conflict detection and review
- Automatic recalculation after relevant schedule or holiday changes
- Employee self-service leave workspace
- HR leave administration, balance, calendar, and conflict screens
- Leave-type administration
- Leave-aware reports and CSV exports
- RLS, protected database functions, audit integration, and concurrency protection

### Excluded

- Hourly leave
- Leave units smaller than 0.5 day
- Monthly or per-pay-period accrual
- Automatic proration calculations
- Negative tracked balances
- Manager approval
- Partial request approval
- Employees viewing coworkers' leave
- Department-wide or team leave calendars
- Employee editing after submission
- HR editing submitted request content
- Automatic approval of HR-created requests
- Requests spanning multiple calendar years
- Requests containing only non-chargeable dates
- Payroll amount calculations
- Leave pay rates or salary calculations
- Notifications, email, SMS, or in-app reminders
- Public holiday imports
- External document-management integration
- Permanent deletion of submitted leave, ledger, policy, action, or attachment history

## 3. Approved business decisions

### 3.1 Leave cycle and units

- The leave year is the calendar year.
- Balance units are days in increments of `0.5`.
- Multi-day requests are full-day only.
- Half-day requests are limited to one calendar date.
- A request cannot cross December 31.

### 3.2 Chargeable dates

- Only effective scheduled workdays consume leave.
- Holidays, rest days, and dates without an effective work schedule are non-chargeable.
- A request must contain at least one chargeable date.
- Holiday dates remain represented in the request-day breakdown but consume `0` units.

### 3.3 Submission windows

- Employees may backdate requests by up to 30 calendar days.
- Employees may submit requests up to 365 calendar days in advance.
- HR Admin and Super Admin may create older backdated requests and requests farther than 365 days ahead.
- All requests remain subject to the calendar-year boundary and effective policy validation.

### 3.4 Balances

- Tracked balances are deducted only upon approval.
- Pending requests create logical reservations but no ledger entries.
- Submission and approval validate approved usage plus all other active pending reservations.
- Tracked balances may never become negative.
- Paid leave is always balance-tracked and requires an allocation.
- Unpaid leave is balance-exempt by default but may be configured as balance-tracked.

### 3.5 Allocations and carryover

- Leave types define default annual allocations.
- HR may define an employee-specific allocation override for a leave type and leave year.
- Manual proration is stored as the employee-specific yearly override.
- Active employees as of January 1 are eligible for year-opening generation unless excluded from the leave type.
- Mid-year hires receive individually generated allocations using a manual override.
- Carryover is disabled by default and may have a per-type cap.
- Eligible unused units carried from one year expire on December 31 of the target year.
- Expiring carryover is consumed before current-year allocation and non-expiring adjustments.

### 3.6 Request lifecycle

Approved states are:

```text
draft
pending
approved
rejected
withdrawn
cancelled
superseded
```

- Drafts may be edited and deleted by the owning employee or authorized HR creator.
- Drafts do not reserve balance or block overlapping requests.
- Submitted content is immutable.
- Employees withdraw pending requests and create replacements when details change.
- Only HR Admin and Super Admin may cancel approved requests.
- Cancellation requires a reason and restores charged units.
- A prior request becomes `superseded` only after its linked replacement is approved.

### 3.7 Approval

- HR Admin and Super Admin are the only approvers.
- Manager approval is not part of Phase 6.
- Approval or rejection applies to the complete request.
- Rejection requires a reason.
- Approval notes are optional.
- HR-created requests enter `pending` and require a separate approval action.
- Approval uses row locking and stale-state validation.

### 3.8 Notes and documents

- Employee notes are optional by default and may be required by leave-type policy.
- Employee notes are limited to 1,000 characters.
- Notes are visible only to the employee and authorized HR users.
- Supporting documents are optional by default and may be required by policy at or above a configured request duration.
- Allowed attachment types are PDF, JPG, and PNG.
- Maximum attachment count is five files per request.
- Maximum size is 10 MB per file.
- Attachments may be added, replaced, or removed only while the request is a draft.

## 4. Architecture

Phase 6 uses a relational leave domain with stable identities, effective-dated policy versions, immutable submitted revisions, append-only actions, append-only balance entries, protected workflows, and derived safe projections.

Primary objects:

```text
leave_types
leave_type_versions
employee_leave_year_settings
leave_request_groups
leave_request_revisions
leave_request_days
leave_request_day_revisions
leave_request_actions
leave_request_attachments
leave_balance_accounts
leave_balance_ledger
leave_attendance_conflicts
```

Core flow:

```text
leave-type policy
→ employee draft
→ request-day preview
→ protected submission
→ pending logical reservation
→ protected HR review
→ balance ledger posting
→ attendance recalculation
→ conflict generation
→ reports and safe projections
```

The frontend does not directly create approval decisions, ledger charges, carryover entries, cancellation restorations, conflict releases, or year-opening allocations.

## 5. Data model

The listed fields define the required semantics. PostgreSQL identifiers may be adjusted only to match established repository naming conventions; relationships, immutability, state transitions, and constraints are mandatory.

### 5.1 `leave_types`

Stable identity for a leave type across policy versions.

```text
id uuid primary key
code text not null unique
created_by uuid not null
created_at timestamptz not null
```

Rules:

- Codes are normalized, stable, and unique.
- The stable row is not permanently deleted after use.
- Archiving is represented by an inactive effective-dated version.
- Current, future, and historical policy state is resolved from immutable versions by effective date; the stable row has no mutable current-policy pointer.

### 5.2 `leave_type_versions`

```text
id uuid primary key
leave_type_id uuid not null
revision_number integer not null
effective_from date not null
name text not null
description text null
is_active boolean not null
is_paid boolean not null
is_balance_tracked boolean not null
default_annual_units numeric(6,1) not null
carryover_enabled boolean not null
carryover_cap_units numeric(6,1) null
employee_note_required boolean not null
document_required boolean not null
document_required_min_units numeric(6,1) null
created_by uuid not null
created_at timestamptz not null
change_reason text null
```

Rules:

- Versions are append-only.
- Revision numbers increase within a leave type.
- The applicable version is the newest version effective on or before the request start date at submission time.
- The selected version applies to the complete submitted request and is frozen on the request revision.
- A later policy version does not rewrite an already submitted request, including a future-dated request.
- A pending request continues to use its frozen version even when a later version archives the leave type. New submissions must resolve to an active version.
- Paid versions must be balance-tracked.
- Balance-exempt versions must use `default_annual_units = 0`, have carryover disabled, and have no carryover cap.
- Unit fields use `0.5` increments and cannot be negative.
- A carryover cap is allowed only when carryover is enabled.
- `document_required_min_units` is allowed only when documents are required.
- A document threshold is evaluated against chargeable leave units, not raw calendar-day count.
- Creating a past-effective or current-effective replacement requires a change reason.
- Archiving creates a new version with `is_active = false`.
- Existing versions have no update or delete workflow.

### 5.3 `employee_leave_year_settings`

Stores leave-type eligibility and optional employee-specific allocation values for one leave year.

```text
id uuid primary key
employee_id uuid not null
leave_type_id uuid not null
leave_year integer not null
is_excluded boolean not null
annual_allocation_override_units numeric(6,1) null
created_by uuid not null
created_at timestamptz not null
updated_by uuid null
updated_at timestamptz null
private_reason text null
```

Unique identity:

```text
employee_id + leave_type_id + leave_year
```

Rules:

- Override values use `0.5` increments and cannot be negative.
- `is_excluded = true` prevents automatic or individual allocation generation for that type and year.
- Employee exclusion may be changed for the target year through an audited HR action; it affects new submissions but does not rewrite prior requests or ledger entries.
- The allocation override may be adjusted before its annual allocation is generated.
- After a generated allocation exists, entitlement changes occur through append-only balance adjustments rather than rewriting the original allocation.
- Private reasons do not enter general audit JSON or employee-safe projections.

### 5.4 `leave_request_groups`

Stable request identity.

```text
id uuid primary key
employee_id uuid not null
created_by uuid not null
created_source text not null
active_revision_id uuid null
current_status text not null
replaces_request_group_id uuid null
superseded_by_request_group_id uuid null
created_at timestamptz not null
updated_at timestamptz not null
```

`created_source` values:

```text
employee
hr
```

Rules:

- `current_status` uses the approved lifecycle states.
- Only protected functions may transition submitted lifecycle states.
- `replaces_request_group_id` links a new request to a withdrawn or cancelled request.
- The prior request becomes `superseded` only when the replacement reaches `approved`.
- Draft-only groups may be permanently deleted with their draft attachments.
- Submitted groups are never permanently deleted.

### 5.5 `leave_request_revisions`

```text
id uuid primary key
request_group_id uuid not null
revision_number integer not null
leave_type_version_id uuid not null
leave_year integer not null
start_date date not null
end_date date not null
duration_mode text not null
employee_note text null
requested_units numeric(6,1) not null
submitted_chargeable_units numeric(6,1) not null
created_by uuid not null
created_at timestamptz not null
updated_at timestamptz null
submitted_at timestamptz null
frozen_at timestamptz null
```

Duration modes:

```text
full_day
first_half
second_half
```

Rules:

- The active draft revision may be updated before submission.
- A submitted revision is frozen and immutable.
- Half-day modes require `start_date = end_date`.
- Multi-day requests require `duration_mode = full_day`.
- `leave_year` must match both request dates.
- `employee_note` is limited to 1,000 characters.
- `requested_units` equals the selected calendar-date count multiplied by `1.0` or `0.5`; `submitted_chargeable_units` is the submission-time sum of scheduled leave-usage units after holiday, rest-day, and no-schedule exclusions.
- `submitted_chargeable_units` must be greater than zero at submission.
- The current chargeable total is derived from active request-day revisions and may change after a schedule or holiday recalculation without mutating the frozen request revision.
- For a balance-exempt unpaid type, chargeable units still count as leave usage but create no balance reservation requirement and no ledger charge.
- A replacement is a new request group, not a mutation of this revision.

### 5.6 `leave_request_days`

Stable identity for each calendar date in a submitted request.

```text
id uuid primary key
request_revision_id uuid not null
leave_date date not null
active_revision_id uuid null
created_at timestamptz not null
```

Unique identity:

```text
request_revision_id + leave_date
```

### 5.7 `leave_request_day_revisions`

Append-only per-date classification and recalculation history.

```text
id uuid primary key
request_day_id uuid not null
revision_number integer not null
schedule_assignment_id uuid null
schedule_version_id uuid null
holiday_version_id uuid null
attendance_calculation_revision_id uuid null
is_scheduled_workday boolean not null
is_rest_day boolean not null
is_holiday boolean not null
is_chargeable boolean not null
chargeable_units numeric(2,1) not null
leave_classification text not null
half_day_boundary_at timestamptz null
conflict_state text null
calculation_source text not null
calculated_by uuid null
calculated_at timestamptz not null
recalculation_reason text null
```

Leave classifications:

```text
paid_leave
unpaid_leave
non_chargeable_holiday
non_chargeable_rest_day
non_chargeable_no_schedule
attendance_precedence
```

Rules:

- Revisions are append-only.
- The first revision captures submission-time schedule and holiday context; the frozen leave-type policy remains available through the parent request revision.
- Recalculation creates a new revision and changes the stable day's active pointer atomically.
- `chargeable_units` is only `0`, `0.5`, or `1.0`.
- Original revisions remain unchanged after schedule, holiday, attendance, or leave recalculation.
- Confidential recalculation reasons are excluded from employee-safe projections and general audit JSON.

### 5.8 `leave_request_actions`

Immutable lifecycle action history.

```text
id uuid primary key
request_group_id uuid not null
request_revision_id uuid not null
action_type text not null
from_status text null
to_status text not null
actor_profile_id uuid not null
actor_role text not null
action_reason text null
review_note text null
created_at timestamptz not null
```

Action types include:

```text
created
submitted
approved
rejected
withdrawn
cancelled
superseded
```

Rules:

- Actions are append-only.
- Rejection and cancellation require a private reason.
- Approval notes are optional.
- Private action text is available only to authorized leave screens.
- Employee notes, review notes, change reasons, adjustment reasons, cancellation reasons, rejection reasons, and conflict-resolution notes are limited to 1,000 characters.
- Lifecycle history remains visible even after supersession.

### 5.9 `leave_request_attachments`

```text
id uuid primary key
request_group_id uuid not null
request_revision_id uuid not null
storage_path text not null
original_filename text not null
mime_type text not null
size_bytes bigint not null
uploaded_by uuid not null
uploaded_at timestamptz not null
frozen_at timestamptz null
```

Rules:

- Allowed MIME and extension pairs are PDF, JPG/JPEG, and PNG.
- Maximum five attachments per request group.
- Maximum 10 MB per attachment.
- Draft attachments may be inserted, replaced, or deleted.
- Submission freezes attachment metadata and objects.
- Submitted attachment rows and objects are retained through rejection, withdrawal, cancellation, and supersession.

### 5.10 `leave_balance_accounts`

Stable lock and grouping row for one tracked employee balance.

```text
id uuid primary key
employee_id uuid not null
leave_type_id uuid not null
leave_year integer not null
created_at timestamptz not null
```

Unique identity:

```text
employee_id + leave_type_id + leave_year
```

Rules:

- The row does not store a mutable balance total.
- Protected operations lock this row before validating or posting tracked balance changes.
- Balance is derived exclusively from ledger entries.

### 5.11 `leave_balance_ledger`

```text
id uuid primary key
balance_account_id uuid not null
entry_type text not null
units numeric(6,1) not null
effective_date date not null
expires_on date null
source_entry_id uuid null
reversal_of_entry_id uuid null
request_group_id uuid null
request_day_revision_id uuid null
generation_key text null
created_by uuid null
created_at timestamptz not null
private_reason text null
metadata jsonb not null
```

Entry types:

```text
annual_allocation
carryover
hr_adjustment_credit
hr_adjustment_debit
approved_leave_charge
cancellation_restoration
attendance_conflict_release
recalculation_charge
recalculation_release
```

Rules:

- Ledger rows are append-only and never directly updated or deleted.
- Units are non-zero multiples of `0.5`. Allocation, carryover, credit, restoration, and release entries are positive; charge and debit entries are negative.
- Positive source entries include annual allocation, carryover, and positive HR adjustments.
- Negative entries consume one specific positive source through `source_entry_id`.
- One leave day may create multiple negative entries when units span multiple sources.
- Cancellation and release entries reference the original negative entry through `reversal_of_entry_id` and restore the original source.
- Earliest expiration is consumed first; entries without expiration are consumed after expiring entries.
- Within the same expiration date, older source entries are consumed first.
- Expired positive units are excluded from available balance.
- Negative HR adjustments consume available sources using the same ordering.
- No operation may reduce available tracked balance below zero.
- Annual allocation and ordinary adjustment sources are confined to their balance-account year even when `expires_on` is null. Carryover uses an explicit target-year expiration date.
- `generation_key` enforces idempotency for annual allocation and carryover generation.
- Private reasons are not copied into general audit JSON.

### 5.12 Pending reservation view

Pending reservation is derived rather than stored as mutable ledger state.

The view sums active chargeable request-day revisions for requests whose current status is `pending`, grouped by:

```text
employee_id
leave_type_id
leave_year
```

For balance-tracked types, available units presented to the employee are:

```text
unexpired ledger balance
- other pending reserved units
```

The current request is excluded from its own reservation calculation during revalidation. Balance-exempt unpaid requests may show pending usage but do not reduce an available-balance value.

### 5.13 `leave_attendance_conflicts`

```text
id uuid primary key
employee_id uuid not null
request_group_id uuid not null
request_day_id uuid not null
leave_day_revision_id uuid not null
attendance_calculation_revision_id uuid null
conflict_type text not null
status text not null
automatic_balance_action text null
created_at timestamptz not null
resolved_by uuid null
resolved_at timestamptz null
resolution_type text null
private_resolution_note text null
```

Conflict types:

```text
full_day_completed_attendance
full_day_incomplete_attendance
half_day_covered_time_overlap
schedule_recalculation_failed
holiday_recalculation_failed
insufficient_balance_after_recalculation
```

Statuses:

```text
open
resolved
superseded
```

Rules:

- Conflicts are append-only except protected status resolution and supersession pointers.
- A new leave-day or attendance revision supersedes stale open conflict records.
- Resolution notes are private HR data.

## 6. Leave-type management

Routes:

```text
/settings/leave-types
/settings/leave-types/new
/settings/leave-types/[leaveTypeId]
/settings/leave-types/[leaveTypeId]/new-version
```

HR Admin and Super Admin may:

- Create a leave type and initial version
- Schedule a future version
- Create a current or backdated replacement with a required reason
- Archive a leave type through an inactive version
- Configure paid status, balance tracking, default annual units, carryover, notes, and documents
- Review current, future, and historical versions

Rules:

- Used versions are read-only.
- There is no permanent delete control after a leave type has been referenced.
- Balance-exempt types do not expose allocation or carryover controls.
- Paid types cannot be configured as balance-exempt.

## 7. Employee eligibility and yearly allocation

### 7.1 Default eligibility

For a target leave year, an employee is eligible when:

- The employee was active on January 1 of the target year
- Employment began on or before January 1
- Employment did not end before January 1
- The leave type has an active version effective on January 1 of the target year
- The employee is not excluded for the type and year

Archived or separated employees receive no new allocation.

### 7.2 Employee-specific settings

HR may:

- Exclude an employee from a leave type for a year
- Set a yearly allocation override
- Use that override as manual proration for a mid-year hire

The default annual amount comes from the leave-type version effective on January 1 of the target year. For an individual mid-year allocation, policy eligibility comes from the version effective on the employee's allocation effective date. The generated ledger row records the exact policy version and whether the amount came from the policy default or the employee override.

### 7.3 Year-opening workflow

Route:

```text
/admin/leave/year-opening
```

The workflow has two protected steps:

1. Preview target-year allocation and carryover results.
2. Confirm generation.

Preview returns:

- Employees eligible for default allocation
- Employees using overrides
- Excluded employees
- Skipped inactive or separated employees
- Carryover-eligible balances
- Carryover caps applied
- Missing-policy or invalid-setting exceptions

Generation:

- Locks the relevant leave type, target year, and employee balance accounts
- Creates missing annual allocations
- Creates eligible carryover entries
- Uses deterministic generation keys
- Is safe to rerun without duplicates
- Returns created, previously generated, and skipped counts
- Rolls back the complete generation transaction on an unexpected runtime failure; it does not leave a partially written year-opening run

### 7.4 Mid-year hire generation

HR generates an individual entitlement after creating the employee's yearly override.

The system does not calculate proration automatically.

## 8. Carryover rules

For an origin year `Y` and target year `Y + 1`:

- The carryover basis is the unused tracked balance remaining in origin-year account `Y` at the close of December 31, including eligible allocation and adjustment credits after all debits and charges.
- Only unused, unexpired, eligible units from `Y` may carry.
- Carryover eligibility and the cap use the leave-type version effective on January 1 of target year `Y + 1`.
- Origin-year carryover entries are not carried again; carryover is limited to one target year and expires there.
- The amount is limited by the leave-type version's carryover cap when present.
- The new carryover source entry belongs to target year `Y + 1`.
- The carryover expires on December 31 of `Y + 1`.
- The carryover entry links to the origin-year source context.
- Rerunning generation does not duplicate carryover.
- Carryover is consumed before target-year allocation because it expires first.

Carryover generation does not mutate or move origin-year ledger entries.

## 9. Draft workflow

### 9.1 Create and edit

Employees create drafts only for themselves. HR may create drafts for any employee.

A draft may contain:

- Leave type
- Start and end dates
- Full-day, first-half, or second-half duration
- Employee note
- Supporting documents

Each draft save resolves a preview using current effective data:

- Leave-type version
- Eligibility
- Work schedule
- Holiday
- Rest-day status
- Per-date units
- Total requested units
- Total chargeable units
- Current balance and pending reservations

Draft preview is advisory. Submission performs all validation again under locks.

### 9.2 Draft retention and deletion

- Drafts remain until submitted or deleted.
- There is no automatic expiration job.
- Drafts do not reserve balances.
- Drafts do not block overlap.
- Deleting a draft removes its draft rows and storage objects.
- Draft deletion is the only permanent leave-request deletion workflow.

## 10. Submission workflow

Protected function:

```text
submit_leave_request
```

The function:

1. Validates the authenticated actor and request ownership.
2. Locks the employee and applicable tracked balance account.
3. Confirms the request is still a draft.
4. Resolves and freezes the applicable leave-type version.
5. Validates employee eligibility.
6. Validates date order and one-calendar-year scope.
7. Enforces employee backdate and future limits when the creator is not using HR override authority.
8. Enforces single-day half-day rules.
9. Resolves schedule and holiday context for every date.
10. Rejects zero-chargeable-day requests.
11. Checks overlap against pending and approved requests.
12. Calculates pending reservations excluding the current request.
13. Validates sufficient tracked balance.
14. Validates required employee note.
15. Validates required attachments, file count, MIME type, extension, and size.
16. Creates immutable request-day and request-day-revision snapshots.
17. Freezes the request revision and attachments.
18. Appends a submission action.
19. Transitions the request to `pending`.

Submission creates no balance-ledger entry.

### 10.1 Employee and HR limits

Employee-created submissions:

```text
minimum start date = current company date - 30 calendar days
maximum end date = current company date + 365 calendar days
```

HR-created submissions may exceed those limits but must still pass all other rules.

### 10.2 Overlap rules

Blocking statuses:

```text
pending
approved
```

Non-blocking statuses:

```text
draft
rejected
withdrawn
cancelled
superseded
```

On the same date:

- Full day overlaps first half, second half, or full day.
- First half overlaps first half or full day.
- Second half overlaps second half or full day.
- One first-half request and one second-half request may coexist.

Safe error:

```text
LEAVE_OVERLAP
```

### 10.3 Zero-chargeable validation

When every date is a holiday, rest day, or no-schedule date, submission fails with:

```text
LEAVE_NO_CHARGEABLE_DAYS
```

## 11. HR review workflow

### 11.1 Review route

```text
/admin/leave/[requestGroupId]
```

The reviewer sees:

- Employee identity and department
- Leave type and frozen policy version
- Date range and duration mode
- Per-date schedule, holiday, and units
- Requested and chargeable totals
- Current tracked balance
- Other pending reservations
- Employee note
- Supporting documents
- Request revision and action history
- Overlap and stale-state validation status

The reviewer cannot edit submitted content.

### 11.2 Approval

Protected function:

```text
review_leave_request
```

Approval inputs include:

```text
request_group_id
expected_request_revision_id
expected_status
decision
review_text
```

Approval:

1. Validates HR role.
2. Locks the request, employee, balance account, and source ledger entries.
3. Requires the request to remain active and `pending`.
4. Re-resolves current schedule and holiday context for every request date.
5. When those calculations differ from the active request-day revisions, appends replacement day revisions and returns `LEAVE_REQUEST_STALE` so the reviewer must reload the changed totals before deciding.
6. Requires the expected request revision, active day-revision fingerprint, and current chargeable total to match the reviewed state.
7. Revalidates eligibility, overlap, required current chargeable units, and tracked balance including other pending requests.
8. Uses the frozen leave-type version and the current active request-day revisions.
9. Consumes earliest-expiring sources first.
10. Creates one or more negative ledger entries for each chargeable request day when the type is balance-tracked.
11. Appends the approval action.
12. Transitions the request to `approved`.
13. Recalculates all affected attendance dates.
14. Generates or supersedes leave-attendance conflicts.
15. Marks an approved replacement's prior request as `superseded`.
16. Commits only when all balance and attendance steps succeed.

No partial approval is allowed.

### 11.3 Rejection

- Requires a reason.
- Creates no ledger entry.
- Appends a rejection action.
- Transitions the request to `rejected`.
- Releases logical pending reservation automatically because the request is no longer pending.

### 11.4 Stale review protection

Review fails with:

```text
LEAVE_REQUEST_STALE
```

when:

- Status is no longer `pending`
- Active revision changed
- Active request-day revision fingerprint or current chargeable units no longer match the reviewed values
- The request was withdrawn, rejected, cancelled, or superseded
- Another reviewer already completed an action

## 12. Withdrawal, cancellation, and replacement

### 12.1 Employee withdrawal

Employees may withdraw only their own pending requests.

The protected withdrawal function:

- Locks the request
- Confirms status is `pending`
- Appends a withdrawal action
- Transitions to `withdrawn`
- Releases logical reservation by status change
- Preserves submitted content and attachments

### 12.2 HR cancellation

Only HR Admin and Super Admin may cancel approved requests.

Cancellation:

1. Requires a reason.
2. Locks the approved request and related ledger entries.
3. Creates restoring ledger entries against every active approved leave charge.
4. Restores units to their original source entries.
5. Appends a cancellation action.
6. Transitions the request to `cancelled`.
7. Recalculates affected attendance dates.
8. Supersedes stale conflict records and generates any new conflicts.
9. Commits atomically.

### 12.3 Replacement

- A replacement is always a new request group.
- The new request links to the withdrawn or cancelled request.
- The old request retains its withdrawal or cancellation action.
- When the replacement is approved, the prior request's current state becomes `superseded` and a supersession action is appended.
- Rejecting or withdrawing the replacement does not supersede the prior request.

## 13. HR balance adjustments

Route:

```text
/admin/leave/balances
```

HR Admin and Super Admin may create positive or negative adjustments.

Rules:

- Units use `0.5` increments.
- Reason is required.
- Positive adjustments create a new available source entry.
- Negative adjustments consume existing sources using earliest-expiration ordering.
- A negative adjustment cannot reduce ledger balance below zero or reduce balance net of active pending reservations below zero.
- Existing allocations, carryover, usage, and prior adjustments are never rewritten.
- Adjustments apply only to balance-tracked leave types.
- Audit records store identifiers and numeric changes but not the private reason text.

## 14. Half-day boundaries and attendance expectations

### 14.1 Boundary resolution

For an effective scheduled workday:

1. Use the scheduled unpaid-break boundary when present.
2. When no break exists, split scheduled work minutes equally.
3. Store the resolved boundary on the request-day revision.

The boundary is based on effective company schedule data for the leave date.

### 14.2 First-half leave

- The first half is covered by leave.
- The employee is expected to work the second half.
- Lateness is measured against the uncovered second-half start.
- Absence and undertime in the covered first half are suppressed.
- Undertime is measured only against the uncovered second-half expectation.

### 14.3 Second-half leave

- The employee is expected to work the first half.
- The second half is covered by leave.
- Lateness is measured against the original scheduled start.
- Undertime is measured only against the uncovered first-half expectation.
- Absence and undertime in the covered second half are suppressed.

### 14.4 Overtime with half-day leave

- Existing overtime detection retains the original full schedule's start and end boundaries.
- Work inside the leave-covered half is not automatically reclassified as overtime.
- Work before the original scheduled start or after the original scheduled end remains eligible for normal overtime detection.
- Work overlapping the covered half creates a leave-attendance conflict.

## 15. Attendance integration

### 15.1 Attendance statuses

Phase 6 adds finalized statuses:

```text
paid_leave
unpaid_leave
```

Existing statuses remain supported:

```text
present
absent
holiday
missing_clock_out
rest_day_worked
unscheduled_attendance
```

### 15.2 Full-day approved leave without attendance

On a scheduled workday:

```text
paid leave   → paid_leave
unpaid leave → unpaid_leave
```

Effects:

- Absence is suppressed.
- Late minutes are `null`.
- Undertime minutes are `null`.
- Normal overtime is not detected without completed attendance.
- The approved charge remains active.

### 15.3 Holiday and rest-day precedence

- A holiday consumes no leave.
- A rest day consumes no leave.
- The leave request retains a non-chargeable date record.
- Attendance remains holiday, holiday work, rest-day worked, or the applicable existing classification.
- Approved leave does not suppress holiday-work detection when completed attendance exists.

### 15.4 Completed attendance during full-day leave

When valid completed attendance exists on a chargeable full-day leave date:

1. Attendance takes precedence for worked time.
2. The active request-day revision becomes `attendance_precedence` and non-chargeable.
3. A conflict of type `full_day_completed_attendance` is created.
4. Previously charged leave units for the date are restored automatically to their original sources.
5. Attendance is calculated normally.
6. Existing overtime and holiday-work rules run normally.
7. The leave request remains approved until HR cancels or replaces it.

Completed attendance on a non-chargeable holiday, rest day, or no-schedule request date follows the existing attendance precedence without creating a leave-balance conflict because no leave units were charged.

### 15.5 Incomplete attendance during full-day leave

When a clock-in exists without a valid completed clock-out:

- Attendance remains `missing_clock_out` or the applicable incomplete state.
- A `full_day_incomplete_attendance` conflict is created.
- The approved leave charge remains active.
- No automatic balance restoration occurs.
- After attendance correction, recalculation applies the completed-attendance rule when appropriate.

### 15.6 Attendance during half-day leave

When completed attendance covers the employee's uncovered half:

- Base attendance status remains `present`.
- The active attendance result retains `0.5` day of paid or unpaid leave context.
- Lateness and undertime are measured only against the uncovered half.

When no attendance exists for the uncovered half:

- Base attendance status is `absent`.
- The active result retains the approved `0.5` leave unit for the covered half.
- Reporting records `0.5` uncovered absence unit rather than a full-day absence.
- Late and undertime minutes are `null`; the uncovered absence is represented through absence units.

When attendance is incomplete:

- Base attendance status remains `missing_clock_out`.
- The approved `0.5` leave context remains active.
- Any overlap with the covered half creates the applicable conflict.

Attendance entirely within the uncovered half:

- Is processed normally.
- Does not affect the `0.5` leave charge.
- Does not create a leave conflict.

Attendance overlapping the leave-covered half:

- Creates a `half_day_covered_time_overlap` conflict.
- Is included in actual worked-time calculations.
- Does not automatically restore the `0.5` unit.
- Requires HR to cancel or replace the leave when a balance correction is appropriate.

### 15.7 Attendance revisions after an automatic release

If a later attendance correction removes the completed-attendance condition:

- The leave recalculation attempts to restore the date's approved leave classification and recharge the required units.
- Original balance sources are preferred where still available; otherwise normal earliest-expiring consumption applies.
- When sufficient balance is unavailable, the system preserves the last internally consistent balance state and creates `insufficient_balance_after_recalculation` for HR resolution.
- No partial recharge is allowed.

## 16. Schedule and holiday recalculation

Pending and approved leave dates are re-evaluated when an effective schedule or holiday change affects them. Pending recalculation updates only append-only request-day calculation revisions and logical reservations. Approved recalculation may also post ledger reversals or charges and recalculate attendance. Unrelated attendance and overtime records retain the Phase 5 recalculation behavior.

### 16.1 Pending-request recalculation

- Schedule or holiday changes append new active request-day revisions for affected pending requests.
- Logical reservations immediately derive from the new active units.
- No ledger or attendance mutation occurs while the request remains pending.
- A pending request that becomes zero-unit or exceeds tracked balance remains pending but is marked invalid for approval until withdrawn, replaced, or made valid by another authorized change.

### 16.2 Newly added holiday or rest day

- The date becomes non-chargeable.
- Existing active charges for the date are restored to original sources.
- Attendance is recalculated using holiday or rest-day precedence.
- A new request-day revision preserves the new context.

### 16.3 Newly scheduled workday

- The date becomes chargeable leave usage under the approved request.
- For a balance-tracked type, the system attempts to charge `1.0` for full day or `0.5` for half day using normal earliest-expiring source order.
- For a balance-exempt unpaid type, the date receives unpaid-leave usage context without a ledger entry.
- If a tracked balance is insufficient, no partial ledger update occurs and an HR conflict is created.

### 16.4 Recalculation guarantees

- Original request-day revisions remain preserved.
- Changed results create new revisions.
- Unchanged results create no new revision.
- Ledger and attendance updates are atomic for the recalculated date set.
- Unsafe changes generate conflicts rather than silent partial state.

## 17. Leave-attendance conflict review

Route:

```text
/admin/leave/conflicts
```

The queue supports filters for:

- Employee
- Department
- Conflict type
- Leave type
- Date range
- Open, resolved, or superseded status

Each detail shows:

- Leave request and request-day revision
- Attendance record and calculation revision
- Effective schedule and holiday
- Balance entries and automatic releases
- Current conflict status
- Available underlying actions

Resolution occurs by correcting the underlying state, such as:

- Completing or correcting attendance
- Cancelling approved leave
- Submitting and approving a replacement request
- Creating an authorized balance adjustment
- Correcting schedule or holiday configuration
- Rerunning protected recalculation

Marking a conflict resolved does not independently alter leave, attendance, or balance data.

## 18. Employee leave workspace

Primary route:

```text
/employee/leave
```

Existing placeholder route:

```text
/leave
```

redirects to `/employee/leave` to preserve navigation compatibility.

### 18.1 Balance summary

For each eligible type, show:

- Leave type
- Paid or unpaid
- Balance-tracked or balance-exempt
- Annual allocation
- Carryover and expiration
- HR adjustments
- Approved usage
- Pending reserved units
- Current available units

Balance-exempt unpaid leave shows usage totals without an unlimited numeric balance.

### 18.2 Personal leave calendar

Employees see only their own records.

Calendar statuses:

- Draft
- Pending
- Approved
- Rejected
- Withdrawn
- Cancelled
- Superseded

Confidential notes and document details are not rendered directly in calendar cells.

### 18.3 Request history

Columns:

- Leave type
- Date range
- Duration
- Requested units
- Chargeable units
- Status
- Submitted date
- Review date
- Replacement relationship
- Available action

Actions:

```text
draft    → edit, delete
pending  → view, withdraw
approved → view
final    → view history
```

### 18.4 Request form

Routes:

```text
/employee/leave/new
/employee/leave/[requestGroupId]
/employee/leave/[requestGroupId]/edit
```

The form includes:

- Leave type
- Start and end dates
- Full-day or half-day selection
- Employee note
- Supporting-document upload
- Per-date calculation preview

The preview identifies:

- Scheduled workdays
- Rest days
- Holidays
- Dates without schedules
- Chargeable units per date
- Total requested units
- Total chargeable units
- Current available balance
- Pending reserved units
- Projected balance after approval

Half-day selection is enabled only for a one-day range.

## 19. HR leave administration

Primary route:

```text
/admin/leave
```

The workspace includes:

- Pending approval queue
- All-request table
- HR leave calendar
- Leave-attendance conflict summary
- Employee balances
- Year-opening generator
- Links to leave-type configuration

Filters:

- Employee
- Department
- Leave type
- Status
- Paid or unpaid
- Balance tracked or exempt
- Date range
- Conflict state

HR-created request route:

```text
/admin/leave/new
```

HR-created requests use the same draft and submission validation, with authorized date-window overrides.

## 20. Calendar visibility

- Employees see only their own leave.
- HR Admin and Super Admin may see all employees.
- There is no manager-specific calendar.
- There is no coworker availability view.
- Confidential reasons, notes, and attachments are never exposed on broad calendar endpoints.

## 21. Private document storage

Create a private Supabase Storage bucket:

```text
leave-documents
```

Object path:

```text
{employee_id}/{request_group_id}/{attachment_id}/{sanitized_filename}
```

Rules:

- The bucket is not public.
- The path contains no leave type, employee note, medical detail, or review reason.
- The owning employee may access documents for their own request.
- HR Admin and Super Admin may access all leave documents.
- Access uses short-lived signed URLs.
- Upload authorization requires an existing accessible draft.
- Submission freezes the object set.
- Submitted objects cannot be replaced or deleted through the client.
- Cancellation and supersession do not remove documents.
- Extension and MIME type are both validated.
- Filenames are sanitized before storage.

## 22. Authorization and RLS

### 22.1 Employee

May:

- Read own safe leave types and eligibility
- Read own balances and safe ledger history
- Create, edit, and delete own drafts
- Upload and remove own draft attachments
- Submit own drafts
- Read own submitted requests and attachments
- Withdraw own pending requests

May not:

- Read another employee's leave data
- Approve, reject, cancel, or supersede requests
- Directly post ledger entries
- Directly modify submitted revisions or request-day snapshots
- Read private HR reasons
- Manage leave types, allocations, exclusions, or adjustments

### 22.2 HR Admin and Super Admin

May:

- Read all leave requests, balances, documents, and conflicts
- Create requests for employees
- Approve and reject pending requests
- Cancel approved requests
- Create balance adjustments
- Configure leave types and versions
- Configure employee exclusions and yearly overrides
- Preview and run year-opening generation
- Run protected recalculation and resolve conflicts

### 22.3 RLS and function requirements

- Base leave tables have RLS enabled.
- Submitted immutable tables have no direct update or delete policies.
- Ledger tables have no direct insert, update, or delete policies.
- Employees receive safe projections rather than unrestricted base-table access.
- Privileged functions are `security definer` with fixed `search_path`.
- Every privileged function validates the authenticated role inside the database.
- Internal helper functions are revoked from `public`, `anon`, and `authenticated` unless explicitly exposed.
- Raw SQL errors, constraint names, and private text are never returned to the client.

## 23. Protected database functions

Required protected workflows include:

```text
create_leave_type
create_leave_type_version
archive_leave_type
create_leave_draft
update_leave_draft
delete_leave_draft
submit_leave_request
create_hr_leave_request
withdraw_leave_request
review_leave_request
cancel_approved_leave_request
create_leave_balance_adjustment
preview_leave_year_opening
generate_leave_year_opening
generate_individual_leave_allocation
recalculate_leave_request_dates
resolve_leave_attendance_conflict
```

Requirements:

- Fixed search path
- Explicit authorization
- Input normalization
- Row locking
- Expected-state checks
- Atomic pointer and status changes
- Idempotency where applicable
- Safe error codes
- Confidential input exclusion from logs and retry state

## 24. Concurrency

### 24.1 Submission

Submission locks the employee and relevant tracked balance account before calculating:

- Unexpired ledger balance
- Other pending reservations
- Overlapping pending and approved leave

This serializes competing requests for the same employee and prevents two submissions from reserving the same final units.

### 24.2 Approval

Approval locks:

- Request group
- Active request revision
- Employee
- Balance account
- Positive source ledger rows being consumed

Only one reviewer may complete the pending request.

### 24.3 Cancellation and recalculation

Cancellation and recalculation lock the affected request-day and ledger entries before creating reversals or replacement revisions.

### 24.4 Year-opening generation

Deterministic generation keys and unique constraints prevent duplicate annual or carryover entries when:

- A user retries
- Two HR users run generation concurrently
- A network request times out after the database commits

## 25. Safe error handling

Protected workflows return stable application codes.

| Code | Meaning |
|---|---|
| `LEAVE_INSUFFICIENT_BALANCE` | Tracked available balance cannot cover the request or adjustment |
| `LEAVE_OVERLAP` | Request overlaps pending or approved leave |
| `LEAVE_NO_CHARGEABLE_DAYS` | Request contains no scheduled chargeable date |
| `LEAVE_OUTSIDE_DATE_WINDOW` | Employee backdate or future limit was exceeded |
| `LEAVE_CROSSES_YEAR` | Request spans more than one leave year |
| `LEAVE_HALF_DAY_RANGE_INVALID` | Half-day request is not a single date |
| `LEAVE_DOCUMENT_REQUIRED` | Required supporting document is missing |
| `LEAVE_POLICY_INACTIVE` | No usable policy version applies |
| `LEAVE_NOT_ELIGIBLE` | Employee is excluded or lacks required tracked allocation |
| `LEAVE_REQUEST_STALE` | Request changed before the current action completed |
| `LEAVE_RECALCULATION_FAILED` | Attendance or leave recalculation could not complete safely |
| `LEAVE_ATTACHMENT_INVALID` | Attachment type, size, count, or ownership is invalid |
| `LEAVE_PERMISSION_DENIED` | Current actor lacks permission |
| `LEAVE_INVALID_STATUS` | Requested action is not allowed from the current state |
| `LEAVE_ADJUSTMENT_REASON_REQUIRED` | HR balance adjustment lacks a reason |
| `LEAVE_REJECTION_REASON_REQUIRED` | Rejection lacks a reason |
| `LEAVE_CANCELLATION_REASON_REQUIRED` | Cancellation lacks a reason |
| `LEAVE_GENERATION_CONFLICT` | Year-opening input changed or a generation operation is already applying |

The frontend maps codes to clear user messages and retains safe form input after recoverable errors.

Do not expose:

```text
SQLSTATE
constraint names
raw Supabase errors
stack traces
function source
storage internals
private notes or reasons
```

## 26. Audit integration

Reuse:

```text
employee_audit_logs
```

Entity types:

```text
leave_type
leave_request
leave_request_day
leave_balance
leave_allocation
leave_carryover
leave_conflict
```

Actions include:

```text
leave_type.created
leave_type.version_created
leave_type.archived
leave_request.created
leave_request.submitted
leave_request.approved
leave_request.rejected
leave_request.withdrawn
leave_request.cancelled
leave_request.superseded
leave_balance.allocated
leave_balance.carryover_created
leave_balance.adjusted
leave_balance.charged
leave_balance.restored
leave_day.recalculated
leave_conflict.created
leave_conflict.resolved
leave_conflict.superseded
```

Safe audit data may include:

- Employee ID
- Request group and revision IDs
- Leave type and version IDs
- Leave year
- Date range
- Numeric units
- Lifecycle state
- Ledger entry type
- Conflict type
- Actor ID and role
- Revision number

Audit JSON must exclude:

- Employee note
- Attachment path or filename
- Document contents
- Rejection reason
- Cancellation reason
- Approval note
- HR adjustment reason
- Recalculation reason
- Conflict resolution note
- Medical or other supporting-document details

## 27. Reporting integration

Phase 6 extends the Phase 5C reporting domain.

### 27.1 Leave reports

Reports include:

- Employee balance summary
- Annual allocation
- Carryover and expiration
- HR adjustments
- Approved usage
- Pending reservations
- Available balance
- Leave usage by employee
- Leave usage by department
- Leave usage by leave type
- Paid versus unpaid leave
- Upcoming approved leave
- Expiring carryover
- Requests by lifecycle status
- Open attendance conflicts

### 27.2 Attendance report changes

Attendance detail and summary sources add leave context:

```text
leave_request_group_id
leave_request_day_id
leave_type_id
leave_type_name
leave_type_version_id
leave_classification
leave_units
leave_is_paid
leave_conflict_state
covered_leave_units
uncovered_absence_units
```

Summary reporting distinguishes:

```text
paid_leave_days
unpaid_leave_days
paid_leave_units
unpaid_leave_units
half_day_uncovered_absence_units
```

### 27.3 Payroll-ready export

The existing payroll-ready CSV adds non-monetary leave fields:

- Paid leave units
- Unpaid leave units
- Leave type code
- Leave request identifier
- Leave conflict indicator

Phase 6 does not calculate salary, leave pay, or payroll amounts.

### 27.4 Reporting source rules

- Report totals derive from active request-day revisions and append-only ledger entries.
- Superseded request-day revisions do not count in current totals.
- Superseded or fully reversed ledger charges do not count as active usage.
- Confidential notes, reasons, filenames, and storage paths are excluded.
- CSV exports remain HR-only.

## 28. UI feedback states

All employee and HR workflows include:

- Loading state
- Empty state
- Inline validation
- Per-date calculation preview
- Confirmation before withdrawal, rejection, cancellation, or draft deletion
- Success feedback
- Sanitized errors
- Retry guidance
- Stale-state warning with current request reload
- Disabled duplicate-submit protection

The UI must never optimistically display an approval, ledger charge, cancellation, or balance adjustment before the protected transaction commits.

## 29. Automated testing

### 29.1 Leave-type policy tests

- Stable leave type identity
- Effective version resolution
- Future version creation
- Backdated reason requirement
- Paid type requires balance tracking
- Balance-exempt constraints
- Carryover cap validation
- Note and document policy validation
- Version immutability
- Archive through inactive version

### 29.2 Eligibility and allocation tests

- Active on January 1 eligibility
- Hire after January 1 exclusion from bulk generation
- Separated employee exclusion
- Employee leave-type exclusion
- Default allocation
- Employee override
- Manual mid-year allocation
- Idempotent year-opening generation
- Carryover cap
- Carryover expiration
- Duplicate generation concurrency

### 29.3 Draft and submission tests

- Draft edit and deletion
- Draft has no reservation
- Draft has no overlap effect
- 30-day employee backdate limit
- 365-day employee future limit
- HR date-window override
- Cross-year rejection
- Multi-day half-day rejection
- Zero-chargeable-day rejection
- Required note
- Required document threshold
- Attachment type, size, and count
- Immutable submitted revision

### 29.4 Overlap tests

- Full day conflicts with full day
- Full day conflicts with first half
- Full day conflicts with second half
- First half conflicts with first half
- Second half conflicts with second half
- First half and second half coexist
- Rejected, withdrawn, cancelled, and superseded requests do not block
- Drafts do not block

### 29.5 Balance and ledger tests

- Approval-only deduction
- Pending logical reservation
- Multiple pending requests cannot exceed balance
- No-negative-balance enforcement
- Earliest-expiring source consumption
- Multiple source consumption for one request day
- Cancellation restoration to original source
- Completed-attendance release to original source
- Positive adjustment
- Negative adjustment
- Required adjustment reason
- Expired sources excluded
- Balance-exempt leave creates no ledger charge

### 29.6 Approval lifecycle tests

- Employee cannot approve
- HR-created request remains pending
- Whole-request approval
- Whole-request rejection
- Required rejection reason
- Optional approval note
- Employee pending withdrawal
- Only HR cancellation
- Required cancellation reason
- Replacement link
- Prior request superseded only after replacement approval
- Stale review rejection

### 29.7 Attendance integration tests

- Paid full-day leave without attendance
- Unpaid full-day leave without attendance
- Holiday date remains non-chargeable
- Rest day remains non-chargeable
- Holiday work remains detectable during approved leave
- Completed full-day attendance releases charge
- Incomplete full-day attendance retains charge
- First-half leave expected-window calculation
- Second-half leave expected-window calculation
- Half-day covered-time overlap conflict without automatic release
- Overtime retains original schedule boundaries
- Attendance correction after release attempts recharge
- Insufficient recharge balance creates conflict

### 29.8 Schedule and holiday recalculation tests

- Newly added holiday releases charge
- Newly added rest day releases charge
- Newly scheduled workday charges available balance
- Insufficient balance creates conflict without partial write
- Original day revision remains
- Unchanged recalculation is a no-op
- Failed attendance recalculation rolls back ledger changes

### 29.9 Security tests

- Employee reads only own leave data
- Employee cannot read another employee's attachments
- HR role grants all-employee read
- Submitted request rows cannot be directly changed
- Ledger cannot be directly written
- Employee cannot invoke HR functions
- Signed attachment access expires
- Archived HR role loses access
- Private notes and reasons excluded from safe projections
- Audit JSON excludes confidential text
- Internal functions use fixed search paths and revoked privileges

### 29.10 End-to-end tests

1. Draft → submit → approve → ledger charge → paid-leave attendance
2. Draft → submit → withdraw
3. Draft → submit → reject
4. Approved request → HR cancellation → source restoration → attendance recalculation
5. Approved full-day leave → completed attendance → automatic release and conflict
6. Approved half-day leave → covered-time attendance → conflict with retained charge
7. Year-opening preview → generation → rerun without duplicates
8. Carryover generation → earliest-expiring consumption
9. HR-created historical request → separate approval
10. Schedule or holiday change → automatic leave and attendance recalculation
11. Replacement request approved → prior request superseded
12. Private attachment upload → submission freeze → authorized signed access

## 30. Final verification

Required commands:

```bash
npm test
npx tsc --noEmit
npm run build
```

Database verification must also confirm:

- Migration applies cleanly to the latest Phase 5C schema.
- RLS is enabled on every new leave table.
- Submitted and ledger tables have no direct mutation policies.
- Protected functions have fixed search paths.
- Internal functions are revoked appropriately.
- Storage bucket and object policies are private.
- Existing Phase 5C attendance and report tests remain passing.

## 31. Required routes

```text
/leave
/employee/leave
/employee/leave/new
/employee/leave/[requestGroupId]
/employee/leave/[requestGroupId]/edit
/admin/leave
/admin/leave/new
/admin/leave/[requestGroupId]
/admin/leave/conflicts
/admin/leave/balances
/admin/leave/year-opening
/settings/leave-types
/settings/leave-types/new
/settings/leave-types/[leaveTypeId]
/settings/leave-types/[leaveTypeId]/new-version
```

## 32. Acceptance criteria

```text
[ ] HR can create a leave type and immutable effective-dated versions
[ ] Paid leave is always balance-tracked
[ ] Unpaid leave may be balance-exempt or tracked
[ ] Active January 1 employees receive default or overridden annual allocations
[ ] Mid-year allocations require an HR-entered override
[ ] Year-opening generation is previewable and idempotent
[ ] Carryover is disabled by default and honors configured caps
[ ] Carryover expires at the end of the following calendar year
[ ] Expiring units are consumed before current-year units
[ ] Employees can create, edit, and delete drafts
[ ] Drafts do not reserve balances or block overlaps
[ ] Submitted revisions and attachments are immutable
[ ] Employee date-window limits are enforced
[ ] HR may create older or farther-future requests
[ ] Requests cannot cross calendar years
[ ] Half-day requests are single-day only
[ ] Holidays, rest days, and no-schedule dates are non-chargeable
[ ] Zero-chargeable-day requests are rejected
[ ] Pending and approved overlaps are blocked
[ ] First-half and second-half requests can coexist on the same date
[ ] Pending reservations prevent over-requesting without ledger deductions
[ ] Tracked balance is deducted only on approval
[ ] Tracked balance never becomes negative
[ ] Whole-request approval and rejection work
[ ] Rejection and cancellation reasons are required
[ ] Employees may withdraw pending requests
[ ] Only HR can cancel approved requests
[ ] Cancellation restores original balance sources
[ ] Replacements supersede prior requests only after approval
[ ] HR adjustments are append-only and require reasons
[ ] Supporting-document policies and limits are enforced
[ ] Employees see only their own leave calendar and history
[ ] HR sees all requests, balances, calendars, and conflicts
[ ] Full paid leave produces paid_leave attendance
[ ] Full unpaid leave produces unpaid_leave attendance
[ ] Holiday and rest-day precedence is preserved
[ ] Completed full-day attendance releases the leave charge and creates a conflict
[ ] Incomplete full-day attendance retains the charge and creates a conflict
[ ] Half-day covered-time attendance creates a conflict without automatic release
[ ] Schedule and holiday changes automatically recalculate approved leave
[ ] Unsafe recalculation creates an HR conflict without partial balance writes
[ ] Leave-aware reports and CSV exports exclude confidential data
[ ] Private attachment access is enforced with short-lived signed URLs
[ ] Direct ledger and submitted-request mutations are impossible
[ ] Confidential text never enters broad audit JSON or safe employee projections
[ ] Concurrency tests prevent duplicate review, allocation, and balance consumption
[ ] All existing tests remain passing
[ ] TypeScript passes
[ ] Production build passes
```
