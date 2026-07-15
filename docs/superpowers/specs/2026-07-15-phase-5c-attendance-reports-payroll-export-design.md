# Phase 5C Attendance Reports and Payroll Export Design

**Project:** HRIS MVP  
**Date:** 2026-07-15  
**Status:** Approved for implementation  
**Depends on:** Phase 5A Attendance MVP, Phase 5B-1 Work Schedules, Phase 5B-2A Attendance Policy and Daily Calculations, Phase 5B-2B Overtime and Holidays

## 1. Goal

Phase 5C turns the HRIS attendance, schedule, holiday, and overtime records into secure HR reporting and payroll-preparation exports.

The phase must provide operational visibility for current attendance while keeping payroll-facing data strictly based on active finalized attendance revisions and active, non-superseded overtime approval state. It prepares reliable attendance inputs for a later payroll phase but does not calculate salary, pay rates, premiums, deductions, or payslips.

## 2. Approved scope

### Included

- Unified HR reports page at `/reports`
- Operational and Payroll report modes
- Current-month default date range
- Department, employee, employment-status, and activity filters
- Summary metrics
- Daily attendance report
- Employee attendance summary
- Attendance exceptions report
- Overtime and holiday-work report
- Server-side pagination and stable sorting
- Detailed daily CSV export
- Employee-summary CSV export
- Exceptions CSV export
- Overtime and holiday-work CSV export
- One XLSX workbook containing four worksheets
- Server-generated exports
- Export row limits
- Point-in-time report generation
- Safe export audit records
- HR Admin and Super Admin authorization
- Protected PostgreSQL reporting functions
- Asia/Manila report dates and timestamps
- Automated security, reporting, export, and integration tests

### Excluded

- Salary computation
- Overtime or holiday pay multipliers
- Night differential
- Allowances or deductions
- Government contributions or withholding tax
- Payslips
- Payroll-period locking
- Stored export files
- Immutable export snapshots
- Scheduled or recurring report generation
- Employee self-service reporting
- Manager report access
- Historical effective-dated department or job-title assignments
- Attendance-rate percentages
- Leave-aware attendance calculations
- Changes to attendance, overtime, holiday, or schedule source-of-truth records

## 3. Core decisions

- The page uses one unified `/reports` route with tabs.
- HR Admin and Super Admin are the only authorized users.
- Operational mode may include provisional and finalized records.
- Payroll mode and every export use finalized attendance only.
- Operational mode is limited to 31 inclusive calendar days.
- Payroll mode is limited to 366 inclusive calendar days.
- Future dates are rejected.
- The default range is the current month in Asia/Manila.
- Current employee department, job title, and employment status are used.
- Historical organization assignment is not reconstructed.
- Employees who are currently inactive remain reportable when matching records exist.
- Employees without records are excluded by default but may be included in the employee-summary dataset for roster reconciliation.
- Daily exports use one row per employee per date.
- Employee-summary exports use one row per employee for the selected range.
- Integer-minute values are authoritative.
- Human-readable `HH:MM` values are included for review.
- Pending, rejected, and superseded overtime never count toward payroll totals.
- Approved overtime is separated by pre-shift, post-shift, rest-day, and holiday-work segments.
- Approved holiday work is also separated by holiday type.
- On-screen reports are paginated; exports contain the full filtered dataset within the approved limit.
- CSV and XLSX are generated from the same normalized reporting data.
- Export files are not stored.
- Re-running the same report later may produce different output after authorized correction or recalculation.
- No attendance-rate percentage is shown before leave management exists.

## 4. Architecture

Phase 5C uses protected PostgreSQL reporting functions as the authoritative reporting layer.

```text
Active attendance calculation groups and revisions
        +
Attendance records and preserved schedule snapshots
        +
Active and historical overtime detection revisions
        +
Overtime approval items
        +
Holiday context preserved on attendance and overtime revisions
        +
Current employee, department, and job-title data
        ↓
Protected reporting functions
        ↓
Next.js server-only report queries
        ↓
/reports tabs
        +
CSV and XLSX export route handlers
        ↓
Safe export audit entry
        ↓
Private no-store download response
```

### Database responsibilities

Protected reporting functions will:

- Validate HR Admin or Super Admin role.
- Validate report mode, dates, filters, pagination, sorting, and export limits.
- Resolve active attendance calculation revisions through `attendance_calculation_groups.active_revision_id`.
- Include provisional active revisions only in Operational mode.
- Restrict Payroll mode and all exports to finalized active revisions.
- Resolve overtime approval state without counting inactive or superseded approvals.
- Return current employee organization fields.
- Aggregate employee totals in PostgreSQL.
- Enforce deterministic sorting and pagination.
- Return report-safe fields only.

### Application responsibilities

Next.js will:

- Parse and validate URL filters before calling the database.
- Keep report filters in search parameters.
- Render the unified reports experience.
- Use server-only report query modules.
- Generate CSV and XLSX from normalized report rows.
- Format Asia/Manila timestamps and `HH:MM` durations.
- Prevent spreadsheet formula injection.
- Record safe export metadata only after complete generation succeeds.
- Return private, no-store file responses.

### Persistence

Phase 5C creates no duplicate attendance or overtime report tables. Reports are point-in-time projections of current active source records.

Export audit events reuse `employee_audit_logs` with `employee_id = null`, which is already supported by the existing organization and schedule audit architecture.

## 5. Proposed file and module boundaries

The implementation should follow the existing feature-based structure.

```text
src/
├── app/
│   ├── (dashboard)/reports/
│   │   ├── page.tsx
│   │   ├── loading.tsx
│   │   └── error.tsx
│   └── api/reports/export/
│       ├── csv/route.ts
│       └── xlsx/route.ts
├── features/reports/
│   ├── auth.ts
│   ├── constants.ts
│   ├── filters.ts
│   ├── types.ts
│   ├── queries.ts
│   ├── formatters.ts
│   ├── csv.ts
│   ├── xlsx.ts
│   ├── audit.ts
│   └── components/
│       ├── report-filters.tsx
│       ├── report-tabs.tsx
│       ├── summary-cards.tsx
│       ├── daily-attendance-table.tsx
│       ├── employee-summary-table.tsx
│       ├── exceptions-table.tsx
│       ├── overtime-holiday-table.tsx
│       ├── exports-panel.tsx
│       └── report-pagination.tsx
└── types/
    └── reports.ts
```

The exact split may follow existing repository conventions, but report querying, export formatting, audit writing, and UI rendering must remain separate responsibilities.

The XLSX implementation will use `exceljs` only from server-only modules. It must not enter client bundles.

## 6. Reporting data resolution

### Attendance source

The authoritative attendance row for an employee and date is:

```text
attendance_calculation_groups.active_revision_id
→ attendance_calculation_revisions.id
```

A superseded attendance revision must never be used in current screen totals or exports.

### Finalized versus provisional

```text
Finalized: is_provisional = false
Provisional: is_provisional = true
```

Operational mode may return either state. Payroll mode returns finalized revisions only.

### Schedule snapshot

Historical schedule context comes from fields already preserved on the active attendance calculation revision:

```text
schedule_assignment_id
schedule_version_id
scheduled_start_at
scheduled_end_at
scheduled_minutes
```

A report day is a scheduled day when the preserved active revision contains both `scheduled_start_at` and `scheduled_end_at`. The report must not resolve the employee’s current schedule to reinterpret an older attendance date.

### Overtime source

Current payroll-approved overtime must satisfy all of the following:

- The detection group’s `active_revision_id` points to the detection revision.
- The detection revision is active.
- The approval item references that active detection revision.
- Approval status is `approved`.
- `superseded_at` is null.
- `approved_minutes = detected_minutes`.

Pending, rejected, and superseded items may appear in operational/history reports but contribute zero to payroll-approved totals.

### Organization source

Reports use the employee’s current:

```text
department
job title
employment status
```

If an employee changes organization assignment, rerunning an older report may show the new current organization values. This limitation must be documented in the reports UI and export documentation.

## 7. Report modes and date validation

### Operational mode

- Date range maximum: 31 inclusive calendar days.
- May include active finalized and provisional revisions.
- Shows live clock-in and clock-out state represented by the current active revision.
- Separates finalized and provisional totals.
- Does not enable exports.
- Provisional values must be visibly labeled.

### Payroll mode

- Date range maximum: 366 inclusive calendar days.
- Uses active finalized attendance revisions only.
- Uses active overtime state for payroll totals.
- Enables CSV and XLSX exports.

### Shared date rules

- Start and end dates are interpreted as Asia/Manila calendar dates.
- Start date must be on or before end date.
- Inclusive day count is `end_date - start_date + 1`.
- End date may not be after the current Asia/Manila date.
- Default dates are the first day of the current month through the current date.
- If the current month later exceeds a mode limit, the mode limit still applies.

## 8. Reports page and filters

### Route

```text
/reports
```

### Tabs

```text
Summary
Daily Attendance
Exceptions
Overtime & Holiday Work
Exports
```

The Exports tab is enabled only in Payroll mode. In Operational mode it displays a clear explanation that exports require finalized payroll data.

### Shared filters

- Report mode
- Start date
- End date
- Department
- Employee
- Employment status
- Active employees only
- Include employees with no records

`Include employees with no records` affects only the employee-summary dataset. It never creates artificial daily, exception, or overtime rows.

When `active employees only` is enabled, only current `employment_status = active` employees match. It overrides any broader employment-status selection.

### Daily Attendance filters

- Attendance status
- Finalized or provisional state

Attendance statuses:

```text
present
absent
holiday
missing_clock_out
rest_day_worked
unscheduled_attendance
```

### Exceptions filters

```text
absent
missing_clock_out
provisional_or_incomplete
unscheduled_attendance
late
undertime
```

### Overtime and Holiday Work filters

- Segment type
- Approval status
- Holiday type

Segment types:

```text
pre_shift
post_shift
rest_day
holiday_work
```

Approval statuses:

```text
pending
approved
rejected
superseded
```

Holiday types:

```text
regular_holiday
special_non_working_holiday
company_holiday
```

## 9. Pagination and sorting

On-screen datasets use server-side pagination.

```text
Default page size: 25
Allowed page sizes: 25, 50, 100
Minimum page: 1
```

Each paginated reporting function returns a stable `total_count` with every row or through an equivalent explicit result contract.

Default ordering:

```text
Daily Attendance:
  attendance_date desc,
  employee_number asc,
  attendance_calculation_revision_id asc

Employee Summary:
  employee_number asc,
  employee_id asc

Exceptions:
  attendance_date desc,
  employee_number asc,
  exception_type asc,
  attendance_calculation_revision_id asc

Overtime & Holiday Work:
  attendance_date desc,
  employee_number asc,
  segment_type asc,
  detection_revision_id asc
```

Stable secondary keys prevent duplicate or skipped rows between pages.

## 10. Protected reporting functions

Phase 5C will add these public reporting functions:

```text
get_attendance_report_summary
get_attendance_daily_report
get_attendance_exception_report
get_overtime_holiday_report
get_employee_attendance_summary
```

Each function will accept the shared filter set relevant to its dataset. Paginated functions also accept validated page and page-size parameters. Export calls use the same normalized database contract but request the complete filtered dataset within the 25,000-row limit.

### Required function behavior

All public report functions must:

- Use `SECURITY DEFINER`.
- Use a fixed search path containing only `pg_catalog`, `public`, and required safe schemas.
- Reject unauthenticated callers.
- Reject callers who are not HR Admin or Super Admin.
- Validate all enum-like filter values.
- Enforce mode-specific date limits.
- Reject future dates.
- Enforce screen page-size limits.
- Enforce export row limits.
- Return safe application error codes rather than raw database details.
- Avoid returning protected reasons, notes, or sensitive employee data.

Internal report helpers or views must be revoked from `public`, `anon`, and `authenticated`. Application users call only the protected public report functions.

## 11. Summary metrics

### Payroll mode metrics

- Employee-day records
- Scheduled days
- Present days
- Absent days
- Holiday days
- Missing clock-out days
- Rest-day worked days
- Unscheduled-attendance days
- Worked minutes
- Late minutes
- Undertime minutes
- Approved overtime minutes

### Operational mode additions

- Finalized employee-day records
- Provisional employee-day records
- Finalized worked minutes
- Provisional worked minutes

### Metric definitions

```text
employee_day_records
  Count of active attendance calculation revisions in the filtered dataset.

scheduled_days
  Count where preserved scheduled_start_at and scheduled_end_at are both non-null.

present_days
  Count where base_status = present. Holiday-work attendance is included because
  completed holiday attendance preserves base_status = present and is_holiday = true.

absent_days
  Count where base_status = absent.

holiday_days
  Count where is_holiday = true. This is a calendar-context count and may overlap
  present_days or missing_clock_out_days.

missing_clock_out_days
  Count where base_status = missing_clock_out.

rest_day_worked_days
  Count where base_status = rest_day_worked.

unscheduled_attendance_days
  Count where base_status = unscheduled_attendance.

worked_minutes
  Sum of non-null worked_minutes; unknown values do not become zero.

late_minutes
  Sum of non-null late_minutes.

undertime_minutes
  Sum of non-null undertime_minutes.

approved_overtime_minutes
  Sum of active, non-superseded approved pre-shift, post-shift, rest-day, and
  holiday-work approval minutes.
```

Counts are intentionally direct and auditable. Phase 5C does not calculate attendance-rate percentages.

## 12. Daily Attendance dataset

The detailed dataset contains one row per employee per attendance date.

### Identity and organization

```text
attendance_date
employee_id
employee_number
employee_name
department_id
department_name
job_title_id
job_title_name
employment_status
```

### Attendance context

```text
attendance_status
calculation_state
is_provisional
is_holiday
holiday_name
holiday_type
is_scheduled_day
scheduled_start
scheduled_end
clock_in
clock_out
worked_minutes
worked_duration
late_minutes
late_duration
undertime_minutes
undertime_duration
is_late
is_undertime
is_corrected
is_recalculated
```

`calculation_state` is `finalized` or `provisional` and is derived from `is_provisional`.

### Overtime columns

```text
pre_shift_detected_minutes
pre_shift_approved_minutes
pre_shift_status
post_shift_detected_minutes
post_shift_approved_minutes
post_shift_status
rest_day_detected_minutes
rest_day_approved_minutes
rest_day_status
holiday_work_detected_minutes
holiday_work_approved_minutes
holiday_work_status
total_approved_overtime_minutes
total_approved_overtime_duration
```

A normal workday may contain both pre-shift and post-shift values on the same daily row. Overtime segments never create duplicate attendance rows.

### Reconciliation metadata

```text
attendance_record_id
attendance_calculation_revision_id
generated_at
timezone
```

### Null and zero rules

- Missing clock-out keeps worked minutes and worked duration blank.
- Absence uses zero worked minutes.
- Holiday without attendance uses zero worked minutes.
- Unknown late or undertime values remain blank.
- Missing overtime segment values remain blank rather than becoming a synthetic zero-status segment.
- Non-qualifying active detection history may show detected minutes with no approval status only where the dataset contract explicitly includes such history.

## 13. Employee Summary dataset

The summary dataset contains one row per matching employee for the selected range.

### Identity and scope

```text
employee_id
employee_number
employee_name
department_id
department_name
job_title_id
job_title_name
employment_status
report_start_date
report_end_date
generated_at
timezone
```

### Attendance totals

```text
employee_day_records
scheduled_days
present_days
absent_days
holiday_days
missing_clock_out_days
rest_day_worked_days
unscheduled_attendance_days
finalized_days
provisional_days
worked_minutes
worked_duration
late_minutes
late_duration
undertime_minutes
undertime_duration
```

### Approved overtime totals

```text
approved_pre_shift_minutes
approved_pre_shift_duration
approved_post_shift_minutes
approved_post_shift_duration
approved_rest_day_minutes
approved_rest_day_duration
approved_holiday_work_minutes
approved_holiday_work_duration
total_approved_overtime_minutes
total_approved_overtime_duration
```

### Holiday-work breakdown

```text
regular_holiday_work_minutes
regular_holiday_work_duration
special_non_working_holiday_work_minutes
special_non_working_holiday_work_duration
company_holiday_work_minutes
company_holiday_work_duration
```

`total_approved_overtime_minutes` includes all four segment types, including holiday work. Holiday-type totals are subsets of approved holiday-work minutes.

### Employees without records

When `include employees with no records` is enabled:

- Matching employees in the selected organization and employment scope appear.
- All count and minute totals are zero.
- No daily, exception, or overtime source rows are invented.
- Current identity and organization fields are returned.
- These rows are for roster reconciliation and are not evidence of finalized attendance.

## 14. Exceptions dataset

The Exceptions report uses one row per exception. One attendance day may generate multiple rows.

```text
attendance_date
employee_id
employee_number
employee_name
department_id
department_name
job_title_id
job_title_name
employment_status
exception_type
attendance_status
calculation_state
clock_in
clock_out
worked_minutes
worked_duration
late_minutes
late_duration
undertime_minutes
undertime_duration
is_corrected
is_recalculated
attendance_calculation_revision_id
```

Exception rules:

```text
absent
  base_status = absent

missing_clock_out
  base_status = missing_clock_out

provisional_or_incomplete
  is_provisional = true

unscheduled_attendance
  base_status = unscheduled_attendance

late
  is_late = true or late_minutes > 0

undertime
  is_undertime = true or undertime_minutes > 0
```

Corrected and recalculated flags are context fields, not separate exception rows.

Overtime approval conditions are excluded from this report and belong to the Overtime & Holiday Work report.

## 15. Overtime and Holiday Work dataset

This dataset contains one row per overtime detection or approval segment within the selected scope.

```text
attendance_date
employee_id
employee_number
employee_name
department_id
department_name
job_title_id
job_title_name
employment_status
segment_type
holiday_name
holiday_type
detected_start
detected_end
detected_minutes
detected_duration
approved_minutes
approved_duration
approval_status
reviewed_at
is_active_detection
is_superseded
attendance_calculation_revision_id
detection_revision_id
approval_item_id
```

### History rules

- Screen reports may show pending, approved, rejected, and superseded history.
- Superseded records remain clearly marked.
- A non-qualifying detection revision may appear without an approval item when history filters require it.
- Reviewer identity, approval note, rejection reason, policy reason, holiday replacement reason, and recalculation reason are excluded.

### Payroll rules

Only active, non-superseded approved items contribute to approved totals.

```text
pending approved contribution = 0
rejected approved contribution = 0
superseded approved contribution = 0
approved active contribution = approved_minutes
```

## 16. CSV export contracts

Phase 5C provides four CSV datasets:

```text
attendance-daily-YYYY-MM-DD-to-YYYY-MM-DD.csv
attendance-employee-summary-YYYY-MM-DD-to-YYYY-MM-DD.csv
attendance-exceptions-YYYY-MM-DD-to-YYYY-MM-DD.csv
overtime-holiday-work-YYYY-MM-DD-to-YYYY-MM-DD.csv
```

The daily and employee-summary CSVs are the primary payroll-preparation exports. Exceptions and overtime CSVs are supplemental reconciliation exports.

### CSV rules

- Payroll mode only
- Finalized attendance only
- UTF-8 encoding
- Header row required
- ISO `YYYY-MM-DD` dates
- Asia/Manila timestamps with explicit offset
- Integer-minute fields preserved as numeric text
- Human-readable durations use `HH:MM`
- Null source values use empty CSV fields
- RFC-compatible quoting for commas, quotes, and line breaks
- Values beginning with `=`, `+`, `-`, or `@` are escaped as plain text before serialization
- Controlled filenames only
- No notes, reasons, sensitive identifiers, or hidden columns

## 17. XLSX export contract

Filename:

```text
attendance-report-YYYY-MM-DD-to-YYYY-MM-DD.xlsx
```

Worksheets:

```text
Daily Attendance
Employee Summary
Exceptions
Overtime & Holiday Work
```

### Workbook behavior

- Payroll mode only
- Same shared date and organization filters across all sheets
- Frozen header row
- Auto-filter enabled
- Readable column widths
- Explicit date and timestamp cell types
- Integer-minute columns retained
- Human-readable duration columns included
- No formulas required for authoritative totals
- Formula-like text stored as plain text
- No hidden sensitive-data worksheet
- No macros
- No persisted temporary file

Each worksheet is independently limited to 25,000 data rows. If any requested worksheet exceeds that limit, workbook generation is rejected before download and HR must narrow the filters.

## 18. Export delivery

Protected route handlers:

```text
/api/reports/export/csv
/api/reports/export/xlsx
```

The request contains validated filter parameters and export type, never report rows.

Server workflow:

```text
1. Authenticate the request.
2. Verify HR Admin or Super Admin role.
3. Validate report mode and filters.
4. Reject Operational-mode export requests.
5. Load the complete finalized dataset through protected reporting functions.
6. Enforce the 25,000-row limit.
7. Generate the complete CSV or XLSX payload.
8. Write the successful export audit event.
9. Return the download response.
```

If generation or audit insertion fails, no file is returned.

Response headers:

```text
Content-Disposition: attachment; filename="..."
Cache-Control: private, no-store, max-age=0
Pragma: no-cache
X-Content-Type-Options: nosniff
```

Content types:

```text
CSV: text/csv; charset=utf-8
XLSX: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
```

Generated files are returned directly and are not written to Supabase Storage or retained by the application.

## 19. Export audit integration

Reuse:

```text
employee_audit_logs
```

Export events use:

```text
employee_id = null
entity_type = attendance_report
entity_id = null
source = application
```

Actions:

```text
attendance_report.csv_exported
attendance_report.xlsx_exported
```

Safe audit metadata:

```text
export_dataset
export_format
report_mode
start_date
end_date
department_id
employee_id_filter
employment_status
active_only
include_employees_without_records
row_count
timezone
```

For an XLSX workbook, audit metadata also includes per-sheet row counts under a controlled object such as:

```text
sheet_row_counts
```

The audit actor and creation timestamp identify who generated the file and when.

Audit JSON must exclude:

- Generated report rows
- Employee names
- Clock timestamps
- Attendance or overtime revision IDs
- Notes or reasons
- Government identifiers
- Bank or payroll details
- File bytes
- Raw database errors

Viewing reports without downloading does not create an audit event in Phase 5C.

## 20. Authorization and database security

### HR Admin and Super Admin

May:

- Access `/reports`
- Use Operational and Payroll modes
- View organization-wide report rows
- Download CSV and XLSX exports
- View safe export audit records through existing audit access

### Employee and manager

May not:

- Access `/reports`
- Execute reporting functions successfully
- Download organization-wide exports
- Read internal report helpers or views

Employees continue using existing personal attendance and overtime pages.

### Function security

Every public reporting function must:

- Be `SECURITY DEFINER`.
- Use a fixed `search_path`.
- Validate the current authenticated profile role.
- Be revoked from `public` and `anon`.
- Be executable by `authenticated` only after internal role validation.

Internal helper functions and report-source views must be inaccessible to `public`, `anon`, and `authenticated`.

### Safe projection

Allowed fields:

- Employee number
- Full name
- Current department
- Current job title
- Current employment status
- Attendance timestamps and calculated values
- Holiday name and type
- Overtime segment, status, and minutes
- Source revision IDs needed for reconciliation

Forbidden fields:

- Government identifiers
- Bank details
- Salary values
- HR notes
- Attendance notes
- Correction reasons
- Recalculation reasons
- Approval notes
- Rejection reasons
- Holiday replacement reasons
- Attendance or overtime policy reasons
- Reviewer IDs
- Internal exception text

## 21. Error handling

Safe user-facing errors:

```text
The selected date range is invalid.
Operational reports are limited to 31 days.
Payroll reports are limited to 366 days.
Future report dates are not allowed.
You do not have permission to access attendance reports.
The report contains more than 25,000 rows. Narrow the selected filters.
The report could not be loaded.
The export could not be generated.
No reportable attendance data was found for the selected filters.
```

Application responses must not expose:

```text
SQLSTATE
PostgREST error codes
constraint names
raw Supabase messages
stack traces
function source
internal exception text
```

Server logs may contain the operation name and safe error code. They must not log report rows, generated file contents, notes, sensitive values, or complete employee datasets.

### Failure behavior

- Screen query failure preserves selected URL filters and shows a retryable state.
- Empty results display a non-error empty state.
- Export row-limit failure occurs before file generation.
- Partial CSV or XLSX output is never returned.
- Audit failure blocks the download.
- Successful download always has a corresponding export audit entry.

## 22. Time and duration formatting

### Timezone

All report date interpretation and displayed timestamps use:

```text
Asia/Manila
```

Database timestamps remain `timestamptz`.

Exports include an explicit timezone field and timestamps with the Asia/Manila offset.

### Duration rules

- Integer-minute fields are authoritative.
- Human-readable duration is `HH:MM` with hours allowed to exceed 24 for summaries.
- Zero minutes format as `00:00`.
- Null minutes format as blank.
- Negative duration values are invalid and must never be returned.

## 23. Performance and limits

### Screen limits

- Operational maximum: 31 days
- Payroll maximum: 366 days
- Page sizes: 25, 50, 100

### Export limits

- Maximum 25,000 data rows per CSV dataset
- Maximum 25,000 data rows per XLSX worksheet

### Database support

The implementation may add focused indexes needed by the final query plans, including indexes supporting:

- Attendance calculation group date and active revision lookup
- Employee/date filtering
- Overtime detection date, segment, and active revision lookup
- Approval lookup by detection revision, status, and supersession state
- Current employee department and employment-status filtering

Indexes must support report queries without changing source-record semantics.

The implementation plan must include `EXPLAIN`-based review or equivalent query-plan validation for the largest report paths.

## 24. Automated testing

### Report filter validation

- Current-month defaults
- Asia/Manila current date
- Start date after end date
- Operational 31-day inclusive limit
- Payroll 366-day inclusive limit
- Future-date rejection
- Valid and invalid mode values
- Valid and invalid page sizes
- Stable URL serialization

### Attendance resolution

- Active revision only
- Superseded revision excluded
- Provisional included in Operational mode
- Provisional excluded in Payroll mode
- Missing clock-out retains null worked minutes
- Absence uses zero worked minutes
- Holiday without attendance uses zero worked minutes
- Holiday work retains holiday context
- Schedule snapshot determines scheduled day
- Current schedule does not reinterpret history

### Summary calculations

- Scheduled-day count
- Present, absent, holiday, missing-clock-out, rest-day, and unscheduled counts
- Finalized and provisional counts
- Null values not coerced incorrectly
- Integer-minute sums
- No attendance-rate output
- Employee without records default exclusion
- Employee without records optional inclusion
- Inactive employee with historical records included

### Overtime reporting

- Separate pre-shift and post-shift columns on one daily row
- Rest-day overtime totals
- Holiday-work totals
- Holiday type breakdown
- Pending minutes excluded from approved totals
- Rejected minutes excluded from approved totals
- Superseded approved minutes excluded from approved totals
- Active approved minutes included exactly once
- Non-qualifying detection history does not create approved totals

### Exceptions

- Absent exception
- Missing clock-out exception
- Provisional or incomplete exception
- Unscheduled-attendance exception
- Late exception
- Undertime exception
- One date may produce multiple exception rows
- Corrected and recalculated are context only

### CSV

- Exact header contracts
- UTF-8 output
- Correct quoting
- Null versus zero behavior
- Integer-minute preservation
- `HH:MM` formatting
- Asia/Manila timestamps
- Formula-injection escaping
- Controlled filename
- 25,000-row rejection

### XLSX

- Exact four worksheet names
- Frozen headers
- Auto-filter
- Column contracts
- Numeric minute cells
- Plain-text formula-like values
- No hidden sensitive worksheet
- Per-sheet row-limit rejection
- Same normalized totals as CSV and screen datasets

### Authorization and security

- HR Admin access
- Super Admin access
- Employee rejection
- Manager rejection
- Fixed function search paths
- Internal helper revocation
- Protected fields absent from function outputs
- Export endpoints reject unauthorized users
- Private no-store headers
- No raw database errors

### Audit

- Successful CSV export creates audit event
- Successful XLSX export creates audit event
- `employee_id` is null for organization-wide export events
- Safe metadata only
- Per-sheet row counts for XLSX
- Generated rows excluded
- Sensitive values excluded
- Generation failure creates no success audit event
- Audit failure blocks download

### Integration

- `/reports` loads current-month Payroll mode by default
- Operational mode separates finalized and provisional totals
- Shared filters affect every tab consistently
- Tab-specific filters affect only their dataset
- Pagination remains stable
- Daily CSV matches Daily Attendance screen data
- Summary CSV matches Employee Summary data
- XLSX totals match normalized datasets
- Existing employee attendance and overtime pages remain unchanged

## 25. Final verification

```bash
npm test
npx tsc --noEmit
npm run build
```

Required route:

```text
/reports
```

Required export handlers:

```text
/api/reports/export/csv
/api/reports/export/xlsx
```

Database verification must confirm:

- Public reporting functions exist.
- Every public reporting function is `SECURITY DEFINER`.
- Search paths are fixed.
- Employee and manager calls are rejected.
- Internal helpers are revoked.
- Report outputs exclude protected fields.
- Export limits are enforced in the database and application layers.

## 26. Acceptance criteria

```text
[ ] HR Admin and Super Admin can access /reports
[ ] Employee and manager roles cannot access reports or exports
[ ] Current month is the default Asia/Manila range
[ ] Operational mode accepts at most 31 inclusive days
[ ] Payroll mode accepts at most 366 inclusive days
[ ] Future dates are rejected
[ ] Operational mode separates finalized and provisional totals
[ ] Payroll mode uses finalized active attendance revisions only
[ ] Superseded attendance revisions are excluded
[ ] Current organization fields are clearly identified as current values
[ ] Inactive employees with matching records remain reportable
[ ] Employees without records are optional in summary only
[ ] Daily report uses one row per employee per date
[ ] Pre-shift and post-shift overtime remain separate on the daily row
[ ] Pending, rejected, and superseded overtime contribute zero approved minutes
[ ] Active approved overtime is counted once
[ ] Holiday work is separated by approved holiday type
[ ] Missing clock-out exports blank worked minutes
[ ] Absence exports zero worked minutes
[ ] Holiday without attendance exports zero worked minutes
[ ] Exceptions support multiple rows per attendance date
[ ] Screen reports use server-side pagination
[ ] CSV exports include full filtered datasets within the row limit
[ ] XLSX contains all four approved worksheets
[ ] CSV and XLSX use the same normalized report data
[ ] Integer minutes remain authoritative
[ ] HH:MM durations are included
[ ] Formula injection is prevented
[ ] Export files are not stored
[ ] Successful exports create safe audit records
[ ] Audit failure blocks download
[ ] Protected notes, reasons, and sensitive identifiers are never returned
[ ] All automated tests pass
[ ] TypeScript passes
[ ] Production build passes
```

## 27. Forward compatibility

Phase 5C establishes report and export contracts that later phases may consume without calculating payroll.

- Phase 6 may add leave-related report columns and replace the temporary absence-only view with leave-aware categories.
- Phase 8 may reuse safe summary functions for dashboard analytics.
- Phase 9 may add notifications for unresolved attendance exceptions.
- Phase 10 may consume finalized attendance and approved overtime minute fields when payroll periods, rates, and locking are introduced.
- Payroll-period locks and immutable export snapshots remain explicitly deferred to Phase 10.
