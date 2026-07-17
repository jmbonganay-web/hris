# Phase 8 Dashboard Analytics Design

## Goal

Replace the mixed mock/live `/dashboard` with a complete, live, role-specific operational analytics dashboard for HR/Super Admins, managers, and employees.

## Approved direction

- Replace `/dashboard`; do not add a separate analytics route.
- Use lightweight analytics: KPI cards plus simple SVG/CSS charts with no new charting dependency.
- Default the reporting period to the current calendar month in `Asia/Manila`.
- Allow users to switch to last 7 days, last 30 days, current quarter, or a custom range.
- Preserve the existing Balanced spacing system, responsive behavior, accessibility, and role boundaries.

## Role-specific experience

### HR Admin and Super Admin

The dashboard presents organization-wide operational status:

- Active workforce count and current employment-status breakdown.
- New hires within the selected range.
- Attendance summary and daily present/absence/exception trend.
- Pending leave requests and upcoming approved leave.
- Pending overtime approvals.
- Document review/compliance issues.
- Recent hires and prioritized action links into existing HR modules.

No mock values remain. Sensitive employee metadata, private notes, review reasons, storage paths, or document file information are excluded.

### Manager

An employee with one or more current direct reports receives a manager dashboard while retaining their personal attendance clock card:

- Current direct-report count.
- Team attendance trend and exception counts for the selected range.
- Pending team leave and upcoming approved absences.
- Aggregate team document compliance only.
- Links to existing manager-safe or self-service routes only.

Managers never receive document files, sensitive metadata, HR notes, private leave text, or organization-wide records.

### Employee

An employee without direct reports receives a personal dashboard and retains the attendance clock card:

- Personal attendance totals and daily status trend for the selected range.
- Pending/recent leave requests and current-year leave balances.
- Personal document compliance counts.
- Unread document-notification count.
- Current schedule summary and upcoming assignment when available.

## Architecture

### Database

Add a forward-only migration, `202607170004_dashboard_analytics.sql`, containing three authenticated `SECURITY DEFINER` functions:

- `get_hr_dashboard_analytics(p_start_date date, p_end_date date)`
- `get_manager_dashboard_analytics(p_start_date date, p_end_date date)`
- `get_employee_dashboard_analytics(p_start_date date, p_end_date date)`

Each function validates an inclusive date range no longer than 366 days, uses `set search_path = pg_catalog, public`, performs explicit role/ownership checks, and returns one safe `jsonb` payload. Default execution privileges are revoked and only `authenticated` receives execute permission.

The HR function uses organization-wide aggregates. The manager function scopes all employee joins to current direct reports (`employees.manager_id = current_employee_id()`) and returns aggregates only. The employee function scopes all data to `current_employee_id()`.

### Server feature module

Create `src/features/dashboard/` with:

- Shared types for analytics payloads.
- Date-range parsing and label generation.
- Runtime payload normalization with safe numeric/string defaults.
- One server query dispatcher that resolves the current role and manager status, then invokes exactly one role-appropriate analytics RPC.

Existing attendance clock, schedule, and document components/queries are reused where they already provide safe projections.

### UI

Replace the current dashboard page with role-specific sections assembled from reusable components:

- `DashboardPeriodFilter`
- `DashboardMetricGrid`
- `DashboardTrendChart`
- `DashboardBreakdownChart`
- `DashboardActionList`
- `DashboardRecentPeople`
- `DashboardUpcomingLeave`
- `EmployeeDashboardDetails`

Charts use semantic headings, visible legends, text summaries, SVG titles/descriptions, and CSS bars. Values remain understandable without relying on color alone.

## Date behavior

- Company date and preset calculations use `Asia/Manila`.
- Default preset: `current_month`.
- Custom ranges require valid ISO dates, `start <= end`, and at most 366 inclusive days.
- Invalid query parameters fall back to the current month rather than throwing.
- The selected range is preserved in links where it materially affects drill-down destinations.

## Error and loading behavior

- Add `/dashboard/loading.tsx` with responsive skeleton cards and chart placeholders.
- Add `/dashboard/error.tsx` as a client error boundary with a safe retry action.
- Server queries expose generic dashboard errors and never return raw database messages to the UI.
- Empty sections render explicit empty states rather than blank cards.

## Security constraints

- No browser-facing component receives private notes, review reasons, storage paths, signed URLs, payroll data, government identifiers, bank data, or unrestricted custom metadata.
- Manager analytics includes direct-report aggregates and safe identity labels only.
- Employees see only their own analytics.
- HR/Super Admin functions require `is_hr_admin()`.
- Dashboard SQL functions are read-only, stable where valid, and do not write audit events because opening a dashboard is not a lifecycle mutation.

## Testing

- Pure tests cover date presets, custom-range validation, normalization, metric derivation, and chart geometry.
- Migration source tests verify function names, role checks, direct-report scoping, date limits, `SECURITY DEFINER`, fixed search paths, privilege revocation, and forbidden sensitive fields.
- UI source tests verify removal of mock imports, role-specific sections, period filter, chart components, loading/error routes, and Balanced spacing classes.
- Run the full Node test suite, TypeScript validation, and production build before packaging.

## Exclusions

Phase 8 does not add payroll calculations, scheduled notification delivery, email/SMS/push notifications, predictive analytics, external BI tools, CSV exports, custom dashboard builders, or a new charting dependency.
