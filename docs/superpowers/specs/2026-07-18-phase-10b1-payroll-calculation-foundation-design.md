# Phase 10B.1 — Payroll Calculation Foundation Design

**Project:** HRIS  
**Date:** 2026-07-18  
**Status:** Approved design, pending implementation planning

## 1. Purpose

Phase 10B.1 establishes a database-native payroll calculation foundation on top of Phase 10A. It covers effective-dated payroll-basis rules, controlled calculation runs, automatic employee inclusion, immutable input snapshots, daily calculation breakdowns, monthly and hourly base-pay calculations, proration, exceptions, exclusions, stale-result detection, recalculation, audit events, and payroll-period readiness checks.

It excludes premium multipliers, allowances, recurring deductions, statutory contributions, withholding tax, negative-net-pay carry-forward, 13th-month accrual, payslips, and exports.

## 2. Approved Decisions

| Area | Approved choice |
|---|---|
| Monthly salary conversion | Configurable effective-dated company payroll basis |
| Initial basis | Super Admin must explicitly select or create one |
| Presets | 261, 310, 313, 365, and custom |
| Day classification | Company calendar plus employee work schedules |
| Unpaid absence and leave | Use active payroll-basis rule |
| Source changes | Mark results stale; require explicit recalculation |
| New hires and terminations | Prorate by actual eligible dates and hours |
| Employee inclusion | Automatically evaluate eligible employees |
| Calculation location | PostgreSQL database-native engine |
| Run model | Controlled period run with independent employee processing |
| Precision | PostgreSQL `numeric`; round final lines and totals to two decimals |
| Delivery | Four staged Phase 10B subphases |

## 3. Architecture

PostgreSQL functions resolve effective-dated inputs, calculate employees, create immutable snapshots, record exceptions, and enforce readiness. Next.js handles authorized workflows, forms, progress, review, and safe error presentation.

### Calculation run lifecycle

```text
queued → running → completed | completed_with_exceptions | failed
```

### Employee entry lifecycle

```text
pending → calculated → stale → recalculated
                    ↘ exception
                    ↘ excluded
```

### Core rule

Recalculation never overwrites prior results. It creates a new immutable version linked to the previous entry.

## 4. Roles

| Role | Access |
|---|---|
| Employee | No Phase 10B.1 calculation access |
| Manager | No payroll calculation or compensation access |
| HR Admin | Start runs, inspect results, resolve warnings, exclude employees, reverse exclusions, recalculate |
| Super Admin | HR permissions plus approve payroll-basis rules and ignore blockers with reason |

All access must be enforced server-side and through RLS.

## 5. Data Model

### 5.1 `payroll_basis_rules`

Fields include organization, rule name, annual divisor, standard hours per day, rounding mode, effective dates, status, change reason, submitter, approver, timestamps, and rejection data.

Rules:

- Only approved rules may calculate payroll.
- Approved ranges cannot overlap.
- Approved rules are immutable.
- Calculations store the exact rule ID and divisor.
- No preset activates automatically.

### 5.2 `payroll_calculation_runs`

Fields include payroll period, idempotency key, status, initiator, timestamps, employee counters, and safe error fields.

Rules:

- Unique idempotency key.
- One active run per payroll period.
- Approved or locked periods reject runs.
- Completed runs are immutable except controlled summary updates.

### 5.3 `payroll_employee_entries`

Versioned employee results with:

- Period, employee, run, version, and previous entry
- Compensation type and currency
- Employment and eligibility ranges
- Salary/rate and basis values
- Eligible/payable minutes
- Raw and rounded earnings and deductions
- Overtime input
- Paid and unpaid leave impact
- Raw and rounded gross pay
- Stale state and reason
- Calculation timestamp

Rules:

- Append-only versions.
- Unique version number per employee and period.
- Money uses `numeric`.
- Locked periods reject new versions.

### 5.4 `payroll_entry_input_snapshots`

Immutable source snapshots containing source type, table, record ID, updated timestamp, effective date, calculation-relevant JSON, hash, and creation time.

Supported sources:

```text
employment
compensation
schedule_assignment
work_schedule
attendance
leave
overtime
payroll_basis_rule
holiday
```

### 5.5 `payroll_entry_daily_breakdowns`

One row per calendar date containing eligibility, schedule, attendance, leave, absence, late, undertime, overtime input, compensation and basis references, rates, earnings, deductions, and calculation details.

### 5.6 `payroll_entry_exceptions`

Stores warning or blocking exceptions, source references, status, resolution note, resolver, and timestamps.

Example codes:

```text
MISSING_COMPENSATION
MISSING_SCHEDULE_ASSIGNMENT
OVERLAPPING_COMPENSATION
INCOMPLETE_ATTENDANCE
UNAPPROVED_OVERTIME
CONFLICTING_LEAVE
MISSING_PAYROLL_BASIS
SOURCE_CHANGED
```

Ignoring a blocker requires Super Admin authorization and a reason.

### 5.7 `payroll_employee_exclusions`

Stores exclusion reason, actor, timestamps, reversal actor, reversal reason, and reversal timestamp. Original records are never deleted.

### 5.8 `payroll_calculation_events`

Immutable events for run starts, inclusion, exclusion, calculation success/failure, stale marking, recalculation, and exception actions.

## 6. Calculation Rules

### 6.1 Run start

HR may start a run only for an `open` period. The system validates:

- No active run exists.
- Period is not approved or locked.
- An approved basis applies.
- Payroll schedule is active.
- Idempotency key is unique.

Repeated requests with the same key return the existing run.

### 6.2 Employee inclusion

Eligible employees must have:

- Employment overlap with the period
- Approved payroll schedule assignment
- Approved compensation covering at least one eligible date
- No active exclusion

Each employee receives a visible `calculated`, `exception`, or `excluded` outcome.

### 6.3 Daily segmentation

For each date, resolve employment eligibility, compensation, basis rule, work schedule, scheduled minutes, attendance, paid leave, unpaid leave, approved overtime, absence, late, and undertime.

### 6.4 Monthly employee formulas

```text
daily rate = monthly salary × 12 ÷ annual divisor
hourly rate = daily rate ÷ standard hours per day
minute rate = hourly rate ÷ 60
```

The engine must avoid double-prorating full-period monthly employees and preserve raw and rounded values.

### 6.5 Hourly employee formula

```text
regular earnings = payable regular minutes × hourly rate ÷ 60
```

Unpaid minutes reduce payable minutes and must not also create duplicate deductions.

### 6.6 Proration

- Exclude dates before hire.
- Exclude dates after termination.
- Create a blocker for uncovered eligible dates.
- Store exact included and excluded dates.

### 6.7 Attendance deductions for monthly employees

```text
absence deduction = absence minutes × minute rate
late deduction = late minutes × minute rate
undertime deduction = undertime minutes × minute rate
```

Grace periods and rounding rules are deferred to Phase 10B.2.

### 6.8 Leave

Paid leave preserves payable scheduled minutes. Unpaid leave removes payable minutes and creates a deduction for monthly employees. Conflicting or unapproved leave creates an exception.

### 6.9 Overtime

Phase 10B.1 snapshots approved overtime minutes but does not calculate overtime premiums, rest-day premiums, holiday premiums, or night differential.

### 6.10 Failure isolation

One employee failure must not roll back successful employee calculations. Runs with blockers end as `completed_with_exceptions`.

### 6.11 Stale detection

Changes to attendance, leave, overtime, compensation, employment dates, schedule assignment, work schedule, or basis rule may mark the current entry stale.

Locked periods are never automatically marked stale or recalculated.

### 6.12 Recalculation

Recalculation creates the next version, links `previous_entry_id`, rebuilds snapshots and daily rows, preserves the old version, and writes audit events.

### 6.13 Period readiness

A period may move from `open` to `under_review` only when:

- No active run exists
- Every eligible employee has a current calculated entry or approved exclusion
- No unresolved blocking exception remains
- No current entry is stale

The database transition function enforces readiness.

## 7. Controlled RPCs

Required `SECURITY DEFINER` functions:

```text
submit_payroll_basis_rule
approve_payroll_basis_rule
reject_payroll_basis_rule
start_payroll_calculation_run
calculate_payroll_employee
recalculate_payroll_employee
exclude_employee_from_payroll
reverse_payroll_exclusion
resolve_payroll_exception
ignore_blocking_payroll_exception
check_payroll_period_readiness
```

Each function must use a restricted `search_path`, validate role and period state, lock affected rows, enforce idempotency, write audit events, return safe errors, and reject locked-period changes.

## 8. User Interface

### Routes

```text
/payroll/periods/[periodId]/workspace
/payroll/periods/[periodId]/employees/[employeeId]
/payroll/periods/[periodId]/exceptions
/payroll/settings/basis-rules
```

### Workspace

Shows period details, latest run, eligibility and result counters, stale and exception counts, readiness, employee rows, filters, and actions for calculation, recalculation, exception review, and review submission.

### Employee detail

Shows summary, daily breakdown, source snapshots, and calculation version history.

### Exception queue

Supports filtering, source navigation, warning resolution, recalculation, and Super Admin blocker override with a required reason.

### Responsive behavior

Desktop uses tables and side-by-side panels. Mobile uses stacked cards, filter drawers, collapsible daily breakdowns, compact totals, and full-width actions.

## 9. Reliability

Use:

- PostgreSQL `numeric`
- Partial unique indexes
- Advisory locks per period
- Row locks per employee and period
- Unique idempotency keys
- Optimistic version checks
- Append-only snapshots and events

Prevent:

- Concurrent active runs
- Duplicate versions
- Concurrent recalculation
- Snapshot modification
- Review while a run is active
- Recalculation after approval or locking

## 10. Safe Errors

Examples:

```text
Another calculation run is already active for this payroll period.
No approved payroll-basis rule applies to one or more eligible dates.
This employee’s source data changed and requires recalculation.
The employee has overlapping approved compensation records.
This payroll period is locked and cannot be recalculated.
One or more employees have unresolved blocking exceptions.
```

Raw SQL, stack traces, and sensitive payroll values must not reach the browser.

## 11. Notifications

Notification events may cover run completion, completed-with-exceptions, blockers, stale entries, readiness, exclusions, and reversals. Notification payloads must not include payroll amounts.

## 12. Testing

Database and calculation tests must cover:

- 261, 310, 313, and 365 divisors
- Monthly and hourly employees
- Full-period monthly employee without double-proration
- New hire and termination
- Mid-period compensation and basis changes
- Paid and unpaid leave
- Absence, late, and undertime
- Hourly double-deduction prevention
- Overtime snapshots
- Missing and conflicting data exceptions
- Exclusion and reversal
- Idempotent runs
- Employee failure isolation
- Recalculation versioning
- Stale detection
- Locked-period protection
- Readiness validation
- RLS and immutability

Application tests must cover route authorization, controls by role and period status, filters, detail pages, exception actions, exclusion reasons, basis approval, redaction, and mobile behavior.

All Phase 1–10A regression tests must remain passing.

## 13. Rollout

Use forward-only Supabase migrations in this order:

1. Payroll-basis rules
2. Basis approval workflow
3. Calculation runs
4. Employee entries
5. Daily breakdowns
6. Input snapshots
7. Exceptions
8. Exclusions
9. Events
10. Constraints and indexes
11. RLS
12. Basis RPCs
13. Calculation RPCs
14. Recalculation RPCs
15. Stale detection
16. Readiness integration
17. Notification integration
18. Workspace UI
19. Employee detail UI
20. Exception UI
21. Automated tests
22. Post-migration verification SQL

## 14. Initial Setup

The migration must not activate any basis rule automatically. Super Admin must approve a preset or custom rule before the first calculation run. Existing periods remain unchanged, and no payroll calculations run automatically.

## 15. Phase Boundary

Included:

- Basis rules
- Calculation runs
- Automatic inclusion
- Versioned entries
- Immutable snapshots
- Daily breakdowns
- Monthly and hourly base pay
- Attendance deductions
- Leave treatment
- Overtime inputs
- Proration
- Exceptions
- Exclusions
- Stale detection
- Recalculation
- Readiness checks
- Audit events
- Workspace UI

Deferred:

- Overtime premiums
- Rest-day and holiday premiums
- Night differential
- Attendance grace and rounding rules
- Allowances and recurring deductions
- Manual adjustments
- SSS, PhilHealth, Pag-IBIG, and withholding tax
- Deduction priority and carry-forward
- 13th-month accrual
- Payslips and exports

## 16. Acceptance Criteria

Phase 10B.1 is complete when:

1. Super Admin can approve an effective-dated payroll-basis rule.
2. HR can start an idempotent run for an open period.
3. Eligible employees are automatically evaluated.
4. Missing or conflicting inputs produce visible exceptions.
5. Monthly and hourly base pay calculate correctly.
6. Full-period monthly employees are not double-prorated.
7. New hires and terminated employees are prorated correctly.
8. Attendance, leave, and overtime inputs are snapshotted.
9. Daily rows explain each result.
10. Employee failures do not discard successful calculations.
11. Source changes mark current entries stale.
12. Recalculation creates a new immutable version.
13. Exclusions require reasons and remain auditable.
14. Blocking exceptions prevent review.
15. Locked periods reject recalculation.
16. Employees and managers cannot access calculation data.
17. Existing tests pass.
18. TypeScript validation passes.
19. Production build passes.
