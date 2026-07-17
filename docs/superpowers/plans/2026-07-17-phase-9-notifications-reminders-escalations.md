# Phase 9 Notifications, Reminders, and Escalations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a unified in-app notification center with immediate workflow alerts, configurable daily reminders, role-based escalations, safe lifecycle actions, cron monitoring, and role-specific dashboard summaries.

**Architecture:** PostgreSQL remains the source of truth for notification identities, rule settings, recipient-stage idempotency, lifecycle events, scheduled processing, resolution, and archival. A single forward-only migration extends the Phase 7 `notifications` table, adds rule/event/run tables, centralizes safe notification writes, and schedules one database-native daily cycle through `pg_cron`. Next.js server modules expose typed queries and protected actions for `/notifications`, `/admin/notifications/settings`, the app shell, and Phase 8 dashboards without loading sensitive source records or full notification payloads globally.

**Tech Stack:** Next.js 16.2.10 App Router, React 19.1.1, TypeScript 5.7.2, Supabase PostgreSQL/Auth/RLS, PostgreSQL PL/pgSQL and `pg_cron`, Node built-in test runner, Lucide React, existing Balanced spacing and dashboard component system.

## Global Constraints

- Delivery is in-app only; email, SMS, mobile push, web push, Edge Functions, and external schedulers are excluded.
- Immediate workflow events continue to create notifications as soon as they occur.
- One scheduled cycle runs daily at 8:00 AM `Asia/Manila`, represented as `0 0 * * *` in UTC-based PostgreSQL cron.
- Escalation is gentle: initial alert, daily reminder while unresolved, then role-based escalation after the configured threshold.
- Escalation follows Employee → Direct Manager → HR Admin → Super Admin, with module-specific starting points.
- Notification timing is configurable independently by notification type.
- Resolved notifications are retained for 90 days by default and then archived; Phase 9 permanently deletes no notification or notification event history.
- The full management experience is `/notifications`; no duplicate dropdown notification center is added.
- Super Admins manage rules at `/admin/notifications/settings`; HR Admins may view rules and cycle status but cannot mutate them or manually run the cycle.
- Existing Phase 1–8 behavior, RLS boundaries, document permission separation, and Balanced spacing remain compatible.
- Managers receive direct-report operational summaries only and never receive document filenames, file links, reference numbers, issuing organizations, notes, custom metadata, private review reasons, or unrelated employee data.
- Notification action URLs are relative server-selected application paths from a fixed allowlist.
- Browser inputs never provide a recipient user ID, arbitrary action URL, escalation recipient, source key, or safe payload.
- Direct inserts, updates, and deletes remain revoked from authenticated users for authoritative notification tables.
- Privileged SQL functions use `SECURITY DEFINER`, `set search_path = pg_catalog, public`, explicit authorization, stable error codes, row locks for mutable state, and revoked default execution privileges.
- Scheduled processing uses deterministic recipient-stage source keys and a PostgreSQL advisory lock so retries and overlapping invocations do not duplicate alerts.
- Safe payloads and event data cannot contain signed URLs, storage paths, service-role values, access tokens, raw files, filenames, internal reasons, private notes, bank/account data, government identifiers, or unrestricted custom metadata.
- Applied migrations are never rewritten; Phase 9 uses `supabase/migrations/202607170005_notifications_reminders_escalations.sql` after `202607170004_dashboard_analytics.sql`.

---

## Verified baseline

The Phase 8 repository package contains:

```text
Next.js 16.2.10
React 19.1.1
TypeScript 5.7.2
Supabase Auth/PostgreSQL/RLS
Latest migration: 202607170004_dashboard_analytics.sql
Existing notifications table: Phase 7 document notifications
Existing pg_cron extension: Phase 5 attendance calculations
Existing dashboard analytics: Phase 8 role-specific /dashboard
Reported baseline verification: 695 tests passed, TypeScript passed, production build passed
```

Before implementation, re-run the baseline in the real repository and record fresh results. If baseline tests fail, stop and resolve the pre-existing failure before Phase 9 changes.

## Scope decomposition

```text
shared notification contracts
  -> migration and safe payload foundation
  -> protected recipient lifecycle actions
  -> rule configuration and audit
  -> daily cycle orchestration and cron
  -> module-specific selection/routing
  -> immediate workflow integrations
  -> typed queries and server actions
  -> notification center UI
  -> settings UI
  -> shell unread count
  -> Phase 8 dashboard summaries
  -> security, release verification, and packaging
```

## File map

### Create

```text
supabase/migrations/202607170005_notifications_reminders_escalations.sql

src/features/notifications/constants.ts
src/features/notifications/types.ts
src/features/notifications/errors.ts
src/features/notifications/presentation.ts
src/features/notifications/presentation.test.ts
src/features/notifications/validation.ts
src/features/notifications/validation.test.ts
src/features/notifications/auth.ts
src/features/notifications/auth.test.ts
src/features/notifications/queries.ts
src/features/notifications/queries.test.ts
src/features/notifications/rules/queries.ts
src/features/notifications/rules/queries.test.ts
src/features/notifications/cycle/queries.ts
src/features/notifications/cycle/queries.test.ts
src/features/notifications/migration.test.ts
src/features/notifications/security.test.ts
src/features/notifications/concurrency.test.ts
src/features/notifications/routing.test.ts
src/features/notifications/actions.test.ts
src/features/notifications/ui.test.ts
src/features/notifications/e2e.test.ts

src/components/notifications/notification-status-badge.tsx
src/components/notifications/notification-priority-badge.tsx
src/components/notifications/notification-summary-cards.tsx
src/components/notifications/notification-filter-form.tsx
src/components/notifications/notification-list.tsx
src/components/notifications/notification-card.tsx
src/components/notifications/notification-row-actions.tsx
src/components/notifications/notification-bulk-actions.tsx
src/components/notifications/notification-rule-form.tsx
src/components/notifications/notification-rule-list.tsx
src/components/notifications/notification-run-summary.tsx
src/components/notifications/dashboard-notification-summary.tsx

src/app/(dashboard)/notifications/page.tsx
src/app/(dashboard)/notifications/loading.tsx
src/app/(dashboard)/notifications/error.tsx
src/app/(dashboard)/notifications/actions.ts
src/app/(dashboard)/admin/notifications/settings/page.tsx
src/app/(dashboard)/admin/notifications/settings/loading.tsx
src/app/(dashboard)/admin/notifications/settings/error.tsx
src/app/(dashboard)/admin/notifications/settings/actions.ts
```

### Modify

```text
src/app/(dashboard)/layout.tsx
src/components/app-shell.tsx
src/components/sidebar.tsx
src/components/topbar.tsx
src/app/(dashboard)/dashboard/page.tsx
src/features/dashboard/types.ts
src/features/dashboard/queries.ts
src/features/dashboard/normalize.ts
src/components/dashboard/dashboard-action-list.tsx
src/app/(dashboard)/settings/page.tsx
src/app/globals.css
src/lib/utils.ts
src/features/build-config.test.ts
src/features/layout/balanced-spacing.test.ts
README.md
.env.example
docs/superpowers/specs/2026-07-17-phase-9-notifications-reminders-escalations-design.md
```

## Shared public contracts

Create these exact unions before queries, actions, SQL result normalization, or UI components consume them:

```ts
export const notificationModuleValues = [
  "attendance",
  "leave",
  "overtime",
  "documents",
  "system",
] as const;
export type NotificationModule = (typeof notificationModuleValues)[number];

export const notificationPriorityValues = ["info", "normal", "high", "urgent"] as const;
export type NotificationPriority = (typeof notificationPriorityValues)[number];

export const notificationStatusValues = [
  "unread",
  "read",
  "dismissed",
  "resolved",
  "archived",
] as const;
export type NotificationStatus = (typeof notificationStatusValues)[number];

export const notificationRuleTypeValues = [
  "attendance_exception",
  "leave_approval_pending",
  "overtime_approval_pending",
  "document_review_pending",
  "document_expiring",
  "document_expired",
] as const;
export type NotificationRuleType = (typeof notificationRuleTypeValues)[number];

export const notificationEventTypeValues = [
  "created",
  "reminded",
  "read",
  "marked_unread",
  "dismissed",
  "escalated",
  "resolved",
  "archived",
  "rule_changed",
  "rule_reset",
] as const;
export type NotificationEventType = (typeof notificationEventTypeValues)[number];

export const notificationRunStatusValues = [
  "running",
  "succeeded",
  "partial_failed",
  "failed",
] as const;
export type NotificationRunStatus = (typeof notificationRunStatusValues)[number];
```

Protected workflow names are fixed:

```text
upsert_safe_notification
list_notification_center
get_unread_notification_count
mark_notification_read
mark_notification_unread
dismiss_notification
bulk_mark_notifications_read
bulk_dismiss_notifications
list_notification_rules
update_notification_rule
reset_notification_rules_to_defaults
get_notification_cycle_status
run_notification_cycle_now
run_daily_notification_cycle
process_attendance_notifications
process_leave_notifications
process_overtime_notifications
process_document_notifications
resolve_stale_notifications
archive_resolved_notifications
```

Stable error codes are fixed:

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

## Task 1: Notification contracts, presentation, safe errors, and validation

**Files:**
- Create: `src/features/notifications/constants.ts`
- Create: `src/features/notifications/types.ts`
- Create: `src/features/notifications/errors.ts`
- Create: `src/features/notifications/presentation.ts`
- Create: `src/features/notifications/presentation.test.ts`
- Create: `src/features/notifications/validation.ts`
- Create: `src/features/notifications/validation.test.ts`

**Interfaces:**
- Consumes: `AppRole` from `src/features/employees/types.ts`.
- Produces: all shared unions, `NotificationActionState`, `NotificationCenterFilters`, `NotificationListItem`, `NotificationRule`, `NotificationRuleInput`, `NotificationCycleSummary`, `mapNotificationError`, presentation label helpers, filter parsing, action URL validation, rule validation, and bulk-ID validation.

- [ ] **Step 1: Write failing presentation and validation tests**

Create `src/features/notifications/presentation.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  notificationModuleLabel,
  notificationPriorityLabel,
  notificationStatusLabel,
  unreadCountLabel,
} from "./presentation.ts";

test("notification labels are explicit and readable", () => {
  assert.equal(notificationModuleLabel("documents"), "Documents");
  assert.equal(notificationPriorityLabel("urgent"), "Urgent");
  assert.equal(notificationStatusLabel("dismissed"), "Dismissed");
});

test("unread count labels cap visual text while preserving exact accessible text", () => {
  assert.deepEqual(unreadCountLabel(0), { visual: "", accessible: "No unread notifications" });
  assert.deepEqual(unreadCountLabel(12), { visual: "12", accessible: "12 unread notifications" });
  assert.deepEqual(unreadCountLabel(142), { visual: "99+", accessible: "142 unread notifications" });
});
```

Create `src/features/notifications/validation.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseNotificationFilters,
  validateBulkNotificationIds,
  validateNotificationActionUrl,
  validateNotificationRuleInput,
} from "./validation.ts";

const uuid = (digit: string) => `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;
const uuidAt = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

test("notification filters normalize unknown values and page bounds", () => {
  assert.deepEqual(parseNotificationFilters({
    module: "documents",
    status: "active",
    priority: "urgent",
    page: "2",
    query: "  license  ",
    from: "2026-07-01",
    to: "2026-07-31",
  }), {
    module: "documents",
    status: "active",
    priority: "urgent",
    page: 2,
    query: "license",
    from: "2026-07-01",
    to: "2026-07-31",
  });
  assert.equal(parseNotificationFilters({ page: "-9" }).page, 1);
});

test("action URLs allow only approved relative routes", () => {
  assert.equal(validateNotificationActionUrl("/documents").data, "/documents");
  assert.equal(validateNotificationActionUrl("/admin/documents/review?status=pending_review").data, "/admin/documents/review?status=pending_review");
  assert.equal(validateNotificationActionUrl("https://example.com").error, "Notification links must use an approved application route.");
  assert.equal(validateNotificationActionUrl("javascript:alert(1)").error, "Notification links must use an approved application route.");
});

test("rule inputs enforce approved per-type timing", () => {
  assert.equal(validateNotificationRuleInput({
    typeCode: "document_expiring",
    enabled: true,
    initialDelayDays: null,
    repeatIntervalDays: 1,
    escalationAfterDays: 7,
    leadTimeDays: null,
    retentionDays: 90,
    expectedVersion: 1,
    requestId: uuid("1"),
  }).error, "Expiring-document rules require a lead-time value.");

  assert.equal(validateNotificationRuleInput({
    typeCode: "leave_approval_pending",
    enabled: true,
    initialDelayDays: 1,
    repeatIntervalDays: 1,
    escalationAfterDays: 3,
    leadTimeDays: null,
    retentionDays: 90,
    expectedVersion: 1,
    requestId: uuid("1"),
  }).data?.escalationAfterDays, 3);
});

test("bulk actions reject empty, duplicate, excessive, or malformed IDs", () => {
  assert.equal(validateBulkNotificationIds([]).error, "Select at least one notification.");
  assert.equal(validateBulkNotificationIds([uuid("2"), uuid("2")]).error, "Each selected notification must be unique.");
  assert.equal(validateBulkNotificationIds(Array.from({ length: 101 }, (_, index) => uuidAt(index + 1))).error, "Select no more than 100 notifications at a time.");
  assert.equal(validateBulkNotificationIds([uuid("3")]).data?.length, 1);
});
```

- [ ] **Step 2: Run the tests and confirm the modules are missing**

Run:

```bash
node --no-warnings --test --experimental-strip-types \
  src/features/notifications/presentation.test.ts \
  src/features/notifications/validation.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for notification modules.

- [ ] **Step 3: Create constants, unions, and DTOs**

Create `src/features/notifications/constants.ts`:

```ts
export const NOTIFICATION_PAGE_SIZE = 25;
export const NOTIFICATION_MAX_BULK_COUNT = 100;
export const NOTIFICATION_DEFAULT_RETENTION_DAYS = 90;
export const NOTIFICATION_MAX_RETENTION_DAYS = 3650;
export const NOTIFICATION_ACTION_URL_PREFIXES = [
  "/attendance",
  "/leave",
  "/employee/leave",
  "/admin/leave",
  "/overtime",
  "/admin/overtime",
  "/documents",
  "/admin/documents/review",
  "/notifications",
  "/admin/notifications/settings",
] as const;
export const NOTIFICATION_TITLE_MAX_LENGTH = 160;
export const NOTIFICATION_BODY_MAX_LENGTH = 500;
export const NOTIFICATION_SEARCH_MAX_LENGTH = 120;
```

Create `src/features/notifications/types.ts` with the shared unions and these DTOs:

```ts
export type NotificationActionState = {
  error?: string;
  success?: string;
  correlationId?: string;
};

export type NotificationCenterFilters = {
  module?: NotificationModule;
  status?: NotificationStatus | "active";
  priority?: NotificationPriority;
  page: number;
  query?: string;
  from?: string;
  to?: string;
};

export type NotificationListItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  module: NotificationModule;
  priority: NotificationPriority;
  status: NotificationStatus;
  actionUrl: string | null;
  reminderCount: number;
  escalationLevel: number;
  createdAt: string;
  lastRemindedAt: string | null;
  readAt: string | null;
  resolvedAt: string | null;
  archivedAt: string | null;
};

export type NotificationRule = {
  id: string;
  typeCode: NotificationRuleType;
  module: NotificationModule;
  enabled: boolean;
  initialDelayDays: number | null;
  repeatIntervalDays: number;
  escalationAfterDays: number | null;
  leadTimeDays: number | null;
  retentionDays: number;
  version: number;
  updatedAt: string;
  updatedByName: string | null;
};

export type NotificationRuleInput = {
  typeCode: NotificationRuleType;
  enabled: boolean;
  initialDelayDays: number | null;
  repeatIntervalDays: number;
  escalationAfterDays: number | null;
  leadTimeDays: number | null;
  retentionDays: number;
  expectedVersion: number;
  requestId: string;
};

export type NotificationCycleSummary = {
  id: string;
  runDate: string;
  runSource: "scheduled" | "manual";
  status: NotificationRunStatus;
  startedAt: string;
  completedAt: string | null;
  createdCount: number;
  remindedCount: number;
  escalatedCount: number;
  resolvedCount: number;
  archivedCount: number;
  errorCode: string | null;
  safeErrorMessage: string | null;
  ruleResults: Record<string, { status: string; created: number; reminded: number; escalated: number; resolved: number; errorCode?: string }>;
};
```

- [ ] **Step 4: Implement safe errors, presentation maps, and validation**

Create `src/features/notifications/errors.ts` with a readonly code/message map for every stable error and:

```ts
export function mapNotificationError(message: string, fallback = "The notification action could not be completed.") {
  return safeNotificationErrors.find(([code]) => message.includes(code))?.[1] ?? fallback;
}
```

Create complete presentation maps in `presentation.ts`. `notificationStatusLabel` accepts only `NotificationStatus`, so invalid status values remain compile-time errors rather than runtime fallbacks.

Create `validation.ts` with:

```ts
export function parseNotificationFilters(input: Record<string, string | string[] | undefined>): NotificationCenterFilters
export function validateNotificationActionUrl(value: string | null): ValidationResult<string | null>
export function validateNotificationRuleInput(input: NotificationRuleInput): ValidationResult<NotificationRuleInput>
export function validateBulkNotificationIds(ids: string[]): ValidationResult<string[]>
```

Validation rules are exact:

```text
approved route prefix only
no scheme, host, protocol-relative URL, backslash, or control character
page minimum 1
query trimmed and capped at 120 characters
from <= to when both dates exist
bulk count 1..100
UUID format and uniqueness required
repeat interval >= 1
retention 1..3650
all timing values nonnegative whole numbers
attendance/leave/overtime/review require initial delay and escalation threshold
document_expiring requires lead time and escalation threshold
document_expired requires escalation threshold and permits zero initial delay
request ID required
expected version positive whole number
```

- [ ] **Step 5: Run contract tests**

Run the Task 1 test command. Expected: all tests pass.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/features/notifications
git commit -m "feat: add notification domain contracts"
```

## Task 2: Notification schema extension, rules, immutable events, RLS, and seed defaults

**Files:**
- Create: `supabase/migrations/202607170005_notifications_reminders_escalations.sql`
- Create: `src/features/notifications/migration.test.ts`
- Create: `src/features/notifications/security.test.ts`

**Interfaces:**
- Consumes: Phase 7 `notifications`, Phase 5 `pg_cron`, Phase 8 migration order, Task 1 enums and limits.
- Produces: extended notification schema, rule/event/run tables, constraints, indexes, RLS, payload/action guards, immutable triggers, and approved seed rules.

- [ ] **Step 1: Write failing migration and security definition tests**

Create `migration.test.ts` that reads `202607170005_notifications_reminders_escalations.sql` and asserts:

```ts
const requiredColumns = [
  "module", "priority", "status", "resource_key", "employee_id", "safe_context",
  "action_url", "reminder_count", "escalation_level", "first_notified_at",
  "last_reminded_at", "next_reminder_at", "escalated_at", "resolved_at",
  "dismissed_at", "archived_at", "updated_at",
];

const requiredTables = ["notification_rules", "notification_events", "notification_cycle_runs"];

for (const column of requiredColumns) assert.match(sql, new RegExp(`add column if not exists ${column}`, "i"));
for (const table of requiredTables) assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, "i"));
for (const typeCode of [
  "attendance_exception", "leave_approval_pending", "overtime_approval_pending",
  "document_review_pending", "document_expiring", "document_expired",
]) assert.match(sql, new RegExp(`'${typeCode}'`, "i"));
assert.match(sql, /retention_days[^;]*default 90/is);
assert.equal((sql.toLowerCase().match(/^begin;/gm) ?? []).length, 1);
assert.equal((sql.toLowerCase().match(/^commit;/gm) ?? []).length, 1);
```

Create `security.test.ts` asserting:

```text
RLS enabled on notifications, notification_rules, notification_events, notification_cycle_runs
authenticated direct mutation revoked
recipient select policy remains recipient_user_id = auth.uid()
notification_events immutable trigger exists
assert_safe_notification_payload rejects every forbidden token
validate_notification_action_url rejects external and protocol-relative paths
no manager direct select policy on subordinate notifications
```

- [ ] **Step 2: Run tests and verify the migration is missing**

Expected: FAIL with `ENOENT`.

- [ ] **Step 3: Extend `notifications` safely**

Create one transaction. Add columns with temporary nullable/default-compatible definitions, backfill existing rows, then add not-null constraints where approved:

```sql
alter table public.notifications
  add column if not exists module text,
  add column if not exists priority text,
  add column if not exists status text,
  add column if not exists resource_key text,
  add column if not exists employee_id uuid references public.employees(id) on delete set null,
  add column if not exists safe_context jsonb not null default '{}'::jsonb,
  add column if not exists action_url text,
  add column if not exists reminder_count integer not null default 0,
  add column if not exists escalation_level integer not null default 0,
  add column if not exists first_notified_at timestamptz,
  add column if not exists last_reminded_at timestamptz,
  add column if not exists next_reminder_at timestamptz,
  add column if not exists escalated_at timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists dismissed_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

update public.notifications
set module = coalesce(module, case when type like 'document_%' then 'documents' else 'system' end),
    priority = coalesce(priority, 'normal'),
    status = coalesce(status, case when read_at is null then 'unread' else 'read' end),
    resource_key = coalesce(resource_key, resource_type || ':' || coalesce(resource_id::text, id::text)),
    first_notified_at = coalesce(first_notified_at, created_at),
    updated_at = coalesce(updated_at, created_at);
```

Add named constraints for approved values, nonnegative counts, and lifecycle timestamp consistency.

- [ ] **Step 4: Create rule, event, and cycle-run tables**

Use exact columns from the spec. Add:

```text
notification_rules_type_code_unique
notification_events_notification_created_idx
notification_events_recipient_created_idx
notification_cycle_runs_date_source_active_unique
notifications_recipient_status_created_idx
notifications_next_reminder_idx
notifications_resource_active_idx
```

The partial cycle index applies to `status in ('running','succeeded')`.

- [ ] **Step 5: Add safe payload and action URL guards**

Create:

```sql
public.assert_safe_notification_payload(jsonb) returns void
public.validate_notification_action_url(text) returns text
```

The payload guard lowercases serialized JSON and rejects the exact forbidden keys/terms. The action URL function accepts `null` or a relative path whose route prefix is in the approved allowlist and rejects `://`, `//`, backslashes, control characters, and `javascript:`.

Attach a `before insert or update` trigger to `notifications` that validates `safe_context` and `action_url`. Apply the payload guard inside every later event/run/rule helper.

- [ ] **Step 6: Add immutable event protection and RLS**

Create `prevent_notification_event_mutation()` and attach `before update or delete` to `notification_events`. Enable RLS on all four tables. Preserve recipient-only notification select access. Grant authenticated select on `notifications` only and no direct insert/update/delete. Rule and cycle reads occur through RPCs rather than broad table policies.

- [ ] **Step 7: Seed approved rule defaults idempotently**

Seed exactly six rows with version 1:

```text
attendance_exception: initial 1, repeat 1, escalation 3, lead null, retention 90
leave_approval_pending: initial 1, repeat 1, escalation 3, lead null, retention 90
overtime_approval_pending: initial 1, repeat 1, escalation 3, lead null, retention 90
document_review_pending: initial 2, repeat 1, escalation 5, lead null, retention 90
document_expiring: initial null, repeat 1, escalation 7, lead 30, retention 90
document_expired: initial 0, repeat 1, escalation 3, lead null, retention 90
```

Use `on conflict (type_code) do nothing` so production edits are never overwritten by reapplication.

- [ ] **Step 8: Run migration and security tests**

Expected: all Task 2 tests pass.

- [ ] **Step 9: Commit Task 2**

```bash
git add supabase/migrations/202607170005_notifications_reminders_escalations.sql src/features/notifications/migration.test.ts src/features/notifications/security.test.ts
git commit -m "feat: add notification database foundation"
```

## Task 3: Central safe notification helper and recipient lifecycle workflows

**Files:**
- Modify: `supabase/migrations/202607170005_notifications_reminders_escalations.sql`
- Create: `src/features/notifications/concurrency.test.ts`

**Interfaces:**
- Produces: `upsert_safe_notification`, list/count RPCs, individual and bulk recipient lifecycle RPCs, event writing, deterministic idempotency, and safe pagination.

- [ ] **Step 1: Extend failing migration and concurrency tests**

Assert all fixed workflow names exist, are `SECURITY DEFINER`, have fixed search paths, and have revoked default execution. Assert lifecycle functions lock selected notification rows `for update`, derive `auth.uid()`, and insert immutable events.

- [ ] **Step 2: Add reusable event and safe-notification helpers**

Create internal helpers:

```text
write_notification_event
build_notification_source_event_key
upsert_safe_notification
```

`upsert_safe_notification` accepts trusted server/database parameters only, validates payload/action URL, calculates:

```text
<type-code>:<resource-key>:<recipient-user-id>:<escalation-level>
```

and inserts or updates the matching row. On an existing unresolved row it updates reminder state only when due. It never reopens resolved or archived rows; a later escalation stage has a different key.

- [ ] **Step 3: Implement safe list and count functions**

`list_notification_center` accepts module/status/priority/search/date/page filters and returns only fields in `NotificationListItem` plus `total_count`. It derives the recipient from `auth.uid()`. Status `active` means `unread`, `read`, or `dismissed`. Page size is fixed at 25.

`get_unread_notification_count()` returns one integer for `recipient_user_id = auth.uid()` and `status = 'unread'`.

- [ ] **Step 4: Implement individual lifecycle workflows**

`mark_notification_read`, `mark_notification_unread`, and `dismiss_notification`:

```text
derive current user
lock target row
reject non-owner with NOTIFICATION_NOT_FOUND
reject resolved/archived mutation with NOTIFICATION_INVALID_STATUS
update status and timestamps consistently
write immutable event with generated/request ID
return safe row state
```

Maintain legacy `read_at` compatibility: unread clears it, read sets it, dismissed preserves prior read timestamp when present.

- [ ] **Step 5: Implement atomic bulk workflows**

`bulk_mark_notifications_read(uuid[], uuid request_id)` and `bulk_dismiss_notifications(uuid[], uuid request_id)` reject empty, duplicate, over-100, foreign-owned, resolved, or archived IDs before mutating any row. Lock all selected rows in stable ID order and write one event per notification.

- [ ] **Step 6: Lock privileges and run tests**

Grant list/count/lifecycle RPC execution to authenticated. Keep central insert/event helpers inaccessible to browser roles.

- [ ] **Step 7: Commit Task 3**

```bash
git add supabase/migrations/202607170005_notifications_reminders_escalations.sql src/features/notifications/concurrency.test.ts
git commit -m "feat: add notification lifecycle workflows"
```

## Task 4: Notification rule administration and cycle-status workflows

**Files:**
- Modify: `supabase/migrations/202607170005_notifications_reminders_escalations.sql`
- Create: `src/features/notifications/rules/queries.ts`
- Create: `src/features/notifications/rules/queries.test.ts`
- Create: `src/features/notifications/cycle/queries.ts`
- Create: `src/features/notifications/cycle/queries.test.ts`
- Create: `src/features/notifications/auth.ts`
- Create: `src/features/notifications/auth.test.ts`

**Interfaces:**
- Produces: pure role predicates, `requireNotificationSettingsViewer`, `requireNotificationSettingsManager`, `listNotificationRules`, `getNotificationCycleStatus`, rule normalization, cycle normalization, and protected rule mutation RPCs.

- [ ] **Step 1: Write failing auth and normalization tests**

Test:

```text
Super Admin may view and manage settings
HR Admin may view but not manage
employee may neither view nor manage
rule rows normalize snake_case to NotificationRule
cycle rows normalize counts and safe per-rule results
```

- [ ] **Step 2: Implement role predicates and server guards**

Create:

```ts
export function canViewNotificationSettings(role: AppRole) {
  return role === "hr_admin" || role === "super_admin";
}
export function canManageNotificationSettings(role: AppRole) {
  return role === "super_admin";
}
export async function requireNotificationSettingsViewer()
export async function requireNotificationSettingsManager()
```

Use the existing authenticated profile pattern and redirect unauthorized users to `/notifications?error=unauthorized`.

- [ ] **Step 3: Add protected SQL rule workflows**

Implement:

```text
list_notification_rules
update_notification_rule
reset_notification_rules_to_defaults
get_notification_cycle_status
```

`list_notification_rules` and cycle status permit HR Admin and Super Admin. Mutations require Super Admin. Rule updates compare `expected_version`, lock the row, validate per-type fields, increment version, set actor/time, and write `rule_changed`. Reset locks all rules, applies the approved defaults, increments versions, and writes `rule_reset` events without deleting history.

- [ ] **Step 4: Implement query modules**

`rules/queries.ts`:

```ts
export function normalizeNotificationRuleRows(rows: Array<Record<string, unknown>>): NotificationRule[]
export async function listNotificationRules(): Promise<NotificationRule[]>
```

`cycle/queries.ts`:

```ts
export function normalizeNotificationCycleRows(rows: Array<Record<string, unknown>>): NotificationCycleSummary[]
export async function getNotificationCycleStatus(limit = 10): Promise<NotificationCycleSummary[]>
```

Cap cycle history at 50.

- [ ] **Step 5: Run tests and commit**

```bash
git add src/features/notifications/auth* src/features/notifications/rules src/features/notifications/cycle supabase/migrations/202607170005_notifications_reminders_escalations.sql
git commit -m "feat: add notification rule administration"
```

## Task 5: Daily cycle orchestration, advisory locking, retention, and cron

**Files:**
- Modify: `supabase/migrations/202607170005_notifications_reminders_escalations.sql`
- Modify: `src/features/notifications/concurrency.test.ts`
- Modify: `src/features/notifications/migration.test.ts`

**Interfaces:**
- Produces: `run_daily_notification_cycle`, `run_notification_cycle_now`, source resolution, retention archival, isolated processor result aggregation, and cron job `hris-daily-notification-cycle`.

- [ ] **Step 1: Add failing cycle and cron assertions**

Assert:

```text
pg_try_advisory_xact_lock or advisory lock is present
notification_cycle_runs inserted before processor execution
per-processor exception blocks are isolated
partial_failed status exists
resolve_stale_notifications and archive_resolved_notifications are called
cron job is unscheduled/replaced idempotently
cron expression is 0 0 * * *
cron command invokes run_daily_notification_cycle
manual cycle requires Super Admin
```

- [ ] **Step 2: Implement source resolution and retention archival**

`resolve_stale_notifications(p_run_id)` evaluates active scheduled notifications against module source state and marks no-longer-qualifying rows resolved. It records `resolved` events and returns a count.

`archive_resolved_notifications(p_run_id)` joins each notification type to its current rule retention days, archives due rows, records `archived` events, and returns a count. It performs no deletes.

- [ ] **Step 3: Implement cycle orchestration**

`run_daily_notification_cycle(p_run_source text default 'scheduled', p_actor uuid default null)`:

```text
acquire fixed advisory transaction lock
reject overlap with NOTIFICATION_CYCLE_ALREADY_RUNNING
insert running run row
execute each module processor in an exception-isolated block
accumulate safe per-rule counts and stable error codes
resolve stale notifications
archive retained notifications
set succeeded, partial_failed, or failed
return run ID and counts
```

A processor failure must not expose `sqlerrm` directly. Map unexpected SQL errors to `NOTIFICATION_RULE_PROCESSING_FAILED` and generic safe text.

`run_notification_cycle_now(uuid request_id)` requires Super Admin and calls the cycle with `run_source = 'manual'` and the authenticated actor.

- [ ] **Step 4: Schedule cron idempotently**

Use the existing `cron` schema pattern:

```sql
select cron.unschedule(jobid)
from cron.job
where jobname = 'hris-daily-notification-cycle';

perform cron.schedule(
  'hris-daily-notification-cycle',
  '0 0 * * *',
  $$select public.run_daily_notification_cycle('scheduled', null);$$
);
```

Use syntax compatible with the repository's current `pg_cron` migration pattern and tests.

- [ ] **Step 5: Run tests and commit**

```bash
git add supabase/migrations/202607170005_notifications_reminders_escalations.sql src/features/notifications/concurrency.test.ts src/features/notifications/migration.test.ts
git commit -m "feat: add scheduled notification cycle"
```

## Task 6: Module processors, safe routing, reminders, and escalation progression

**Files:**
- Modify: `supabase/migrations/202607170005_notifications_reminders_escalations.sql`
- Create: `src/features/notifications/routing.test.ts`

**Interfaces:**
- Produces: four module processors and deterministic recipient routing for six approved rule types.

- [ ] **Step 1: Write failing routing and safe-field tests**

Assert the SQL contains explicit routing for:

```text
employee profile recipient
direct manager profile recipient
active HR Admin recipients
active Super Admin recipients
documents.review grant recipients
```

Assert manager-facing document processor definitions do not reference filename, reference number, issuing organization, notes, custom metadata, internal reason, or storage path.

- [ ] **Step 2: Implement attendance processing**

`process_attendance_notifications(p_run_id, p_rule jsonb)` selects pending `attendance_correction_requests` older than the configured initial delay. The affected employee is stage 0, direct manager stage 1, HR Admin stage 2, Super Admin stage 3. Use safe context containing only employee display name, attendance date, and broad request type. Action routes are server-selected:

```text
employee: /attendance/corrections
manager/HR/Super Admin: /admin/attendance/corrections
```

- [ ] **Step 3: Implement leave processing**

Select `leave_request_groups.current_status = 'pending'` and current active revision dates. Derive the current approver from the existing leave authorization rules. Use manager as initial recipient where applicable, otherwise HR Admin. Escalate HR Admin → Super Admin. Employees do not receive approval reminders. Safe content includes employee display name, leave date range, and leave type name only.

- [ ] **Step 4: Implement overtime processing**

Select nonsuperseded `overtime_approval_items.status = 'pending'`, join detection group employee/date, and route current authorized reviewer → HR Admin → Super Admin. Do not include approval notes, rejection reasons, or unrelated attendance details.

- [ ] **Step 5: Implement document processing**

`document_review_pending` selects pending employee-submitted versions. Stage 0 recipients are active HR Admins with `documents.review` plus active Super Admins with implicit review access; escalation after threshold creates stage 1 Super Admin notifications only.

`document_expiring` selects active approved employee-visible compliance items within `lead_time_days`, alerts employee at stage 0, and manager status-only at the approved pre-expiry threshold.

`document_expired` alerts employee immediately, manager status-only at stage 1, HR Admin at stage 2 after configured days, and Super Admin at stage 3 after an additional repeat interval.

- [ ] **Step 6: Apply reminder due logic consistently**

Every processor calls `upsert_safe_notification` with:

```text
resource key stable to source record/type
recipient-specific stage
first due timestamp
next reminder timestamp = last reminder + repeat interval
reminder increments only when due
```

Dismissed rows remain dismissed for the same stage; later stages may still be created.

- [ ] **Step 7: Run routing, security, and concurrency tests**

Expected: all pass.

- [ ] **Step 8: Commit Task 6**

```bash
git add supabase/migrations/202607170005_notifications_reminders_escalations.sql src/features/notifications/routing.test.ts
git commit -m "feat: add notification routing and escalation"
```

## Task 7: Immediate event-driven workflow integration

**Files:**
- Modify: `supabase/migrations/202607170005_notifications_reminders_escalations.sql`
- Modify: `src/features/notifications/e2e.test.ts`

**Interfaces:**
- Consumes: central `upsert_safe_notification` helper.
- Produces: immediate alerts for leave, overtime, attendance correction, and document lifecycle events without rewriting applied migrations.

- [ ] **Step 1: Write failing integration ownership tests**

Assert the Phase 9 migration creates trigger functions and triggers on these source tables:

```text
attendance_correction_requests
leave_request_actions
overtime_approval_items
employee_document_versions or document_reviews for missing immediate paths
```

Assert trigger definitions call `upsert_safe_notification` and never copy private note/reason fields into payloads.

- [ ] **Step 2: Add attendance immediate triggers**

On pending correction creation, notify the affected employee that the request was received and the authorized review role that a request is pending. On approved/rejected/cancelled transition, resolve pending reminder notifications and create an employee-safe decision notification.

- [ ] **Step 3: Add leave immediate triggers**

Use immutable `leave_request_actions` inserts. On submitted, notify current approver. On approved/rejected/withdrawn/cancelled, notify employee with safe status and resolve approver reminders.

- [ ] **Step 4: Add overtime immediate triggers**

On pending item insert, notify authorized reviewers. On approved/rejected/superseded transition, notify the employee with broad status and resolve pending approval reminders. Never include `approval_note` or `rejection_reason`.

- [ ] **Step 5: Consolidate document notification writes**

Replace or wrap `create_document_notification` so it delegates to `upsert_safe_notification` while preserving existing Phase 7 call signatures and source event keys. Existing document workflows must continue to pass their tests unchanged.

- [ ] **Step 6: Run full module regression tests**

Run notification tests plus attendance, leave, overtime, and document test directories. Expected: zero failures.

- [ ] **Step 7: Commit Task 7**

```bash
git add supabase/migrations/202607170005_notifications_reminders_escalations.sql src/features/notifications/e2e.test.ts
git commit -m "feat: integrate immediate workflow notifications"
```

## Task 8: Notification query module and protected server actions

**Files:**
- Create: `src/features/notifications/queries.ts`
- Create: `src/features/notifications/queries.test.ts`
- Create: `src/app/(dashboard)/notifications/actions.ts`
- Create: `src/features/notifications/actions.test.ts`

**Interfaces:**
- Produces: row normalization, `listNotifications`, `getUnreadNotificationCount`, `getNotificationDashboardSummary`, recipient actions, and safe route revalidation.

- [ ] **Step 1: Write failing query and action source tests**

Test row normalization excludes `safe_context`, recipient IDs, employee IDs, raw source keys, and internal run fields. Source tests assert actions call only protected RPCs, generate request IDs, validate bulk selections, and revalidate `/notifications`, `/dashboard`, and the dashboard layout.

- [ ] **Step 2: Implement query normalization**

Create:

```ts
export function normalizeNotificationRows(rows: Array<Record<string, unknown>>): NotificationListItem[]
export async function listNotifications(filters: NotificationCenterFilters): Promise<{ items: NotificationListItem[]; total: number; page: number; pageSize: number }>
export async function getUnreadNotificationCount(): Promise<number>
export async function getNotificationDashboardSummary(limit = 5): Promise<{ unreadCount: number; urgentCount: number; items: NotificationListItem[] }>
```

All use protected RPCs. Cap dashboard items at 10.

- [ ] **Step 3: Implement server actions**

Create `"use server"` actions:

```ts
export async function markNotificationRead(notificationId: string): Promise<NotificationActionState>
export async function markNotificationUnread(notificationId: string): Promise<NotificationActionState>
export async function dismissNotification(notificationId: string): Promise<NotificationActionState>
export async function bulkMarkNotificationsRead(formData: FormData): Promise<NotificationActionState>
export async function bulkDismissNotifications(formData: FormData): Promise<NotificationActionState>
```

Parse UUIDs, call Task 1 validation, invoke protected RPCs, map stable errors, and revalidate relevant routes. Never accept recipient IDs.

- [ ] **Step 4: Run tests and commit**

```bash
git add src/features/notifications/queries* src/app/'(dashboard)'/notifications/actions.ts src/features/notifications/actions.test.ts
git commit -m "feat: add notification queries and actions"
```

## Task 9: Full notification center UI

**Files:**
- Create: `src/app/(dashboard)/notifications/page.tsx`
- Create: `src/app/(dashboard)/notifications/loading.tsx`
- Create: `src/app/(dashboard)/notifications/error.tsx`
- Create: all notification-center components listed in the file map
- Create/Modify: `src/features/notifications/ui.test.ts`

**Interfaces:**
- Consumes: Task 8 queries/actions and Task 1 contracts.
- Produces: accessible, responsive `/notifications` with summary, filters, selection, individual actions, and bulk actions.

- [ ] **Step 1: Write failing UI source tests**

Assert the page uses live query functions, filter parsing, summary cards, filter form, list, and bulk actions. Assert no mock arrays, `safeContext`, `recipientUserId`, or source keys appear in page/client props.

- [ ] **Step 2: Implement status and priority badges**

Use explicit text labels and existing badge tones. Status and priority must remain understandable without color.

- [ ] **Step 3: Implement summary and filters**

`NotificationSummaryCards` shows Unread, Urgent, Active, and Resolved counts from the current safe result projection. `NotificationFilterForm` uses GET controls for module, status, priority, query, from, and to. Preserve selected filter values and include a reset link.

- [ ] **Step 4: Implement desktop list and mobile cards**

Each item displays exact safe fields from `NotificationListItem`. Include checkbox labels, module, priority, status, title/body, created time, last reminder/reminder count where present, and action link. Resolved/archived rows hide mutation controls.

- [ ] **Step 5: Implement individual and bulk controls**

Use server-action forms. Client selection state exists only for visible item IDs. Announce the selected count with `aria-live`. Disable submission during action. Bulk forms send at most 100 IDs.

- [ ] **Step 6: Implement page, loading, and error routes**

The page parses `searchParams`, queries server-side, and renders explicit empty states. Error boundary shows a safe message and retry control without raw exception text.

- [ ] **Step 7: Run UI tests, TypeScript, and commit**

```bash
git add src/app/'(dashboard)'/notifications src/components/notifications src/features/notifications/ui.test.ts
git commit -m "feat: build notification center"
```

## Task 10: Super Admin settings queries, actions, and administration UI

**Files:**
- Create: `src/app/(dashboard)/admin/notifications/settings/page.tsx`
- Create: `src/app/(dashboard)/admin/notifications/settings/loading.tsx`
- Create: `src/app/(dashboard)/admin/notifications/settings/error.tsx`
- Create: `src/app/(dashboard)/admin/notifications/settings/actions.ts`
- Create: `src/components/notifications/notification-rule-form.tsx`
- Create: `src/components/notifications/notification-rule-list.tsx`
- Create: `src/components/notifications/notification-run-summary.tsx`
- Modify: `src/features/notifications/actions.test.ts`
- Modify: `src/features/notifications/ui.test.ts`

**Interfaces:**
- Produces: read-only HR settings view, Super Admin rule editing/reset/manual cycle, and cycle-run monitoring.

- [ ] **Step 1: Extend failing source tests**

Assert page calls `requireNotificationSettingsViewer`, actions call `requireNotificationSettingsManager`, rule updates use `validateNotificationRuleInput`, and manual cycle calls `run_notification_cycle_now`.

- [ ] **Step 2: Implement settings actions**

Create:

```ts
export async function updateNotificationRule(formData: FormData): Promise<NotificationActionState>
export async function resetNotificationRules(formData: FormData): Promise<NotificationActionState>
export async function runNotificationCycleNow(formData: FormData): Promise<NotificationActionState>
```

Require Super Admin, generate request IDs, validate confirmation for reset/manual run, call protected RPCs, and revalidate settings, notifications, and dashboard routes.

- [ ] **Step 3: Implement rule forms and read-only mode**

Group rules by module. Render controls appropriate to type. HR Admin sees values and disabled controls with a clear “Super Admin required” note. Super Admin forms include hidden expected version and request ID.

- [ ] **Step 4: Implement cycle-run summary**

Show latest run status, source, start/completion time, duration, created/reminded/escalated/resolved/archived counts, and safe per-rule result codes. Do not render raw SQL errors.

- [ ] **Step 5: Implement settings route states**

Page loads rules and latest 10 runs in parallel. Add reset-to-defaults and manual-run confirmation forms only for Super Admin.

- [ ] **Step 6: Run tests, build, and commit**

```bash
git add src/app/'(dashboard)'/admin/notifications src/components/notifications src/features/notifications
git commit -m "feat: add notification settings administration"
```

## Task 11: App-shell unread count, navigation, and topbar integration

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`
- Modify: `src/components/app-shell.tsx`
- Modify: `src/components/sidebar.tsx`
- Modify: `src/components/topbar.tsx`
- Modify: `src/features/notifications/ui.test.ts`

**Interfaces:**
- Consumes: aggregate `getUnreadNotificationCount` only.
- Produces: shell payload with `unreadNotificationCount`, Notifications route item, and accessible `99+` badge.

- [ ] **Step 1: Add failing shell source tests**

Assert layout loads unread count once, shell type contains only the count, sidebar/topbar link to `/notifications`, and no notification body or resource metadata enters `ShellUser`.

- [ ] **Step 2: Load aggregate count in dashboard layout**

Fetch document permission context, profile, and unread count without duplicating the authenticated-user query. Pass:

```ts
unreadNotificationCount: number
```

through `AppShell`.

- [ ] **Step 3: Add navigation and accessible badges**

Add `/notifications` with Bell icon near Dashboard. Sidebar and topbar use `unreadCountLabel()`. Visual text is capped at `99+`; `aria-label` preserves the exact count. The topbar bell becomes a Link, not an inert button.

- [ ] **Step 4: Run tests and commit**

```bash
git add src/app/'(dashboard)'/layout.tsx src/components/app-shell.tsx src/components/sidebar.tsx src/components/topbar.tsx src/features/notifications/ui.test.ts
git commit -m "feat: integrate notification unread counts"
```

## Task 12: Phase 8 dashboard notification summaries and settings navigation

**Files:**
- Create: `src/components/notifications/dashboard-notification-summary.tsx`
- Modify: `src/app/(dashboard)/dashboard/page.tsx`
- Modify: `src/features/dashboard/types.ts`
- Modify: `src/features/dashboard/queries.ts`
- Modify: `src/features/dashboard/normalize.ts`
- Modify: `src/app/(dashboard)/settings/page.tsx`
- Modify: `src/features/dashboard/*.test.ts`
- Modify: `src/features/notifications/ui.test.ts`

**Interfaces:**
- Produces: role-specific compact notification summary widgets and settings links without duplicating the notification center.

- [ ] **Step 1: Write failing dashboard and settings tests**

Assert dashboard query/type normalization includes a notification summary with unread/urgent counts and at most five safe items. Assert settings links `/admin/notifications/settings` for HR/Super Admin and describes HR read-only versus Super Admin management.

- [ ] **Step 2: Extend dashboard SQL/query projection safely**

Add or create a protected summary RPC that derives only the current user's addressed notifications and latest cycle status where role-authorized. Do not grant HR global notification-row access. Update dashboard types:

```ts
notificationSummary: {
  unreadCount: number;
  urgentCount: number;
  items: Array<{ id: string; title: string; module: NotificationModule; priority: NotificationPriority; actionUrl: string | null }>;
  latestCycleStatus?: NotificationRunStatus | null;
}
```

For employee/manager/HR, items are recipient-owned. Super Admin may additionally receive latest failed/partial cycle status, not other users' raw rows.

- [ ] **Step 3: Implement compact dashboard widget**

Display unread and urgent totals, up to five actions, and one link to `/notifications`. Super Admin cycle warning links to `/admin/notifications/settings`. Do not include filters or bulk actions.

- [ ] **Step 4: Add settings card and backend status update**

HR Admin and Super Admin see Notification settings. HR description states read-only rule visibility; Super Admin description includes configuration and manual cycle. Update backend status copy to include scheduled in-app reminders and escalations.

- [ ] **Step 5: Run dashboard, notification, TypeScript, and build tests**

- [ ] **Step 6: Commit Task 12**

```bash
git add src/components/notifications/dashboard-notification-summary.tsx src/app/'(dashboard)'/dashboard/page.tsx src/features/dashboard src/app/'(dashboard)'/settings/page.tsx src/features/notifications/ui.test.ts
git commit -m "feat: integrate notification dashboard summaries"
```

## Task 13: Balanced spacing, accessibility, and responsive behavior

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/lib/utils.ts`
- Modify: `src/features/layout/balanced-spacing.test.ts`
- Modify: `src/features/notifications/ui.test.ts`

**Interfaces:**
- Produces: required notification layout classes and responsive states using existing tokens.

- [ ] **Step 1: Add failing spacing tests**

Assert these exact classes exist:

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

Assert section gaps use `var(--space-section)`, card/form gaps use existing Balanced tokens, and mobile media rules collapse relevant grids to one column.

- [ ] **Step 2: Add scoped notification CSS**

Use existing tokens and patterns:

```css
.notification-center-layout { display: grid; gap: var(--space-section); }
.notification-summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-card); }
.notification-filter-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--space-related); align-items: end; }
.notification-list { display: grid; gap: var(--space-related); }
.notification-card { display: grid; gap: var(--space-related); }
.notification-bulk-actions { display: flex; gap: var(--space-related); align-items: center; flex-wrap: wrap; }
.notification-settings-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: var(--space-card); }
.notification-rule-form { display: grid; gap: var(--space-card); }
.notification-run-summary { display: grid; gap: var(--space-related); }
```

At 1100px summary becomes two columns; at 760px all notification grids become one column and primary actions become full width where existing mobile patterns require.

- [ ] **Step 3: Extend badge tone utility**

Map urgent/high to danger/warning and resolved/archived/dismissed to explicit neutral/success tones without changing unrelated behavior.

- [ ] **Step 4: Run spacing/UI tests and commit**

```bash
git add src/app/globals.css src/lib/utils.ts src/features/layout/balanced-spacing.test.ts src/features/notifications/ui.test.ts
git commit -m "feat: add responsive notification layouts"
```

## Task 14: End-to-end security, deployment documentation, and release verification

**Files:**
- Create: `src/features/notifications/e2e.test.ts`
- Modify: all notification test files
- Modify: `src/features/build-config.test.ts`
- Modify: `README.md`
- Modify: `.env.example` only if an existing cron-related environment comment needs clarification; no new secret is required
- Create outside repository: `/mnt/data/phase9_post_migration_verification.sql`

**Interfaces:**
- Produces: repository-level proof for migration shape, cron, role boundaries, safe payloads, routes, regression compatibility, and deployment instructions.

- [ ] **Step 1: Complete source-ownership and route tests**

Assert all approved routes exist and no mock notification arrays remain. Assert browser-facing code never contains service-role keys, raw source keys, recipient IDs, safe-context payloads, private reasons, or arbitrary action URLs.

- [ ] **Step 2: Complete security and idempotency tests**

Verify:

```text
recipient lifecycle actions derive auth.uid()
bulk actions are atomic and owner-bound
rule mutations and manual cycle are Super Admin-only
HR rule/cycle access is read-only
manager routing is direct-report-only
payload guard covers every forbidden token
source keys include recipient and escalation level
advisory locking prevents overlap
one processor failure can produce partial_failed
resolved retention archives without deletion
cron schedule is exactly 0 0 * * *
```

- [ ] **Step 3: Add README deployment and operating procedures**

Document exact order:

```text
1. Apply 202607170005_notifications_reminders_escalations.sql after 202607170004_dashboard_analytics.sql.
2. Confirm pg_cron is enabled and hris-daily-notification-cycle exists.
3. Confirm the schedule is 0 0 * * * and maps to 8:00 AM Asia/Manila.
4. Confirm six seeded rules and 90-day retention defaults.
5. Test recipient read/unread/dismiss/bulk actions with separate accounts.
6. Test HR read-only settings and Super Admin rule edits/reset/manual cycle.
7. Verify retries do not duplicate recipient-stage notifications.
8. Verify manager document escalations remain status-only.
9. Keep private notes, document metadata, source payloads, and raw SQL errors out of logs.
10. Use forward-only patch migrations for post-deployment defects.
```

- [ ] **Step 4: Create post-migration verification SQL**

The query must verify:

```text
new columns and three tables exist
RLS enabled
six seeded rules and exact defaults
protected functions are security definer with fixed search path
recipient lifecycle execute granted only to authenticated
internal processors unavailable to browser roles
cron job name and schedule
no direct authenticated mutation grants
```

- [ ] **Step 5: Apply migration locally when available**

Preferred:

```bash
npx supabase start
npx supabase db reset
```

Then verify cron/function/table state with `psql`. If local Supabase cannot run, record the limitation and require SQL Editor application before deployment.

- [ ] **Step 6: Run complete release suite**

```bash
npm ci
npm test
npx tsc --noEmit
npm run build
```

Record exact pass count and exit codes. Do not claim migration execution if it was not applied.

- [ ] **Step 7: Manually verify acceptance matrix**

Use separate Employee, Manager, HR Admin, document reviewer, and Super Admin sessions. Check every acceptance criterion from the approved design, including cron/manual idempotency and 90-day archive behavior using controlled test dates.

- [ ] **Step 8: Commit final verification**

```bash
git add src/features/notifications src/features/build-config.test.ts README.md .env.example supabase/migrations/202607170005_notifications_reminders_escalations.sql
git commit -m "test: verify Phase 9 notifications"
```

## Task 15: Clean repository package, report, verification SQL, and checksum

**Files:**
- Create outside repository: `/mnt/data/hris-repository-phase-9-notifications.zip`
- Create outside repository: `/mnt/data/phase-9-notifications-report.md`
- Create outside repository: `/mnt/data/phase-9-notifications.sha256`
- Create outside repository: `/mnt/data/202607170005_notifications_reminders_escalations.sql`
- Create outside repository: `/mnt/data/phase9_post_migration_verification.sql`

**Interfaces:**
- Consumes: verified Task 14 repository.
- Produces: user-deliverable source archive, factual verification report, migration, verification SQL, and checksum.

- [ ] **Step 1: Confirm clean repository state and final history**

```bash
git status --short
git log --oneline -15
```

Do not package uncommitted changes.

- [ ] **Step 2: Re-run verification immediately before packaging**

```bash
npm test | tee /tmp/phase9-tests.log
npx tsc --noEmit | tee /tmp/phase9-tsc.log
npm run build | tee /tmp/phase9-build.log
```

Capture exact outputs and exit codes.

- [ ] **Step 3: Create a clean ZIP**

Archive one top-level `hris-repository` directory while excluding:

```text
.git
.next
node_modules
.env
.env.local
.env.production
.env.development
tsconfig.tsbuildinfo
*.log
```

Retain `.env.example`.

- [ ] **Step 4: Verify archive integrity and required files**

Confirm the ZIP contains:

```text
202607170005_notifications_reminders_escalations.sql
2026-07-17-phase-9-notifications-reminders-escalations-design.md
2026-07-17-phase-9-notifications-reminders-escalations.md
```

Confirm forbidden paths are absent.

- [ ] **Step 5: Write factual report**

Include final commit, migration name, exact test count, TypeScript result, build result, local Supabase status, ZIP integrity, delivered capabilities, and deployment order. Never report a migration run that did not occur.

- [ ] **Step 6: Generate and verify SHA-256**

```bash
sha256sum /mnt/data/hris-repository-phase-9-notifications.zip > /mnt/data/phase-9-notifications.sha256
sha256sum -c /mnt/data/phase-9-notifications.sha256
```

- [ ] **Step 7: Deliver all artifacts**

```text
sandbox:/mnt/data/hris-repository-phase-9-notifications.zip
sandbox:/mnt/data/phase-9-notifications-report.md
sandbox:/mnt/data/phase-9-notifications.sha256
sandbox:/mnt/data/202607170005_notifications_reminders_escalations.sql
sandbox:/mnt/data/phase9_post_migration_verification.sql
```

## Final execution checklist

```text
[ ] Baseline verified before Phase 9 changes
[ ] Forward-only migration created after 202607170004
[ ] Six rules seeded with exact approved defaults
[ ] Daily cron scheduled for 8:00 AM Asia/Manila
[ ] Advisory locking and deterministic source keys verified
[ ] Recipient lifecycle and bulk actions owner-bound
[ ] Manager document escalations status-only
[ ] HR settings read-only and Super Admin mutations enforced
[ ] Immediate workflow notifications verified
[ ] Resolved notifications archive after configured retention
[ ] Exact test count with zero failures
[ ] TypeScript exit 0
[ ] Production build exit 0
[ ] Local Supabase execution passed or limitation recorded
[ ] ZIP integrity and exclusion checks passed
[ ] SHA-256 verified
```

## Spec coverage matrix

| Approved requirement | Plan tasks |
|---|---|
| In-app-only delivery | Global Constraints; Tasks 2–15 |
| Immediate event alerts | Task 7 |
| Daily 8:00 AM Asia/Manila cycle | Tasks 5, 14 |
| Configurable per-type timing | Tasks 2, 4, 10 |
| Gentle role escalation | Tasks 5–6 |
| Employee → Manager → HR → Super Admin routing | Task 6 |
| 90-day resolved retention | Tasks 2, 5, 14 |
| Full `/notifications` center | Tasks 8–9 |
| `/admin/notifications/settings` | Tasks 4, 10 |
| Immutable event history | Tasks 2–4 |
| Cycle monitoring and partial failure | Tasks 4–5, 10 |
| Safe action URL allowlist | Tasks 1–3 |
| Safe payload restrictions | Tasks 2, 6–8, 14 |
| Recipient-only RLS | Tasks 2–4, 14 |
| Bulk read/dismiss | Tasks 3, 8–9 |
| Shell unread badge | Task 11 |
| Phase 8 dashboard integration | Task 12 |
| Balanced responsive layouts | Task 13 |
| Release verification and artifacts | Tasks 14–15 |

## Plan self-review

- **Spec coverage:** Every approved design section maps to one or more tasks in the coverage matrix.
- **Migration safety:** The plan creates only the forward migration `202607170005_notifications_reminders_escalations.sql` and never edits applied SQL files.
- **Type consistency:** Task 1 defines shared unions and DTOs used by later query, action, dashboard, and component tasks.
- **RPC consistency:** Protected workflow names are fixed before Task 2 and reused consistently.
- **Security consistency:** Browser actions never supply recipient IDs, action URLs, source keys, or payloads; manager document messages remain status-only.
- **Scheduling consistency:** Cron is fixed to `0 0 * * *`, corresponding to 8:00 AM Asia/Manila.
- **Scope:** Email, SMS, push, Edge Functions, external schedulers, personal notification preferences, arbitrary action URLs, permanent notification deletion, predictive alerts, and department-specific escalation chains remain excluded.
- **Evidence:** Completion requires fresh tests, TypeScript, production build, migration execution or an explicit limitation, acceptance checks, ZIP integrity, and checksum verification.
