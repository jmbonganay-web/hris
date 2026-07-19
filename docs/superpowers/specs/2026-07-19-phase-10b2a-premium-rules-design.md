# Phase 10B.2A — Premium Rules Design

**Project:** HRIS  
**Date:** 2026-07-19  
**Status:** Approved design, pending implementation planning

## 1. Purpose

Phase 10B.2A extends the Phase 10B.1 payroll engine with effective-dated premium rules and immutable premium calculation snapshots.

Included:
- Overtime, rest-day, holiday, combined-day, and night-differential premiums
- Premium-time rounding
- Late and undertime grace rules
- Company-default and employee-group overrides
- Approval workflows and legal-source metadata
- Stale detection, controlled recalculation, workspace integration, and audit history

Deferred:
- Earning and deduction components
- Restricted formulas
- Recurring assignments
- One-time adjustments and prior-period corrections
- Statutory deductions, 13th-month accrual, payslips, and exports

## 2. Approved Decisions

| Area | Choice |
|---|---|
| Premium storage | Separate base earnings and incremental premium lines |
| Rule assignment | Company default with effective-dated group overrides |
| Combined days | Explicit combined day types |
| Overtime basis | Effective hourly rate from compensation and payroll basis |
| Night differential | Applied to the applicable premium hourly base |
| Time rounding | Effective-dated premium-time rules |
| Grace treatment | Deduct only minutes beyond grace |
| Presets | Inactive Philippine presets requiring Super Admin review |
| Legal basis | Source metadata required for each approved version |
| Rule changes | Mark affected entries stale; explicit recalculation |
| Delivery | Phase 10B.2A, 10B.2B, and 10B.2C |

## 3. Architecture

### Core modules

1. **Premium rule sets**
   - Company default
   - Employment type, department, position, or payroll-group overrides
   - Effective dates, approval status, and source metadata

2. **Day-type resolution**
   - Regular workday
   - Rest day
   - Special non-working day
   - Regular holiday
   - Special day plus rest day
   - Regular holiday plus rest day
   - Double regular holiday
   - Double regular holiday plus rest day

3. **Premium calculations**
   - Ordinary overtime
   - Rest-day work
   - Holiday work
   - Combined holiday/rest-day work
   - Night differential

4. **Time qualification**
   - Raw approved minutes
   - Rounding mode and increment
   - Night window
   - Grace periods
   - Raw, adjusted, and payable minutes

5. **Calculation integration**
   - Phase 10B.1 daily rows remain the base input
   - New immutable day-type resolutions and premium lines are added
   - Rule changes mark affected open or under-review entries stale
   - Approved and locked periods remain unchanged

### Calculation sequence

```text
Resolve employee and date
→ Resolve day type
→ Resolve rule set and version
→ Resolve base hourly rate
→ Apply time rounding
→ Calculate day and overtime premiums
→ Calculate night differential
→ Store immutable premium lines
→ Update revised gross pay
```

### Core accounting rule

When ordinary base pay is already present, only the incremental premium is added. Overtime outside ordinary payable time stores the full overtime amount. Night differential is always a separate line.

## 4. Roles

| Role | Access |
|---|---|
| Employee | No premium administration or premium workspace access |
| Manager | No premium administration or payroll-premium access |
| HR Admin | Create and submit drafts, review results, recalculate affected entries |
| Super Admin | Approve/reject rules, resolve conflicts, activate versions, ignore blockers with reason |

All access is enforced server-side and through RLS.

## 5. Data Model

### `premium_rule_sets`

Fields include identity, organization, scope, optional scope target, effective dates, status, change reason, legal-source metadata, submitter, approver, rejection data, and timestamps.

Supported scopes:

```text
company_default
employment_type
department
position
payroll_group
```

Rules:
- A company default is required before premium calculations can complete.
- Approved ranges cannot overlap for the same scope.
- Approved records are immutable.
- More specific scopes override broader scopes.
- Equally specific conflicts create a blocking exception.

### `premium_rule_versions`

Stores:

- Day type
- Regular-time multiplier
- Overtime multiplier
- Additional-premium-only flag
- Night-differential percentage
- Night window
- Overtime rounding
- Night rounding
- Effective dates and status

All money and multipliers use PostgreSQL `numeric`.

### `attendance_deduction_rules`

Stores separate late and undertime:

- Grace minutes
- Rounding mode
- Rounding increment
- Scope
- Effective dates
- Approval status

This phase requires excess-only deduction beyond grace.

### `payroll_day_type_resolutions`

One immutable row per employee-entry date containing:

- Base day type
- Rest-day status
- Holiday source and type
- Combined day type
- Selected rule set and version
- Resolution details

### `payroll_premium_lines`

Immutable lines containing:

- Entry and daily-row references
- Work date
- Premium type and day type
- Rule set and version
- Base hourly rate
- Raw and rounded minutes
- Multipliers
- Night percentage
- Raw and rounded amounts
- Additional-only flag
- Calculation details

Supported premium types include rest day, holiday combinations, overtime combinations, and night differential.

### Event tables

- `premium_rule_events`
- `premium_calculation_events`

Both are append-only.

### Payroll-entry extensions

Add:

```text
premium_earnings_raw
premium_earnings_rounded
night_differential_raw
night_differential_rounded
revised_gross_pay_raw
revised_gross_pay_rounded
```

Phase 10B.1 base totals remain unchanged.

## 6. Rule Resolution

Specificity order:

```text
payroll_group
→ position
→ department
→ employment_type
→ company_default
```

Rules:
- One approved rule wins at each specificity.
- Same-level conflicts create `CONFLICTING_PREMIUM_RULE`.
- Missing company default creates `MISSING_COMPANY_DEFAULT_PREMIUM_RULE`.
- The applied rule set and version are snapshotted.

## 7. Calculations

### Incremental ordinary-time premium

```text
additional premium
= base hourly rate
× eligible hours
× (configured multiplier − 1)
```

The snapshot stores the full multiplier, base portion, incremental multiplier, raw amount, and rounded amount.

### Overtime

Resolve base hourly rate, day type, day multiplier, overtime multiplier, approved minutes, and rounding rule. Preserve raw and rounded minutes.

### Night differential

- Night windows may cross midnight.
- Shifts are split by actual overlap.
- Raw night minutes are determined before rounding.
- The applicable premium hourly base is used.
- Night differential remains separate from overtime and holiday lines.

### Rounding

Supported modes:

```text
exact_minutes
round_down
round_up
nearest_increment
```

Overtime and night-differential settings are independent.

### Grace deductions

```text
deductible minutes = max(raw minutes − grace minutes, 0)
```

Late and undertime remain separate.

## 8. Exceptions

New blocking codes:

```text
MISSING_PREMIUM_RULE
CONFLICTING_PREMIUM_RULE
MISSING_COMPANY_DEFAULT_PREMIUM_RULE
INVALID_DAY_TYPE_RESOLUTION
MISSING_HOLIDAY_CONFIGURATION
INVALID_NIGHT_WINDOW
PREMIUM_INPUT_CHANGED
```

Blocking premium exceptions prevent period review.

## 9. Approval Workflows

### Premium rules

```text
draft → pending_approval → approved | rejected
```

HR creates and submits. Super Admin approves or rejects.

Approval validates:
- Effective-date overlaps
- Same-scope conflicts
- Complete day-type coverage
- Positive multipliers
- Valid night window
- Valid rounding increments
- Required legal-source metadata

### Attendance deduction rules

Use the same workflow. Approval validates non-negative grace periods, valid increments, non-overlapping dates, no scope conflicts, and excess-only deduction.

## 10. Controlled RPCs

Required protected functions:

```text
create_premium_rule_set
submit_premium_rule_set
approve_premium_rule_set
reject_premium_rule_set
create_attendance_deduction_rule
submit_attendance_deduction_rule
approve_attendance_deduction_rule
reject_attendance_deduction_rule
resolve_employee_day_type
resolve_employee_premium_rule
calculate_employee_premiums
recalculate_employee_premiums
preview_premium_rule_coverage
check_premium_readiness
```

Each must use `SECURITY DEFINER`, a restricted `search_path`, role validation, row locking, overlap validation, immutable events, safe errors, and locked-period protection.

## 11. User Interface

Routes:

```text
/payroll/settings/premium-rules
/payroll/settings/premium-rules/new
/payroll/settings/premium-rules/[ruleSetId]
/payroll/settings/attendance-deduction-rules
/payroll/approvals/premium-rules
```

Existing pages extended:

```text
/payroll/periods/[periodId]/workspace
/payroll/periods/[periodId]/employees/[employeeId]
/payroll/periods/[periodId]/exceptions
```

Features:
- Rule matrix editor
- Legal-source fields
- Approval queues
- Coverage preview
- Premium totals and statuses
- Employee premium lines
- Day-type resolution details
- Premium exception filters
- Responsive card layouts on mobile

## 12. Reliability

Prevent:
- Multiple active company defaults for the same date
- Conflicting same-scope overrides
- Duplicate day-type resolutions
- Duplicate premium lines
- Concurrent employee recalculation
- Review while premiums are stale or incomplete
- Recalculation after approval or locking

Use:
- Partial unique indexes
- Effective-date exclusion constraints
- Advisory locks
- Row locks
- Calculation-version keys
- Optimistic version checks

## 13. Numeric Precision

- Use PostgreSQL `numeric`.
- Preserve raw precision.
- Round displayed lines and totals to two decimals.
- Store raw and rounded minutes and amounts.
- Do not use JavaScript floating point for payroll totals.

## 14. Safe Errors

Examples:

```text
No approved company-default premium rule applies to this date.
Two equally specific premium rules apply to this employee.
The holiday configuration does not support payroll calculation.
The night-differential window is invalid.
This premium rule changed and requires recalculation.
This payroll period is locked and cannot be recalculated.
```

## 15. Testing

Database and calculation tests cover:

- Default and override resolution
- Scope precedence and conflicts
- All supported day-type combinations
- Incremental premium behavior
- Duplicate base-pay prevention
- Overtime
- Night windows crossing midnight
- Night differential on ordinary and overtime minutes
- All rounding modes
- Grace deductions
- Mid-period rule and compensation changes
- Holiday configuration failures
- Stale detection
- Recalculation versioning
- Employee failure isolation
- Locked-period protection
- RLS and immutability

Application tests cover:

- Route authorization
- Rule matrix validation
- Approval and rejection
- Legal metadata
- Coverage preview
- Conflict warnings
- Workspace totals
- Employee premium detail
- Exception filtering
- Responsive editing
- Sensitive-value redaction

All Phase 1–10B.1 tests must remain passing.

## 16. Rollout

Use forward-only migrations in this order:

1. Enums
2. Rule sets
3. Rule versions
4. Attendance deduction rules
5. Day-type resolutions
6. Premium lines
7. Event tables
8. Payroll-entry extensions
9. Constraints and indexes
10. RLS
11. Rule-management RPCs
12. Day-type resolution
13. Premium calculation
14. Stale detection
15. Readiness integration
16. Notification integration
17. Administration UI
18. Workspace integration
19. Employee detail integration
20. Exception integration
21. Tests
22. Verification SQL

## 17. Initial Setup

The migration seeds inactive Philippine premium presets with source metadata. It does not activate rules, calculate premiums, or change approved or locked payroll results. Super Admin approval is required before the first premium calculation.

## 18. Acceptance Criteria

Phase 10B.2A is complete when:

1. HR can create and submit premium-rule drafts.
2. Super Admin can approve or reject premium rules.
3. HR can create and submit attendance deduction rules.
4. Super Admin can approve or reject attendance deduction rules.
5. Approved rules are immutable and effective-dated.
6. Company-default and group overrides resolve correctly.
7. Same-scope conflicts create blocking exceptions.
8. Day types and combined day types resolve correctly.
9. Incremental premium lines do not duplicate base pay.
10. Overtime uses the correct effective rate.
11. Cross-midnight night windows calculate correctly.
12. Raw and rounded minutes are preserved.
13. Grace deductions use excess-only behavior.
14. Rule changes mark only affected entries stale.
15. Recalculation creates new immutable versions.
16. Employee failures remain isolated.
17. Premium blockers prevent review.
18. Employees and managers cannot access premium administration or calculations.
19. Regression tests pass.
20. TypeScript validation passes.
21. Production build passes.

## 19. Implementation Clarifications

The implementation resolved the following codebase-specific details without changing the approved product design:

- `payroll_group` uses the existing `payroll_schedules` entity.
- `position` uses the existing `job_titles` entity.
- Double regular holidays use `holiday_calendar_versions.holiday_count = 2`; duplicate active holiday rows for one date remain prohibited.
- Double special holidays are not assigned an invented multiplier and instead create `MISSING_HOLIDAY_CONFIGURATION`.
- When no approved attendance deduction rule applies, the engine uses a virtual zero-grace, exact-minute rule to preserve Phase 10B.1 behavior.
- Premium calculation creates a new complete employee-entry version rather than mutating an existing completed entry.
- Period-wide recalculation refreshes stale base payroll entries before calculating premiums.
- Superseded premium and attendance-rule versions remain effective for historical dates; the current approved version wins when ranges share a start date.
- The Philippine statutory preset is immutable reference data and cannot participate in calculation until it is cloned, reviewed, submitted, and approved.

## 20. Implementation Status

Implemented on branch `feature/phase-10b2a-premium-rules`. Deployment still requires applying the migration to a preview Supabase project and running `phase10b2a_post_migration_verification.sql` before production rollout.
