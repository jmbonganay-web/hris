# Phase 10A — Payroll Foundation Design

**Project:** HRIS  
**Date:** 2026-07-18  
**Status:** Approved design, pending implementation plan

## 1. Purpose

Phase 10A establishes the secure payroll foundation that later phases will use for payroll calculations, review, export, and payslips.

This phase provides:

- Configurable payroll schedules
- Automatically generated payroll periods
- Effective-dated employee compensation
- Effective-dated payroll schedule assignments
- Approval workflows
- Immutable audit history
- Role-based access controls
- In-app notification integration

Phase 10A does not calculate gross pay, deductions, taxes, statutory contributions, or payslips.

## 2. Approved Product Decisions

| Decision | Approved choice |
|---|---|
| Compensation types | Monthly salary and hourly rate |
| Payroll schedules | Weekly, biweekly, semi-monthly, and monthly |
| Compensation approval | HR Admin submits; Super Admin approves |
| Payroll period creation | Automatically generated |
| Currency | One configurable company currency, initially PHP |
| Employee visibility | Current effective approved compensation only |
| Backdated compensation | Allowed with Super Admin approval and audit warning |
| Manager visibility | No compensation access |
| Payroll period lifecycle | Draft → Open → Under Review → Approved → Locked |
| Reopening locked periods | Super Admin only, with mandatory reason |
| Schedule changes | Effective from the next payroll period by default |
| Compensation scope | Base compensation only |
| Generation horizon | Rolling 12 months |
| Weekend/holiday adjustment | Previous business day |
| Period codes | Automatically generated human-readable codes |
| Architecture | Effective-dated relational model |

## 3. Architecture

Phase 10A uses an effective-dated relational design with explicit approval workflows.

### 3.1 Core modules

1. **Payroll schedules**
   - Weekly
   - Biweekly
   - Semi-monthly
   - Monthly
   - Organization currency
   - Business-day adjustment
   - Rolling 12-month period generation

2. **Payroll periods**
   - Generated from payroll schedules
   - Human-readable period codes
   - Explicit lifecycle transitions
   - Controlled reopening

3. **Employee compensation**
   - Monthly salary or hourly rate
   - Standard hours per day and week
   - Effective-dated history
   - HR submission and Super Admin approval

4. **Payroll schedule assignments**
   - Effective-dated employee-to-schedule assignments
   - Approval workflow
   - Mid-period override protection

5. **Audit trail**
   - Creation
   - Submission
   - Approval
   - Rejection
   - Activation
   - Supersession
   - Period opening
   - Review
   - Approval
   - Locking
   - Reopening

### 3.2 Key architectural rule

Approved or locked payroll results introduced in Phase 10B must never be silently rewritten by later compensation changes.

## 4. Roles and Permissions

| Role | Compensation access | Payroll period access |
|---|---|---|
| Employee | Read own current effective approved compensation and current schedule | Personal published payroll information in later phases |
| Manager | No compensation access | No payroll administration access |
| HR Admin | Create and edit drafts, submit compensation and assignment requests | Manage Draft, Open, and Under Review periods |
| Super Admin | Approve or reject compensation and assignments | Approve, lock, and reopen periods |

Additional access rules:

- Employees cannot read draft, rejected, historical, or future compensation records.
- Managers cannot read compensation amounts.
- Approved compensation records are immutable.
- Audit events cannot be edited or deleted by application roles.
- Sensitive compensation values must not appear in generic notifications, URLs, or unrestricted views.

## 5. Data Model

### 5.1 `payroll_schedules`

Stores payroll schedule configuration.

Suggested fields:

- `id`
- `organization_id`
- `name`
- `schedule_type`
- `currency_code`
- `timezone`
- `week_start_day`
- `payment_offset_days`
- `business_day_adjustment`
- `generation_horizon_months`
- `is_active`
- `created_by`
- `created_at`
- `updated_at`

Supported `schedule_type` values:

- `weekly`
- `biweekly`
- `semi_monthly`
- `monthly`

Semi-monthly schedules must support two period rules, such as:

- First period: 1st–15th
- Second period: 16th–last day

### 5.2 `payroll_periods`

Stores generated payroll periods.

Suggested fields:

- `id`
- `payroll_schedule_id`
- `period_code`
- `period_sequence`
- `period_start`
- `period_end`
- `cutoff_date`
- `payment_date`
- `original_payment_date`
- `status`
- `opened_at`
- `submitted_for_review_at`
- `approved_at`
- `locked_at`
- `reopened_at`
- `created_at`
- `updated_at`

Unique constraint:

- `payroll_schedule_id`
- `period_start`
- `period_end`

Statuses:

- `draft`
- `open`
- `under_review`
- `approved`
- `locked`

A reopened locked period returns to `under_review`.

### 5.3 `employee_compensation_records`

Stores effective-dated salary and hourly-rate history.

Suggested fields:

- `id`
- `employee_id`
- `compensation_type`
- `monthly_salary`
- `hourly_rate`
- `currency_code`
- `standard_hours_per_day`
- `standard_hours_per_week`
- `effective_from`
- `effective_to`
- `status`
- `change_reason`
- `is_backdated`
- `submitted_by`
- `submitted_at`
- `approved_by`
- `approved_at`
- `rejected_by`
- `rejected_at`
- `rejection_reason`
- `created_at`
- `updated_at`

Compensation types:

- `monthly`
- `hourly`

Statuses:

- `draft`
- `pending_approval`
- `approved`
- `rejected`
- `superseded`
- `cancelled`

A record is currently effective when:

- `status = approved`
- `effective_from <= current_date`
- `effective_to is null or effective_to >= current_date`

Business rules:

- Monthly records require `monthly_salary`.
- Hourly records require `hourly_rate`.
- The unused rate field must be null.
- Compensation must be greater than zero.
- Approved records cannot be edited.
- Approved effective-date ranges cannot overlap.
- Approving a new record closes the preceding approved record on the day before the new effective date.

### 5.4 `employee_payroll_schedule_assignments`

Stores effective-dated employee-to-schedule assignments.

Suggested fields:

- `id`
- `employee_id`
- `payroll_schedule_id`
- `effective_from`
- `effective_to`
- `status`
- `change_reason`
- `override_mid_period`
- `override_reason`
- `submitted_by`
- `submitted_at`
- `approved_by`
- `approved_at`
- `rejected_by`
- `rejected_at`
- `rejection_reason`
- `created_at`
- `updated_at`

Rules:

- Default effective date aligns with the next payroll period.
- Mid-period assignment changes require explicit Super Admin override.
- Approved assignment ranges cannot overlap.
- Approved historical assignments remain immutable.

### 5.5 `payroll_period_events`

Stores immutable payroll-period events.

Suggested fields:

- `id`
- `payroll_period_id`
- `event_type`
- `from_status`
- `to_status`
- `actor_user_id`
- `reason`
- `metadata`
- `created_at`

Event examples:

- `generated`
- `opened`
- `submitted_for_review`
- `returned_to_open`
- `approved`
- `locked`
- `reopened`
- `date_adjusted`

### 5.6 `compensation_events`

Stores immutable compensation and assignment events.

Suggested fields:

- `id`
- `employee_id`
- `compensation_record_id`
- `schedule_assignment_id`
- `event_type`
- `actor_user_id`
- `reason`
- `previous_values`
- `new_values`
- `created_at`

### 5.7 Organization payroll settings

Add or extend organization settings with:

- `default_currency_code = PHP`
- `payroll_timezone = Asia/Manila`
- `payroll_period_generation_enabled = true`
- `payroll_period_generation_months = 12`

Currency is copied into each compensation record at creation time to preserve historical accuracy.

## 6. Workflows

### 6.1 Compensation change workflow

1. HR Admin creates a draft.
2. HR selects:
   - Monthly or hourly compensation
   - Amount
   - Effective date
   - Standard hours
   - Change reason
3. HR submits for approval.
4. System validates amount, type, overlap, backdating, and affected periods.
5. Super Admin approves or rejects.
6. Rejection requires a reason.
7. Approval:
   - Marks the record approved
   - Closes the preceding approved record
   - Writes immutable audit events
   - Preserves locked payroll periods
   - Triggers employee notification when the record becomes effective

Draft and rejected records remain editable by HR. Approved and superseded records are immutable.

### 6.2 Payroll schedule assignment workflow

1. HR selects an employee and payroll schedule.
2. System suggests the start of the next payroll period.
3. HR selects an effective date and submits.
4. System checks overlap and mid-period conflicts.
5. Super Admin approves or rejects.
6. Approval closes the previous assignment immediately before the new assignment begins.

### 6.3 Payroll period generation

A daily database job ensures that every active payroll schedule has periods generated through a rolling 12-month horizon.

For each period:

1. Calculate nominal period start and end.
2. Calculate cutoff and payment dates.
3. Move weekend or configured company-holiday dates to the previous business day.
4. Generate a unique period code.
5. Insert the period in `draft`.
6. Write a `generated` event.

Generation must be idempotent.

### 6.4 Payroll period transitions

Allowed transitions:

- `draft → open`
- `open → under_review`
- `under_review → open`
- `under_review → approved`
- `approved → locked`
- `locked → under_review`

Permissions:

- HR Admin may open a draft.
- HR Admin may submit an open period for review.
- HR Admin may return an under-review period to open.
- Super Admin may approve, lock, and reopen.
- Reopening requires a reason.
- Invalid transitions are rejected by database functions.

### 6.5 Backdated compensation

When a compensation record is approved with an effective date in the past:

- Mark it as backdated.
- Require a documented reason.
- Show potentially affected payroll periods.
- Do not alter locked periods.
- Flag open and under-review periods for recalculation in Phase 10B.
- Write an audit event.

## 7. Notifications

Integrate with Phase 9 notifications for:

- Compensation approval requests
- Compensation approvals
- Compensation rejections
- Payroll schedule assignment requests
- Payroll schedule assignment approvals
- Payroll schedule assignment rejections
- Payroll periods ready to open
- Payroll periods awaiting HR review
- Payroll periods awaiting Super Admin approval
- Locked-period reopen events

Notification payloads must not include compensation amounts.

## 8. User Interface

### 8.1 Payroll overview

Route:

- `/payroll`

HR Admin sees:

- Active schedules
- Upcoming draft periods
- Periods requiring review
- Pending compensation requests
- Employees missing compensation
- Employees missing schedule assignments

Super Admin sees:

- Pending approvals
- Periods awaiting approval or locking
- Backdated compensation warnings
- Recently reopened periods

Employee sees:

- Current approved compensation
- Current payroll schedule
- Next expected pay date

Managers do not receive payroll access.

### 8.2 Payroll schedules

Routes:

- `/payroll/schedules`
- `/payroll/schedules/new`
- `/payroll/schedules/[scheduleId]`

Capabilities:

- Create weekly, biweekly, semi-monthly, or monthly schedules
- Configure cutoff and payment rules
- Set timezone
- Use previous-business-day adjustment
- Activate or deactivate schedules
- Preview upcoming generated periods
- Prevent deactivation while employees have active assignments unless reassigned

### 8.3 Payroll periods

Routes:

- `/payroll/periods`
- `/payroll/periods/[periodId]`

Filters:

- Schedule
- Status
- Year
- Date range

Detail page:

- Period code
- Period dates
- Cutoff date
- Payment date
- Current status
- Schedule information
- Allowed transition controls
- Adjustment history
- Audit timeline

Phase 10A does not display payroll calculations.

### 8.4 Employee compensation

Routes:

- `/employees/[employeeId]/compensation`
- `/employees/[employeeId]/compensation/new`
- `/employees/[employeeId]/compensation/[recordId]`
- `/me/compensation`

Authorized HR and Super Admin views include:

- Current approved compensation
- Payroll schedule assignment
- Future approved changes
- Draft and pending changes
- Historical approved records
- Audit history

Employee view includes only:

- Current effective approved compensation
- Current payroll schedule

### 8.5 Approval inbox

Route:

- `/payroll/approvals`

Queues:

- Compensation changes
- Payroll schedule assignments

Each item shows:

- Employee
- Current value
- Proposed value
- Effective date
- Change reason
- Backdated warning
- Potentially affected periods
- Approve action
- Reject action with required reason

Backdated approval requires an additional confirmation.

### 8.6 Responsive behavior

Desktop:

- Tables
- Side-by-side detail panels
- Audit timelines

Mobile:

- Stacked cards
- Filter drawers
- Compact status badges
- Full-width actions
- Timeline cards

## 9. Security

### 9.1 Row Level Security

RLS is the primary access boundary.

Required policies:

- Employee can read only own current effective approved compensation.
- Employee can read only own current effective schedule assignment.
- Manager has no compensation access.
- HR Admin can create and edit drafts and submit requests.
- Super Admin can approve and reject requests.
- HR Admin can manage non-final payroll periods.
- Super Admin can approve, lock, and reopen periods.
- Audit tables are append-only through controlled functions.

### 9.2 Controlled database functions

Use `SECURITY DEFINER` functions for:

- Submit compensation
- Approve compensation
- Reject compensation
- Submit schedule assignment
- Approve schedule assignment
- Reject schedule assignment
- Generate payroll periods
- Transition payroll period
- Reopen payroll period

Functions must:

- Set a restricted `search_path`
- Validate actor role
- Use transactions
- Lock affected rows
- Return safe error codes
- Avoid exposing internal details
- Write immutable audit events

## 10. Reliability

High-impact actions must be atomic:

- Compensation approval and predecessor closure
- Assignment approval and predecessor closure
- Payroll period generation
- Period transitions
- Locked-period reopening

Concurrency protections:

- Unique constraints
- Effective-date overlap checks
- Advisory locks for schedule generation
- Row locks for approval and transition functions
- Idempotency keys for repeated requests

Example safe errors:

- `A compensation record already applies during this date range.`
- `This payroll schedule change begins inside an active period.`
- `The payroll period status changed while you were reviewing it.`
- `A locked payroll period cannot be modified.`

## 11. Testing

### 11.1 Database tests

- RLS for Employee, Manager, HR Admin, and Super Admin
- Compensation amount and type constraints
- Effective-date overlap prevention
- Compensation approval and rejection
- Previous compensation closure
- Backdated compensation handling
- Schedule assignment overlap prevention
- Mid-period override validation
- Period generation for all schedule types
- Leap-year behavior
- Month-end behavior
- Weekend and holiday adjustment
- Duplicate generation prevention
- Period transition validation
- Locked-period reopening
- Audit event creation
- Notification event creation without sensitive values

### 11.2 Application tests

- Payroll route authorization
- Compensation form validation
- Approval inbox behavior
- Period action visibility
- Employee read-only compensation view
- Sensitive-data redaction
- Responsive rendering

### 11.3 Regression testing

All existing tests for:

- Attendance
- Leave
- Overtime
- Documents
- Dashboard analytics
- Notifications

must continue passing.

## 12. Migration and Rollout

Use forward-only Supabase migrations.

Recommended order:

1. Payroll settings and enums
2. Payroll schedules
3. Payroll periods
4. Compensation records
5. Schedule assignments
6. Audit tables
7. Constraints and indexes
8. RLS policies
9. Approval functions
10. Period-transition functions
11. Period-generation functions
12. Cron registration
13. Notification-rule integration
14. Application routes and UI
15. Verification SQL
16. Automated tests

The initial migration may create one default PHP payroll schedule only when no schedule exists.

It must not:

- Automatically assign employees
- Automatically create compensation records
- Modify existing attendance, leave, overtime, document, dashboard, or notification data

## 13. Phase Boundary

### Included in Phase 10A

- Payroll schedules
- Payroll periods
- Compensation profiles
- Payroll schedule assignments
- Approval workflows
- Audit history
- RLS and controlled functions
- Period generation
- Notifications
- Administrative views
- Employee read-only view

### Excluded from Phase 10A

- Gross-pay calculations
- Attendance-to-payroll conversion
- Overtime-rate calculations
- Allowances
- Bonuses
- Deductions
- Taxes
- Statutory contributions
- Payslips
- Bank-payment files
- Payroll export files

These belong to Phases 10B and 10C.

## 14. Acceptance Criteria

Phase 10A is complete when:

1. HR can create and submit compensation drafts.
2. Super Admin can approve or reject compensation requests.
3. Approved compensation history is immutable and non-overlapping.
4. HR can submit payroll schedule assignments.
5. Super Admin can approve or reject assignments.
6. Payroll periods generate correctly for all four schedule types.
7. Period generation is idempotent.
8. Business-day adjustment works for weekends and configured holidays.
9. Payroll period transitions enforce role and state rules.
10. Locked periods require a Super Admin reason to reopen.
11. Employees can see only their own current approved compensation.
12. Managers cannot access compensation data.
13. Audit events are written for every controlled action.
14. Notification events contain no compensation amounts.
15. Existing regression tests pass.
16. TypeScript validation and production build pass.
