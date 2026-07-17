# Phase 10A — Payroll Foundation Implementation Report

**Project root:** `hris-github`  
**Feature branch:** `feature/phase-10a-payroll-foundation`  
**Date:** 2026-07-18

## Summary

Phase 10A establishes the payroll administration foundation without calculating gross pay, deductions, taxes, statutory contributions, payslips, or bank files.

Implemented capabilities:

- Weekly, biweekly, semi-monthly, and monthly payroll schedules
- PHP organization payroll settings using `Asia/Manila`
- Rolling 12-month payroll-period generation
- Previous-business-day adjustment for weekends and configured holidays
- Effective-dated monthly salary and hourly-rate records
- Effective-dated employee payroll-schedule assignments
- HR Admin submission and Super Admin approval workflows
- Backdated-change warnings and controlled mid-period overrides
- Payroll-period workflow: Draft → Open → Under Review → Approved → Locked
- Super Admin locked-period reopening with a required reason
- Immutable compensation and payroll-period audit events
- Employee read-only current compensation and schedule view
- No payroll compensation access for managers
- Phase 9 in-app notification integration without compensation amounts or private reasons
- Payroll overview, schedule administration, periods, employee compensation, and approval inbox routes

## Database migrations

Apply migrations in this order:

1. `supabase/migrations/202607180001_fix_notification_archive_outer_join_lock.sql`
2. `supabase/migrations/202607180002_payroll_foundation.sql`

The Phase 10A migration creates:

- `payroll_settings`
- `payroll_schedules`
- `payroll_periods`
- `employee_compensation_records`
- `employee_payroll_schedule_assignments`
- `payroll_period_events`
- `compensation_events`

It also adds RLS policies, controlled RPCs, constraints, indexes, immutable-event protection, notification integration, and the daily payroll-period generation Cron job.

## Cron schedule

```text
Job: hris-daily-payroll-period-generation
Schedule: 15 0 * * * UTC
Local time: 8:15 AM Asia/Manila
```

## Application routes

```text
/payroll
/payroll/schedules
/payroll/schedules/new
/payroll/schedules/[scheduleId]
/payroll/periods
/payroll/periods/[periodId]
/payroll/approvals
/employees/[employeeId]/compensation
/employees/[employeeId]/compensation/new
/employees/[employeeId]/compensation/[recordId]
/me/compensation
```

## Security controls

- RLS remains the primary database access boundary.
- Employees can read only their own currently effective approved compensation and schedule.
- Managers cannot access compensation records.
- HR Admins can prepare and submit requests but cannot approve them.
- Super Admins approve compensation and schedule assignments and control final payroll-period transitions.
- Client-facing mutations call controlled `SECURITY DEFINER` RPCs.
- All controlled RPCs use `SET search_path = pg_catalog, public`.
- Browser-facing payroll code contains no service-role key access.
- Notification payloads exclude rates, salaries, amounts, private reasons, and override reasons.
- Audit event tables are immutable through application roles.

## Verification evidence

Fresh release verification completed against the packaged source:

| Check | Result |
|---|---|
| Full automated test suite | 795 passed, 0 failed |
| Phase 10A end-to-end static checks | 8 passed, 0 failed |
| TypeScript | `npx tsc --noEmit` exited successfully |
| Production build | Next.js 16.2.10 production build exited successfully |
| Build routes | All approved Phase 10A routes appeared in the production route manifest |
| Whitespace validation | `git diff --check` passed |
| Sensitive logging/storage scan | No payroll console logging, browser persistence, or direct client table writes found |

The production build was run with `NEXT_TURBOPACK_USE_WORKER=0` in the constrained build sandbox after a Turbopack worker intermittently stalled. The checked-in `npm run build` still performs standalone TypeScript validation before Next.js compilation.

## Database verification

Run this after applying both migrations:

```text
phase10a_post_migration_verification.sql
```

The script checks:

- All seven payroll tables exist and have RLS enabled
- Payroll defaults are PHP, Asia/Manila, and a rolling 12-month horizon
- The default schedule is valid
- Public payroll RPCs are `SECURITY DEFINER`, use fixed search paths, and have controlled grants
- Internal helper functions are not executable by browser roles
- The payroll Cron job is active with the approved schedule
- Period generation is idempotent inside a rolled-back verification transaction
- The Phase 9 notification archive-lock repair remains deployed

A live Supabase instance was not available inside the build sandbox, so the migration has not been applied by this implementation environment. The supplied verification SQL must be run in the target Supabase project after migration deployment.

## Phase boundary

Phase 10A intentionally excludes:

- Gross-pay calculations
- Attendance-to-payroll conversion
- Overtime-rate calculations
- Allowances and bonuses
- Deductions
- Taxes and statutory contributions
- Payslips
- Payroll exports and bank-payment files

Those remain scheduled for Phase 10B and Phase 10C.
