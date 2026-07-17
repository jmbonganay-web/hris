# Phase 9 Notifications, Reminders, and Escalations Design

## Goal

Add a unified, in-app notification system that delivers immediate operational alerts, runs one daily reminder and escalation cycle at 8:00 AM Asia/Manila, supports configurable per-type timing, and preserves strict role and data-access boundaries.

## Approved direction

- Delivery is in-app only. Email, SMS, mobile push, and web push are excluded.
- Immediate workflow events continue to create notifications as soon as they occur.
- One scheduled reminder cycle runs daily at 8:00 AM Asia/Manila.
- Escalation is gentle: one initial alert, one daily reminder while unresolved, then escalation after the configured threshold.
- Timing is configurable independently by notification type.
- Escalation follows the role hierarchy Employee → Direct Manager → HR Admin → Super Admin, with module-specific routing where the responsible actor starts later in that chain.
- Resolved notifications are retained for 90 days, then archived. Phase 9 does not hard-delete notification history.
- The application receives a full `/notifications` center rather than a compact dropdown.
- Super Admins manage rules at `/admin/notifications/settings`; HR Admins may view active rules but cannot change them.
- The first release uses Supabase PostgreSQL and `pg_cron`; it does not require an Edge Function or external scheduler.
- Existing Phase 1–8 behavior, authorization boundaries, and the Balanced spacing system remain compatible.

## Notification types and approved defaults

The seeded rules are editable by Super Admins.

| Type code | Module | Initial alert or reminder | Repeat interval | First escalation |
|---|---|---:|---:|---:|
| `attendance_exception` | Attendance | After 1 day unresolved | Daily | After 3 days unresolved |
| `leave_approval_pending` | Leave | After 1 day pending | Daily | After 3 days pending |
| `overtime_approval_pending` | Overtime | After 1 day pending | Daily | After 3 days pending |
| `document_review_pending` | Documents | After 2 days pending | Daily | After 5 days pending |
| `document_expiring` | Documents | 30 days before expiry | Daily | 7 days before expiry |
| `document_expired` | Documents | Immediately on expiry | Daily | After 3 days unresolved |

Every seeded rule uses a 90-day retention period after resolution. The configuration model allows a rule to be enabled or disabled without deleting previous notifications or events.

## Recipient and escalation routing

### Attendance exception

- Initial recipient: the affected employee.
- Level 1 escalation: the employee's current direct manager.
- Level 2 escalation: active HR Admin users.
- Level 3 escalation: active Super Admin users.
- Manager and higher-role messages contain only the employee's safe display name, exception date, broad exception category, and a permitted action link.

### Pending leave approval

- Initial recipient: the current authorized approver derived from the existing leave workflow.
- When the current approver is a manager, escalation continues to HR Admin and then Super Admin.
- When the current approver is already HR Admin, the next escalation is Super Admin.
- Employees continue to receive immediate decision notifications through the leave workflow, but they do not receive approval-reminder notifications intended for approvers.

### Pending overtime approval

- Initial recipient: the current authorized approver derived from the existing overtime workflow.
- Escalation follows the same approver → HR Admin → Super Admin pattern as leave.
- The notification never exposes private notes or unrelated attendance details.

### Pending document review

- Initial recipients: active HR Admin users with `documents.review`; Super Admins retain implicit review access.
- The daily job creates one recipient-specific notification for each eligible reviewer without duplicating it on subsequent runs.
- After the configured threshold, unresolved reviews are escalated to all active Super Admins.
- Employees do not receive reviewer reminders; they continue to receive employee-safe submission and decision notifications.

### Expiring document

- Initial recipient: the employee 30 days before expiry.
- At 7 days before expiry, the direct manager receives a status-only escalation when one exists.
- HR Admins receive an operational escalation when the item reaches expiry through the `document_expired` rule.
- No manager notification contains a document filename, file link, reference number, issuing organization, notes, custom metadata, or review reason.

### Expired document

- Initial recipient: the employee immediately when the approved active document becomes expired.
- Level 1 escalation: direct manager, status-only.
- Level 2 escalation: active HR Admin users after 3 unresolved days.
- Level 3 escalation: active Super Admin users after an additional configured escalation interval.

## Notification lifecycle

Each recipient-specific notification follows this lifecycle:

```text
unread → read ↔ unread
unread/read → dismissed
unread/read/dismissed → resolved
resolved → archived after retention period
```

- Reading a notification records `read_at` but does not resolve the underlying issue.
- Marking unread clears the read state and records an immutable event.
- Dismissal hides the notification from the default active view for that recipient but does not resolve the source issue and does not block future escalation to other recipients.
- Resolution is driven by the source record state, not by recipient action.
- Archived notifications remain queryable through the archived filter but are excluded from unread counts and active reminders.
- If a dismissed issue remains unresolved and the same recipient reaches a later escalation stage, a new stage-specific notification may be created.

The scheduled cycle resolves active notifications when the source issue is completed, approved, rejected, withdrawn, corrected, archived, deleted, or otherwise no longer qualifies.

## Data model

Phase 9 uses a forward-only migration after `202607170004_dashboard_analytics.sql`.

### Extend `public.notifications`

The existing Phase 7 table remains the authoritative notification identity table. Add:

```text
module                  text
priority                text
status                  text
resource_key            text
employee_id             uuid nullable
safe_context             jsonb
action_url              text nullable
reminder_count          integer
escalation_level        integer
first_notified_at       timestamptz
last_reminded_at        timestamptz nullable
next_reminder_at        timestamptz nullable
escalated_at            timestamptz nullable
resolved_at             timestamptz nullable
dismissed_at            timestamptz nullable
archived_at             timestamptz nullable
updated_at              timestamptz
```

Approved constraints:

- `module` is one of `attendance`, `leave`, `overtime`, `documents`, or `system`.
- `priority` is one of `info`, `normal`, `high`, or `urgent`.
- `status` is one of `unread`, `read`, `dismissed`, `resolved`, or `archived`.
- `reminder_count >= 0` and `escalation_level >= 0`.
- `safe_context` is validated by a protected payload guard before insert or update.
- `action_url` must be server-selected from an allowlist and must be a relative application path.
- Existing Phase 7 rows are backfilled to `module = 'documents'`, `priority = 'normal'`, and a lifecycle status derived from `read_at`.

The existing unique `(recipient_user_id, source_event_key)` contract remains. New scheduled keys use:

```text
<type-code>:<resource-key>:<recipient-user-id>:<escalation-level>
```

This makes each recipient and escalation stage independently idempotent.

### `public.notification_rules`

Stores the current editable rule configuration:

```text
id                       uuid primary key
type_code                text unique
module                   text
enabled                  boolean
initial_delay_days       integer nullable
repeat_interval_days     integer
escalation_after_days    integer nullable
lead_time_days           integer nullable
retention_days           integer
version                   integer
updated_by               uuid
updated_at               timestamptz
```

Validation rules:

- `repeat_interval_days >= 1`.
- `retention_days` is between 1 and 3650.
- Delay, lead-time, and escalation values are nonnegative whole numbers when present.
- Attendance, leave, overtime, and review rules require `initial_delay_days` and `escalation_after_days`.
- `document_expiring` requires `lead_time_days` and uses the escalation threshold relative to expiry.
- `document_expired` permits zero initial delay.

Rule edits update the current row through a protected Super Admin workflow and create an immutable event record containing old and new safe settings. Reset-to-default restores the approved matrix without deleting history.

### `public.notification_events`

Immutable activity history:

```text
id                     uuid primary key
notification_id        uuid
recipient_user_id      uuid
event_type             text
actor_user_id          uuid nullable
cycle_run_id           uuid nullable
request_id             uuid nullable
event_data             jsonb
created_at             timestamptz
```

`event_type` is one of:

```text
created
reminded
read
marked_unread
dismissed
escalated
resolved
archived
rule_changed
rule_reset
```

`event_data` contains counts, stage numbers, broad status codes, and configuration changes only. It cannot contain storage paths, signed URLs, file names, private review reasons, secret values, raw employee identifiers, bank details, government identifiers, or unrestricted custom metadata.

### `public.notification_cycle_runs`

Records each daily or manual cycle:

```text
id                     uuid primary key
run_date               date
run_source             text
status                 text
started_at             timestamptz
completed_at           timestamptz nullable
created_count          integer
reminded_count         integer
escalated_count        integer
resolved_count         integer
archived_count         integer
error_code             text nullable
safe_error_message     text nullable
rule_results           jsonb
created_by             uuid nullable
```

`run_source` is `scheduled` or `manual`. `status` is `running`, `succeeded`, `partial_failed`, or `failed`. `rule_results` stores only per-rule counts and stable error codes, allowing one rule to fail while other rule evaluations complete.

A unique partial index prevents two successful or running cycles for the same run date and source from overlapping unintentionally. An advisory transaction lock provides the primary overlap guard.

## Database workflows

The migration adds protected functions with fixed `search_path`, explicit role checks, revoked default execution privileges, stable error codes, and row locking where state may race.

### Recipient actions

```text
list_notification_center
get_unread_notification_count
mark_notification_read
mark_notification_unread
dismiss_notification
bulk_mark_notifications_read
bulk_dismiss_notifications
```

All recipient actions derive `auth.uid()` internally. The browser never supplies a recipient ID. Bulk operations reject IDs that do not belong to the current user rather than partially mutating another recipient's rows.

### Rule administration

```text
list_notification_rules
update_notification_rule
reset_notification_rules_to_defaults
get_notification_cycle_status
run_notification_cycle_now
```

- Super Admins may update/reset rules and run a manual cycle.
- HR Admins may call the read-only rule and cycle-status functions.
- Employees and managers cannot access configuration functions.

### Scheduling and processing

```text
run_daily_notification_cycle
process_attendance_notifications
process_leave_notifications
process_overtime_notifications
process_document_notifications
resolve_stale_notifications
archive_resolved_notifications
```

`run_daily_notification_cycle`:

1. Acquires a PostgreSQL advisory lock.
2. Creates a `notification_cycle_runs` row.
3. Loads enabled rules.
4. Executes each module processor in an exception-isolated block.
5. Upserts deterministic recipient-stage notifications.
6. Increments reminder state only when `next_reminder_at <= now()`.
7. Resolves notifications whose source no longer qualifies.
8. Archives resolved rows whose retention period has elapsed.
9. Records safe per-rule results and final status.

The public cycle entry point is callable by the cron job. A separate authenticated manual entry point requires Super Admin and records the actor. Internal processor functions are not executable by browser roles.

## Scheduling

Use the existing `pg_cron` extension already introduced by the attendance calculation phase.

The migration idempotently replaces the job named:

```text
hris-daily-notification-cycle
```

Cron expression:

```text
0 0 * * *
```

PostgreSQL cron runs in UTC, so this executes at 8:00 AM in `Asia/Manila`. The job calls the protected database function directly and records `run_source = 'scheduled'`.

## Immediate event-driven integration

Existing workflow functions continue to notify immediately, but new and existing insertions use one central protected helper that applies safe defaults, validates action URLs and payloads, and writes `notification_events`.

Phase 9 adds immediate alerts where missing:

- Leave request submitted, approved, rejected, cancelled, or withdrawn.
- Overtime request submitted, approved, rejected, or cancelled.
- Attendance exception created or corrected where the existing workflow provides a stable lifecycle event.
- Document submission, approval, rejection, and replacement request continue to use employee-safe messages.

Immediate event notifications may be event-only and do not require a scheduled rule. Scheduled reminder processors operate only on the six approved configurable rule types.

## Safe action URLs

The server selects action URLs from fixed route builders. Initial allowlist:

```text
/attendance
/leave
/overtime
/documents
/admin/documents/review
/admin/notifications/settings
```

A recipient receives only a URL they are authorized to open. Resource identifiers may be included only in server-generated query parameters or route segments supported by the target page. Arbitrary schemes, hosts, protocol-relative URLs, JavaScript URLs, and user-supplied paths are rejected.

## Notification center

Create `/notifications` as the single full management experience.

### Summary and filters

- Total unread count.
- Module filter: All, Attendance, Leave, Overtime, Documents, System.
- Status filter: Active, Unread, Read, Dismissed, Resolved, Archived.
- Priority filter.
- Date range filter.
- Safe title/body search; employee-name matching is available only when the recipient is already authorized to see that name.
- Pagination with a fixed server-side page size.

### Row and card content

Each item shows:

```text
title
body
module
priority
status
created time
last reminder time when present
reminder count when greater than zero
safe action link when present
```

Desktop uses an accessible table or structured list; mobile uses stacked cards. Read state, status, and priority remain understandable without relying on color alone.

### Actions

- Mark read.
- Mark unread.
- Dismiss.
- Open related record.
- Select multiple visible rows.
- Bulk mark read.
- Bulk dismiss.

Resolved and archived rows are read-only except that the related record may still be opened when the action remains authorized.

## App-shell integration

The authenticated dashboard layout loads only the unread aggregate count. The global shell receives no notification bodies or resource metadata.

- Add a Notifications navigation item linking to `/notifications`.
- Add an unread-count badge capped visually at `99+`.
- Preserve accurate accessible text for the full count.
- Refresh the count after recipient actions through route revalidation.

## Super Admin notification settings

Create `/admin/notifications/settings`.

The page includes:

- Current rule cards grouped by module.
- Enabled toggle.
- Initial delay.
- Daily repeat interval.
- Escalation threshold.
- Document lead time where applicable.
- Retention period.
- Reset-to-approved-defaults action.
- Last scheduled run, duration, counts, and status.
- Safe per-rule failure codes for partial runs.
- Manual “Run cycle now” action for Super Admins.

HR Admins may view this page in read-only mode. Employees and ordinary managers are redirected to `/notifications`.

## Dashboard integration

Phase 8 role dashboards receive compact summary widgets only:

- Employee: unread personal notifications and highest-priority current actions.
- Manager: direct-report escalations addressed to that manager.
- HR Admin: authorized approvals and HR escalations.
- Super Admin: system-wide escalated notifications and the latest failed or partial cycle status.

The widget links to `/notifications`; it does not duplicate the full filter or bulk-action interface.

## RLS and authorization

- `notifications` remains selectable only by `recipient_user_id = auth.uid()`.
- Direct inserts, updates, and deletes remain revoked from authenticated users.
- `notification_events`, rules, and cycle-run tables use RLS and protected projections/functions.
- Managers never receive direct table access to subordinate notifications.
- HR Admins do not receive global notification-row access; they receive only their own notification rows plus permitted aggregate configuration status.
- Super Admin configuration access is enforced inside protected functions, not only in the UI.
- Internal scheduled functions run with definer privileges but validate all selected data and output only safe fields.

## Safe payload constraints

A protected `assert_safe_notification_payload(jsonb)` rejects keys or values indicating:

```text
signed_url
storage_path
service_role
access_token
raw_file
filename
internal_reason
private_note
bank
account_number
government_id
custom_metadata
```

The guard is applied to `safe_context`, notification-event data, run-result JSON, and rule audit data. Notification list and count responses never include raw source-table records.

## Error handling and observability

Stable error codes include:

```text
NOTIFICATION_PERMISSION_DENIED
NOTIFICATION_NOT_FOUND
NOTIFICATION_INVALID_STATUS
NOTIFICATION_INVALID_RULE
NOTIFICATION_INVALID_ACTION_URL
NOTIFICATION_INVALID_PAYLOAD
NOTIFICATION_BULK_SELECTION_INVALID
NOTIFICATION_CYCLE_ALREADY_RUNNING
NOTIFICATION_CYCLE_FAILED
NOTIFICATION_RULE_PROCESSING_FAILED
```

- UI actions map these codes to safe messages.
- A single rule failure results in `partial_failed` when another rule succeeds.
- Failed processor details are limited to a stable error code and generic safe text.
- Retries remain safe because recipient-stage keys are deterministic.
- No secret, signed URL, raw SQL exception, private reason, or sensitive metadata enters application logs or cycle-run records.

## Retention

- Source resolution sets `resolved_at` and `status = 'resolved'`.
- The daily cycle archives a resolved notification when `resolved_at + retention_days <= now()`.
- Archiving sets `archived_at` and `status = 'archived'` and records an immutable event.
- Phase 9 does not permanently delete notification or event rows.
- Changing a rule's retention period affects unresolved and newly resolved items; already archived history remains archived.

## Responsive layout and accessibility

Use the established Balanced spacing tokens and existing dashboard/card patterns.

Required layout classes include:

```text
notification-center-layout
notification-summary-grid
notification-filter-grid
notification-list
notification-card
notification-bulk-actions
notification-settings-grid
notification-rule-form
notification-run-summary
```

- Desktop filters remain compact and aligned.
- Tablet layouts reduce columns without compressing labels or action buttons.
- Mobile layouts become one column with full-width primary actions.
- Checkboxes have associated labels.
- Bulk actions announce selection count.
- Status, module, and priority are exposed as text.
- Focus order follows visual order.
- Empty, loading, and error states are explicit and safe.

## Testing

### Database and security

- Migration creates and alters the approved tables, constraints, indexes, RLS policies, seeded rules, cron job, and protected functions.
- Cron schedule resolves to 8:00 AM Asia/Manila.
- Processing acquires an advisory lock and records each run.
- Deterministic source keys prevent duplicates across retries.
- Per-rule failures are isolated.
- Recipient actions cannot mutate another user's notifications.
- Rule changes are Super Admin-only; HR Admin rule access is read-only.
- Managers receive no direct-report notification rows or sensitive document fields.
- Payload guards reject forbidden fields.
- Resolved notifications archive after their configured retention period.

### Domain and query modules

- Normalize notification rows without leaking internal fields.
- Parse filters and pagination safely.
- Derive unread counts and `99+` display labels.
- Validate rule inputs and route allowlists.
- Map stable errors to safe user messages.
- Verify escalation recipient selection and stage progression.

### Server actions and UI

- Individual and bulk lifecycle actions call protected functions with generated request IDs.
- `/notifications` uses live queries and has no mock data.
- `/admin/notifications/settings` enforces read-only HR behavior and Super Admin mutations.
- Sidebar and app shell load aggregate counts only.
- Phase 8 dashboard widgets use safe summary projections.
- Loading and error boundaries render safe states.
- Balanced spacing regression tests cover required classes and mobile behavior.

### Release verification

Run:

```text
npm ci
npm test
npx tsc --noEmit
npm run build
```

When a local Supabase environment is available, apply the forward-only migration and verify the cron job, RLS, protected functions, seeded rules, recipient lifecycle actions, manual cycle, and scheduled idempotency with separate employee, manager, HR Admin, document reviewer, and Super Admin sessions.

## Acceptance criteria

### Employee

- Receives immediate personal workflow notifications.
- Receives daily reminders for unresolved personal attendance and document issues.
- Can read, unread, dismiss, and bulk-manage only their own notifications.
- Cannot edit rules or see another user's notification.

### Manager

- Receives only direct-report operational escalations addressed to the manager.
- Receives status-only document escalations.
- Cannot access document files, private metadata, or other managers' employees.

### HR Admin

- Receives authorized approval and escalation notifications.
- Can view active rules and cycle status.
- Cannot edit/reset rules or run the cycle manually unless also Super Admin.

### Super Admin

- Can edit each rule independently and restore approved defaults.
- Can run the cycle manually.
- Can see latest cycle status, counts, and safe failure codes.
- Receives final-stage system escalations.

### Scheduling and lifecycle

- Immediate event alerts are created once.
- Daily processing runs at 8:00 AM Asia/Manila.
- Daily retries do not create duplicate recipient-stage notifications.
- Reminders continue at the configured interval while unresolved.
- Escalation follows module-specific role routing.
- Source completion resolves active notifications automatically.
- Resolved notifications archive after 90 days by default.

## Exclusions

Phase 9 does not add email, SMS, push notifications, external schedulers, Supabase Edge Functions, user-configurable personal notification preferences, department-specific escalation chains, arbitrary action URLs, predictive alerts, permanent notification deletion, or cross-organization tenants.
