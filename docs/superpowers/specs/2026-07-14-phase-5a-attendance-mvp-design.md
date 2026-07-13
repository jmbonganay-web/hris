# Phase 5A — Attendance MVP Design Specification

**Status:** Approved design, pending final written-spec review  
**Date:** 2026-07-14  
**Project:** Northstar HRIS  
**Stack:** Next.js App Router, TypeScript, Supabase PostgreSQL/Auth/RLS, existing employee audit history

## 1. Context

The HRIS currently includes employee management, organization management, expanded employee profiles, protected government/payroll details, encrypted HR notes, and immutable employee activity history.

The existing application already has:

- a placeholder `/attendance` page backed by mock data;
- a mock attendance block on `/dashboard`;
- role-aware authentication using `employee`, `hr_admin`, and `super_admin`;
- Supabase row-level security patterns;
- protected Server Actions and security-definer PostgreSQL functions;
- `employee_audit_logs` for immutable activity history.

Phase 5A replaces the attendance mock UI with a production MVP. It deliberately excludes schedules, lateness, undertime, overtime, holidays, leave reconciliation, split shifts, and overnight shifts. Those belong in Phase 5B or later.

## 2. Goals

Phase 5A must provide:

1. Employee clock-in and clock-out using server-authoritative timestamps.
2. One attendance session per employee per company date.
3. A company timezone fixed initially to `Asia/Manila`.
4. Employee attendance history and correction-request history.
5. HR Admin and Super Admin attendance management.
6. Direct HR creation and correction of attendance records with a required reason.
7. Employee correction requests with HR approval or rejection.
8. Blocking of new clock-ins while a previous attendance record remains open.
9. Immutable audit coverage without storing free-text notes or reasons in audit JSON.
10. Role-safe pages, Server Actions, database functions, and RLS policies.

## 3. Non-goals

Phase 5A does not include:

- work schedules;
- grace periods;
- late, undertime, overtime, or absence calculations;
- payroll calculations;
- multiple clock sessions or break tracking;
- GPS capture;
- selfie verification;
- device restrictions;
- geofencing;
- overnight shifts;
- manager/direct-report attendance access;
- permanent deletion of attendance records or correction requests;
- cron-based midnight processing;
- automatic clock-out at 11:59 PM;
- attendance exports or payroll reports.

## 4. Approved product decisions

### 4.1 Attendance recording model

Use a hybrid model:

- Employees clock in and clock out.
- HR Admin and Super Admin can create or correct attendance records.
- Manual changes require a reason and are audited.

### 4.2 Clock verification

Use one-click clock actions with server-generated timestamps.

- Optional employee note.
- No GPS.
- No selfie.
- No device restriction.

### 4.3 Timezone

- Store timestamps as `timestamptz` in UTC.
- Calculate company dates in `Asia/Manila`.
- Display attendance in `Asia/Manila`.
- A Phase 5A workday is the local calendar day from 12:00 AM through 11:59:59.999 PM.

### 4.4 Daily session limit

- One clock-in and one clock-out per employee per company date.
- No breaks or split shifts.

### 4.5 Missed clock-out

- A previous open attendance record becomes an effective **Missing clock-out** state after the company date changes.
- Employees cannot clock in again until the previous open record is resolved.
- HR may close or correct the record with a required reason.

### 4.6 Correction requests

Employees can request:

- a missing clock-in;
- a missing clock-out;
- a changed clock-in;
- a changed clock-out.

Rules:

- The reason is required.
- An optional request note is allowed.
- Only one pending request per employee and attendance date is allowed.
- Requests may cover attendance dates no more than 30 calendar days before the current company date.
- Future dates are not allowed.
- HR Admin and Super Admin can approve or reject.
- A reviewer cannot review their own request.
- Approved requests immediately create or update official attendance.
- Rejected requests leave official attendance unchanged.

### 4.7 Visibility

- Employees can view only their own attendance records and correction requests.
- HR Admin and Super Admin can view all attendance records and correction requests.
- Managers receive no direct-report access in Phase 5A.

## 5. Architecture

Phase 5A uses two primary domain tables:

1. `attendance_records` — the official daily attendance record.
2. `attendance_correction_requests` — employee-submitted proposed changes.

Business-critical writes are handled by transaction-safe PostgreSQL functions invoked from protected Server Actions. This keeps timestamp generation, duplicate prevention, correction approval, and audit insertion atomic.

### 5.1 Layer responsibilities

#### PostgreSQL

Owns:

- server-authoritative timestamps;
- company-date calculation;
- row locking;
- duplicate prevention;
- open-record blocking;
- clock-in and clock-out transactions;
- direct HR creation and correction transactions;
- correction-request creation, cancellation, approval, and rejection transactions;
- immutable audit insertion;
- RLS.

#### Next.js Server Actions

Own:

- authentication entry points;
- role-aware route orchestration;
- form parsing;
- user-facing validation messages;
- invoking protected RPCs;
- cache revalidation;
- redirect outcomes.

#### Server-rendered queries

Own:

- role-safe record retrieval;
- effective-status derivation;
- date and status filtering;
- pagination;
- company-timezone formatting.

#### Client components

Own only:

- form interaction;
- confirmation prompts;
- pending-button states;
- responsive presentation.

Client code must never decide official timestamps or authorization.

## 6. Canonical data model

## 6.1 `attendance_records`

One row represents one employee on one company date.

```text
id uuid primary key
employee_id uuid not null
attendance_date date not null
clock_in_at timestamptz not null
clock_out_at timestamptz null
clock_in_note text null
clock_out_note text null
status text not null
is_corrected boolean not null default false
last_corrected_at timestamptz null
last_corrected_by uuid null
last_correction_reason text null
created_by uuid not null
created_at timestamptz not null
updated_at timestamptz not null
```

### Constraints

- Foreign key: `employee_id -> employees.id`.
- Foreign keys: `created_by`, `last_corrected_by -> profiles.id`.
- Unique: `(employee_id, attendance_date)`.
- `clock_out_at` must be null or later than `clock_in_at`.
- `clock_in_note` and `clock_out_note` are each limited to 1,000 characters.
- `last_correction_reason` is limited to 1,000 characters.
- No permanent-delete application flow.

### Stored operational statuses

```text
clocked_in
completed
```

### Effective operational statuses

```text
clocked_in
completed
missing_clock_out
```

`missing_clock_out` is derived when:

```text
attendance_date < current Asia/Manila date
and clock_out_at is null
```

It is intentionally not persisted at midnight because Phase 5A has no scheduler.

`is_corrected` is separate from operational status. This allows a corrected record to remain operationally `clocked_in`, `completed`, or effectively `missing_clock_out`. The UI shows **Corrected** as a secondary badge or column rather than replacing the operational status.

### Design refinement: separate clock notes

The approved discussion referred to one optional employee note during clock-in or clock-out. The written specification uses `clock_in_note` and `clock_out_note` so a clock-out note cannot overwrite a clock-in note. Both remain excluded from audit JSON.

## 6.2 `attendance_correction_requests`

```text
id uuid primary key
employee_id uuid not null
attendance_record_id uuid null
attendance_date date not null
request_type text not null
requested_clock_in_at timestamptz null
requested_clock_out_at timestamptz null
reason text not null
employee_note text null
status text not null
requested_by uuid not null
reviewed_by uuid null
reviewed_at timestamptz null
review_note text null
created_at timestamptz not null
updated_at timestamptz not null
```

### Request types

```text
add_missing_clock_in
add_missing_clock_out
change_clock_in
change_clock_out
```

### Request statuses

```text
pending
approved
rejected
cancelled
```

### Constraints

- `employee_id -> employees.id`.
- `attendance_record_id -> attendance_records.id`, nullable for a fully missing day.
- `requested_by`, `reviewed_by -> profiles.id`.
- `reason`, `employee_note`, and `review_note` are each limited to 1,000 characters.
- One pending request per `(employee_id, attendance_date)` using a partial unique index where `status = 'pending'`.
- No permanent-delete application flow.

### Request-type field rules

#### `add_missing_clock_in`

- Used when no official record exists for the date.
- `requested_clock_in_at` is required.
- `requested_clock_out_at` is optional, allowing one request to propose a complete missing day.

#### `add_missing_clock_out`

- Requires an existing open attendance record.
- `requested_clock_out_at` is required.

#### `change_clock_in`

- Requires an existing attendance record.
- `requested_clock_in_at` is required.

#### `change_clock_out`

- Requires an existing record with a clock-out.
- `requested_clock_out_at` is required.

## 7. Time handling

## 7.1 Company-timezone source

Phase 5A uses a single canonical constant:

```text
Asia/Manila
```

TypeScript and SQL must use the same value. Making the timezone configurable is deferred until a later settings phase.

## 7.2 Employee clock actions

Employee clock-in and clock-out timestamps come from PostgreSQL `now()` inside the transaction.

The browser may show the current time but cannot submit the official timestamp.

## 7.3 HR custom timestamps

Only HR Admin and Super Admin may submit custom clock timestamps.

The server must parse them as company-local date/time and convert them to UTC before persistence, or pass structured local values to a PostgreSQL function that performs the conversion consistently.

## 7.4 Attendance-date validation

For HR creation, HR correction, and correction approval:

- The local date of `clock_in_at` in `Asia/Manila` must equal `attendance_date`.
- The local date of `clock_out_at`, when present, must also equal `attendance_date`.
- Overnight timestamps are rejected in Phase 5A.
- `clock_out_at` must be later than `clock_in_at`.

## 8. Authorization model

## 8.1 Employee

Employees may:

- clock in for themselves;
- clock out for themselves;
- view only their own attendance records;
- view only their own correction requests;
- create a correction request for themselves;
- cancel only their own pending request.

Employees may not:

- submit custom official timestamps through clock actions;
- directly update attendance rows;
- directly delete attendance rows;
- approve or reject requests;
- access admin attendance routes;
- view another employee’s attendance;
- clock in while any earlier attendance row is still open.

## 8.2 HR Admin

HR Admin may:

- view all attendance records;
- view all correction requests;
- create a missing attendance record;
- correct an existing record;
- close an open previous record;
- approve or reject pending correction requests;
- view attendance audit history.

HR Admin may not:

- permanently delete attendance records or requests;
- review a correction request they submitted for their own employee identity.

## 8.3 Super Admin

Super Admin has the same attendance operations as HR Admin plus unrestricted administrative oversight within Phase 5A.

The self-review prohibition still applies: a Super Admin cannot approve or reject their own correction request.

## 9. Row-level security

## 9.1 `attendance_records`

Policies:

- Employee `SELECT`: rows whose employee record has `profile_id = auth.uid()`.
- HR Admin/Super Admin `SELECT`: all rows.
- No direct employee `INSERT`, `UPDATE`, or `DELETE` policies.
- No direct HR `DELETE` policy.
- Writes occur through protected security-definer functions with explicit authorization checks.

## 9.2 `attendance_correction_requests`

Policies:

- Employee `SELECT`: own requests only.
- HR Admin/Super Admin `SELECT`: all requests.
- No direct `UPDATE` or `DELETE` policies for employees.
- Request creation, cancellation, approval, and rejection occur through protected functions.

## 9.3 Function security

Every privileged attendance function must:

- use `security definer` only when required;
- set a fixed `search_path` such as `pg_catalog, public`;
- verify `auth.uid()` explicitly;
- verify the actor’s role explicitly;
- validate employee ownership explicitly;
- be revoked from `public` and `anon`;
- be granted only to `authenticated` when it is an intended application RPC;
- return safe business errors rather than database internals.

## 10. Core workflows

## 10.1 Employee clock-in

A protected RPC performs:

1. Resolve `auth.uid()` to the employee row.
2. Calculate the current `Asia/Manila` company date.
3. Lock attendance state for that employee.
4. Reject when an earlier record exists with `clock_out_at is null`.
5. Reject when a row already exists for today.
6. Insert today’s row with PostgreSQL `now()` as `clock_in_at`.
7. Set stored status to `clocked_in`.
8. Save optional `clock_in_note` after trimming and length validation.
9. Insert `attendance.clocked_in` into `employee_audit_logs`.
10. Commit atomically.

Double-clicks, multiple tabs, and simultaneous requests must not create duplicate rows.

## 10.2 Employee clock-out

A protected RPC performs:

1. Resolve the employee.
2. Calculate the current company date.
3. Lock today’s attendance row.
4. Reject if no row exists.
5. Reject if `clock_out_at` is already present.
6. Reject if the row belongs to an earlier date; HR must resolve it.
7. Set `clock_out_at = now()`.
8. Set stored status to `completed`.
9. Save optional `clock_out_note`.
10. Insert `attendance.clocked_out` audit activity.
11. Commit atomically.

## 10.3 Previous open record

An earlier row with no clock-out:

- appears as **Missing clock-out**;
- blocks a new clock-in;
- exposes a correction-request action to the employee;
- exposes correction controls to HR.

### Written-spec clarification

Because Phase 5A intentionally has no cron or scheduled job, the transition to **Missing clock-out** is derived rather than written at midnight. Therefore Phase 5A does not create a standalone `attendance.missing_clock_out` audit event. The audit trail contains the original clock-in and the later correction/request events. This avoids fabricated transition timestamps and mutation-on-read behavior.

## 10.4 Direct HR record creation

HR supplies:

- employee;
- attendance date;
- clock-in timestamp;
- optional clock-out timestamp;
- required correction reason;
The transaction:

1. Confirms HR role.
2. Validates the employee and date.
3. Rejects duplicate employee/date rows.
4. Validates local dates and ordering.
5. Inserts the official row.
6. Stores `created_by` and correction metadata.
7. Sets operational status to `completed` when clock-out exists, otherwise `clocked_in`.
8. Sets `is_corrected = true` and stores the required correction metadata.
9. Inserts `attendance.created_by_hr` audit activity.
10. Commits atomically.

For a past date with no clock-out, the effective status is immediately **Missing clock-out**.

## 10.5 Direct HR correction

The transaction:

1. Confirms HR role.
2. Locks the target row.
3. Validates proposed timestamps.
4. Requires a non-empty correction reason.
5. Updates only approved attendance fields.
6. Sets operational status to `completed` when clock-out exists, otherwise `clocked_in`.
7. Sets `is_corrected = true`.
8. Sets `last_corrected_at`, `last_corrected_by`, and `last_correction_reason`.
9. Inserts `attendance.corrected` with safe before/after values.
10. Commits atomically.

Attendance rows are never deleted to hide mistakes.

## 10.6 Employee correction-request creation

The transaction:

1. Resolves the requester to their employee row.
2. Validates the attendance date is not future and is at most 30 days old.
3. Validates the request type and required proposed fields.
4. Verifies the referenced attendance row belongs to the requester and date.
5. Rejects when a pending request already exists for that employee/date.
6. Stores the reason and optional note outside audit JSON.
7. Inserts the request as `pending`.
8. Inserts `attendance_correction.requested`.
9. Commits atomically.

Official attendance remains unchanged.

## 10.7 Employee request cancellation

The transaction:

1. Confirms ownership.
2. Locks the request.
3. Confirms status is `pending`.
4. Sets status to `cancelled`.
5. Inserts `attendance_correction.cancelled`.
6. Commits atomically.

Official attendance remains unchanged.

## 10.8 Correction-request approval

The transaction:

1. Confirms reviewer is HR Admin or Super Admin.
2. Locks the request.
3. Confirms status is `pending`.
4. Rejects when `requested_by = auth.uid()`.
5. Revalidates all requested timestamps against current data.
6. Creates or updates the official attendance row.
7. Sets operational status to `completed` when clock-out exists, otherwise `clocked_in`.
8. Sets `is_corrected = true` and stores correction metadata.
9. Marks the request `approved` with reviewer and review time.
10. Inserts `attendance.corrected`.
11. Inserts `attendance_correction.approved`.
12. Commits atomically.

The two audit rows are intentional because they describe different entities: the official record changed and the request was approved.

## 10.9 Correction-request rejection

The transaction:

1. Confirms HR role.
2. Locks the request.
3. Confirms it is pending.
4. Rejects self-review.
5. Marks it `rejected`.
6. Stores reviewer, review time, and optional review note.
7. Inserts `attendance_correction.rejected`.
8. Commits atomically.

Official attendance remains unchanged.

## 11. Audit design

Reuse `employee_audit_logs`.

### Entity types

```text
attendance
attendance_correction
```

### Phase 5A actions

```text
attendance.clocked_in
attendance.clocked_out
attendance.created_by_hr
attendance.corrected
attendance_correction.requested
attendance_correction.approved
attendance_correction.rejected
attendance_correction.cancelled
```

### Safe changed fields

```text
attendance_date
clock_in_at
clock_out_at
status
is_corrected
request_type
request_status
```

### Safe before/after values

Audit JSON may contain:

- attendance date;
- prior and new clock-in timestamps;
- prior and new clock-out timestamps;
- prior and new operational status;
- prior and new `is_corrected` value;
- request type;
- prior and new request status.

### Prohibited audit content

Audit JSON must never contain:

- `clock_in_note`;
- `clock_out_note`;
- correction reason;
- request reason;
- request employee note;
- review note;
- raw form payloads;
- database errors;
- authentication tokens.

Audit rows remain immutable under the Phase 4B-2 policies.

## 12. Routes and navigation

## 12.1 Employee routes

### `/attendance`

Replaces the current mock page.

Contains:

- today’s attendance card;
- company date and timezone;
- clock-in or clock-out control;
- previous-open-record warning;
- recent attendance history;
- status filter;
- date-range filter;
- correction-request entry points;
- link to request history.

### `/attendance/corrections`

Contains employee-owned requests grouped or filterable by:

- pending;
- approved;
- rejected;
- cancelled;
- all.

### `/attendance/corrections/new`

Supports:

```text
/attendance/corrections/new?record=<attendance-id>
/attendance/corrections/new?date=YYYY-MM-DD
```

The form only exposes fields relevant to the selected request type.

## 12.2 HR routes

### `/admin/attendance`

Contains:

- company-date filter;
- employee search;
- department filter;
- effective-status filter;
- responsive attendance table;
- missing-clock-out indicators;
- create-record action;
- correct-record action.

### `/admin/attendance/[employeeId]`

Contains:

- employee summary;
- attendance history;
- open/missing records;
- correction history;
- direct create/correct controls.

### `/admin/attendance/corrections`

Contains:

- pending requests first;
- employee;
- attendance date;
- request type;
- current and requested timestamps;
- reason;
- submission date;
- status filters.

### `/admin/attendance/corrections/[requestId]`

Contains:

- employee details;
- official attendance;
- requested values;
- employee reason;
- optional employee note;
- validation warnings;
- approve and reject controls.

## 12.3 Dashboard

Replace the mock attendance block with role-aware production data.

### Employee dashboard card

States:

- Not clocked in;
- Clocked in;
- Completed;
- Missing clock-out action required.

Shows:

- company date;
- timezone;
- latest saved timestamp;
- clock action;
- link to `/attendance`.

### HR dashboard

May show a compact attendance summary using real data, but detailed attendance management remains under `/admin/attendance`.

The pending-request badge is optional and should be included only if it does not add expensive global-layout queries.

## 12.4 Sidebar

The current sidebar is static and role-agnostic. Phase 5A must make attendance navigation role-aware without unrelated navigation refactoring.

- Employee label: **My Attendance** → `/attendance`.
- HR Admin/Super Admin label: **Attendance** → `/admin/attendance`.
- HR Admin/Super Admin secondary link: **Correction Requests** → `/admin/attendance/corrections`.

The existing authenticated layout already knows the user role, so the role should be passed to the sidebar through `AppShell` rather than re-queried client-side.

## 13. UI behavior

## 13.1 Attendance card states

### Not clocked in

```text
Today’s attendance
Not clocked in
[Optional note]
[Clock in]
```

### Clocked in

```text
Today’s attendance
Clocked in at 8:03 AM
[Optional clock-out note]
[Clock out]
```

### Completed

```text
Today’s attendance
Completed
Clock in: 8:03 AM
Clock out: 5:06 PM
```

### Missing clock-out

```text
Attendance action required
Your attendance for <date> is missing a clock-out.
Submit a correction request or contact HR before clocking in again.
[Request correction]
```

## 13.2 Status labels

Visible text must accompany color:

- Clocked in;
- Completed;
- Missing clock-out;
- Not clocked in, as a UI-only state.

A separate visible **Corrected** badge or column appears when `is_corrected = true`.

## 13.3 Responsive behavior

At mobile widths:

- employee history and correction-request tables become stacked record cards; the admin attendance table uses a compact responsive layout with a card fallback;
- primary controls remain at least 44px high;
- filters stack vertically;
- timestamps remain readable;
- long reasons and review notes wrap safely;
- no horizontal scrolling is required for correction actions;
- HR-entered company-local values use native `datetime-local` controls and explicit `Asia/Manila` labeling.

## 14. Validation rules

## 14.1 Shared text validation

For every free-text attendance field:

- trim surrounding whitespace;
- convert empty optional text to null;
- enforce a maximum of 1,000 characters;
- render as text, never HTML;
- never log the text.

## 14.2 Employee clock actions

- Note only; no custom timestamp accepted.
- Must have an active employee row linked to the authenticated profile.
- Duplicate clock-in returns the current valid state.
- Duplicate clock-out returns the current valid state or a safe already-completed message.

## 14.3 HR attendance timestamps

- Required clock-in.
- Optional clock-out.
- Clock-out later than clock-in.
- Both timestamps, when present, must map to `attendance_date` in `Asia/Manila`.
- Future attendance dates are rejected unless explicitly added in a later phase.

## 14.4 Correction request window

Allowed when:

```text
0 <= current_company_date - attendance_date <= 30 calendar days
```

## 15. Error handling

User-facing errors must be clear and must not expose Supabase or SQL internals.

Examples:

```text
You already clocked in today.
You already clocked out today.
Resolve the missing clock-out from July 14 before clocking in again.
No active attendance record was found for today.
This correction request is no longer pending.
The requested clock-out must be later than the clock-in.
You can only request changes for the previous 30 calendar days.
You cannot review your own correction request.
Attendance could not be saved. Please try again.
```

Raw constraint names, SQL messages, stack traces, and Supabase response objects must not be rendered or logged with protected text.

## 16. Query and pagination behavior

## 16.1 Employee attendance history

- Default newest first.
- Stable ordering by `attendance_date DESC, id DESC`.
- Server-side date and status filters.
- Page size is 20 records, matching the existing Activity timeline.

## 16.2 Admin attendance list

- Server-side pagination.
- Stable ordering.
- Employee search by supported employee fields.
- Department and effective-status filters.
- Effective missing-clock-out filtering may require a specific query branch rather than comparing only the stored `status` column.

## 16.3 Correction queue

- Pending first by default.
- Within a status, oldest pending requests first to support fair review.
- Stable tie-breaker by ID.

## 17. Testing strategy

## 17.1 Unit tests

Cover:

- `Asia/Manila` date conversion;
- company-date calculation near UTC midnight;
- effective missing-clock-out derivation;
- 30-day request window boundaries;
- timestamp ordering;
- same-company-date validation;
- request-type field requirements;
- note/reason length limits;
- safe audit presentation.

## 17.2 Migration and source-security tests

Verify:

- both tables exist;
- unique employee/date constraint;
- partial unique pending-request index;
- check constraints;
- no attendance delete policy;
- no direct employee attendance update policy;
- fixed function search paths;
- RPC execute privileges are restricted;
- self-review checks exist;
- audit payload builders exclude all free-text fields.

## 17.3 Transaction tests

Where the available test environment permits database integration, verify:

- simultaneous clock-ins produce one row;
- clock-out is atomic with audit insertion;
- approval either updates attendance and request together or changes neither;
- stale approval attempts fail;
- self-review fails;
- duplicate pending requests fail.

When integration testing against Supabase is unavailable in the local test harness, enforce contracts through SQL source tests plus manual database QA.

## 17.4 Server Action tests

Cover:

- successful clock-in;
- duplicate clock-in;
- successful clock-out;
- clock-out without a record;
- duplicate clock-out;
- prior open record blocks clock-in;
- HR record creation;
- HR correction;
- employee request creation;
- employee request cancellation;
- approval;
- rejection;
- stale request review;
- self-review rejection;
- role-gated direct routes.

## 17.5 Manual role QA

### Employee

- Can clock in and out only for self.
- Sees only own history and requests.
- Cannot access `/admin/attendance` routes.
- Cannot clock in with a prior open record.

### HR Admin

- Sees all attendance.
- Can create and correct records.
- Can approve/reject others’ requests.
- Cannot review own request.

### Super Admin

- Has HR attendance capabilities.
- Cannot review own request.

### Audit

- Expected actions appear once.
- Approval produces one attendance correction event and one request approval event.
- Free-text notes and reasons never appear in audit JSON.
- Audit rows remain immutable.

## 18. Deployment sequence

1. Verify a clean Phase 4B-2 baseline.
2. Apply the Phase 5A migration to Supabase.
3. Reload PostgREST schema.
4. Deploy the application code.
5. Run role-based smoke tests.
6. Run clock and correction workflows with disposable test records.
7. Inspect audit rows for prohibited content.
8. Verify production build and tests.

Application code must not be deployed before the required database functions and tables exist.

## 19. Acceptance criteria

Phase 5A is complete when:

- employees can clock in once and clock out once per company date;
- timestamps are generated by PostgreSQL for employee clock actions;
- all display and date rules use `Asia/Manila`;
- earlier open records block new clock-ins;
- employees can view only their own attendance;
- employees can submit and cancel valid correction requests;
- requests older than 30 days or for future dates are rejected;
- HR can create and correct attendance with a required reason;
- HR can approve or reject others’ requests;
- self-review is blocked;
- approvals update official attendance atomically;
- attendance and correction audit actions are written safely;
- audit JSON contains no notes, reasons, or review text;
- no attendance record or request has a permanent-delete UI or policy;
- employee and admin routes are role-protected;
- the mock attendance UI is fully replaced;
- automated tests pass;
- TypeScript passes;
- the production build passes;
- manual Supabase and role QA pass.

## 20. Deferred Phase 5B integration points

Phase 5B may add:

- schedule assignments;
- shift definitions;
- overnight shifts;
- grace periods;
- late and undertime rules;
- overtime calculation;
- break and split-shift sessions;
- holidays and rest days;
- absence calculation;
- configurable company timezone.

Phase 5A must avoid embedding any hard-coded lateness or payroll calculation into the attendance record model.
