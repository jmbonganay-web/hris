# Phase 10B.1 Payroll Calculation Foundation Report

## Scope delivered

- Forward-only Supabase migration for effective-dated payroll-basis rules
- Database-native controlled payroll calculation runs
- Automatic employee eligibility evaluation
- Monthly and hourly base-pay calculations using PostgreSQL `numeric`
- New-hire and employment-end proration
- Attendance, leave, overtime, compensation, work-schedule, and basis snapshots
- Immutable daily breakdowns and employee calculation versions
- Employee-level exception isolation
- Employee exclusion and reversal controls
- Source-change stale marking and controlled recalculation
- Database readiness gate for `open → under_review`
- HR-only workspace, employee detail, exception queue, and basis settings routes
- Super Admin-only basis approval and blocker override actions
- Safe payroll error mapping and notification payload redaction

## Database deployment

Apply:

```text
supabase/migrations/202607190001_payroll_calculation_foundation.sql
```

Then run:

```text
phase10b1_post_migration_verification.sql
```

No basis rule is activated automatically. No employee payroll calculation is created by the migration.

## Phase boundary

Deferred to later Phase 10B stages:

- Overtime, holiday, rest-day, and night premiums
- Attendance grace and rounding policies
- Allowances, recurring deductions, and manual adjustments
- SSS, PhilHealth, Pag-IBIG, and withholding tax
- Deduction priority, negative-net-pay carry-forward, and 13th-month accrual
- Payslips, exports, and bank files

## Verification

Fresh local verification completed before packaging:

- `npm test`: **830 passed, 0 failed**
- `npx tsc --noEmit`: passed
- Clean Next.js 16.2.10 Turbopack production build: passed
- Migration and verification SQL parsing with `pglast`: passed
- Git diff whitespace validation: passed

The combined `npm run build` command was also attempted in this sandbox, but its chained Next.js process exceeded the sandbox timeout. Running the same required stages separately (`npx tsc --noEmit`, followed by a clean `npx next build`) completed successfully. The migration has not been applied to a live Supabase project from this environment.
