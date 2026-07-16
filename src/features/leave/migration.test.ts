import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { attendanceCalculationBaseStatuses } from "../attendance/calculations/types.ts";
import { leaveClassifications } from "./types.ts";

const sql = await readFile(
  new URL("../../../supabase/migrations/202607160001_leave_management.sql", import.meta.url),
  "utf8",
);

const tables = [
  "leave_types",
  "leave_type_versions",
  "employee_leave_year_settings",
  "leave_request_groups",
  "leave_request_revisions",
  "leave_request_days",
  "leave_request_day_revisions",
  "leave_request_actions",
  "leave_request_attachments",
  "leave_balance_accounts",
  "leave_balance_ledger",
  "leave_attendance_conflicts",
];

test("migration creates every approved leave table", () => {
  for (const table of tables) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, "i"));
  }
});

test("migration preserves stable identities and active pointers", () => {
  assert.match(sql, /leave_types_code_unique/i);
  assert.match(sql, /leave_type_versions_revision_unique/i);
  assert.match(sql, /leave_request_groups_active_revision_fkey/i);
  assert.match(sql, /leave_request_days_active_revision_fkey/i);
  assert.match(sql, /employee_leave_year_setting_unique/i);
  assert.match(sql, /leave_balance_account_unique/i);
});

test("approved lifecycle, duration, units, classifications, ledger entries, and conflicts are constrained", () => {
  for (const value of [
    "draft", "pending", "approved", "rejected", "withdrawn", "cancelled", "superseded",
    "full_day", "first_half", "second_half",
    "paid_leave", "unpaid_leave", "non_chargeable_holiday", "non_chargeable_rest_day",
    "non_chargeable_no_schedule", "attendance_precedence",
    "annual_allocation", "carryover", "hr_adjustment_credit", "hr_adjustment_debit",
    "approved_leave_charge", "cancellation_restoration", "attendance_conflict_release",
    "recalculation_charge", "recalculation_release",
    "full_day_completed_attendance", "full_day_incomplete_attendance",
    "half_day_covered_time_overlap", "schedule_recalculation_failed",
    "holiday_recalculation_failed", "insufficient_balance_after_recalculation",
  ]) assert.match(sql, new RegExp(`'${value}'`, "i"));
  assert.match(sql, /units \* 2 = trunc\(units \* 2\)/i);
  assert.match(sql, /chargeable_units in \(0, 0\.5, 1\)/i);
});

test("submitted and accounting history use append-only guards", () => {
  assert.match(sql, /create or replace function public\.prevent_leave_immutable_mutation/i);
  for (const table of [
    "leave_type_versions",
    "leave_request_day_revisions",
    "leave_request_actions",
    "leave_balance_ledger",
  ]) assert.match(sql, new RegExp(`before update or delete on public\\.${table}`, "i"));
});

test("request-day identities are immutable while the active revision pointer may advance", () => {
  assert.match(sql, /create or replace function public\.prevent_leave_request_day_identity_mutation/i);
  assert.match(sql, /before update or delete on public\.leave_request_days/i);
  assert.match(sql, /new\.request_revision_id is distinct from old\.request_revision_id/i);
  assert.match(sql, /new\.leave_date is distinct from old\.leave_date/i);
  assert.match(sql, /new\.active_revision_id is not null/i);
  assert.match(sql, /day_revision\.request_day_id = old\.id/i);
  assert.match(sql, /return new;/i);
});

test("pending reservations and active day state are derived views", () => {
  assert.match(sql, /create or replace view public\.leave_pending_reservations/i);
  assert.match(sql, /current_status = 'pending'/i);
  assert.match(sql, /create or replace view public\.leave_current_day_state/i);
  assert.match(sql, /active_revision_id/i);
});

test("active day state exposes request_day_id exactly once", () => {
  const match = sql.match(
    /create or replace view public\.leave_current_day_state[\s\S]*?as\s+select([\s\S]*?)from public\.leave_request_days as day/i,
  );

  assert.ok(match, "leave_current_day_state definition should be present");
  const selectList = match[1];
  assert.equal((selectList.match(/\brequest_day_id\b/gi) ?? []).length, 1);
  assert.doesNotMatch(selectList, /revision\.\*/i);
});

test("leave storage bucket is private and constrained", () => {
  assert.match(sql, /insert into storage\.buckets/i);
  assert.match(sql, /'leave-documents'/i);
  assert.match(sql, /10 \* 1024 \* 1024/i);
  assert.match(sql, /application\/pdf/i);
  assert.match(sql, /image\/jpeg/i);
  assert.match(sql, /image\/png/i);
});

test("migration is one transaction and refreshes PostgREST once", () => {
  const normalized = sql.toLowerCase();
  assert.equal((normalized.match(/^begin;/gm) ?? []).length, 1);
  assert.equal((normalized.match(/^commit;/gm) ?? []).length, 1);
  assert.equal((normalized.match(/notify pgrst, 'reload schema';/g) ?? []).length, 1);
});


const views = ["leave_pending_reservations"];

const publicRpcs = [
  "create_leave_type",
  "create_leave_type_version",
  "archive_leave_type",
  "create_leave_draft",
  "update_leave_draft",
  "delete_leave_draft",
  "submit_leave_request",
  "create_hr_leave_request",
  "withdraw_leave_request",
  "review_leave_request",
  "cancel_approved_leave_request",
  "create_leave_balance_adjustment",
  "upsert_employee_leave_year_setting",
  "preview_leave_year_opening",
  "generate_leave_year_opening",
  "generate_individual_leave_allocation",
  "recalculate_leave_request_dates",
  "resolve_leave_attendance_conflict",
];

const stableErrors = [
  "LEAVE_INSUFFICIENT_BALANCE",
  "LEAVE_OVERLAP",
  "LEAVE_NO_CHARGEABLE_DAYS",
  "LEAVE_OUTSIDE_DATE_WINDOW",
  "LEAVE_CROSSES_YEAR",
  "LEAVE_HALF_DAY_RANGE_INVALID",
  "LEAVE_DOCUMENT_REQUIRED",
  "LEAVE_POLICY_INACTIVE",
  "LEAVE_NOT_ELIGIBLE",
  "LEAVE_REQUEST_STALE",
  "LEAVE_RECALCULATION_FAILED",
  "LEAVE_ATTACHMENT_INVALID",
  "LEAVE_PERMISSION_DENIED",
  "LEAVE_INVALID_STATUS",
  "LEAVE_ADJUSTMENT_REASON_REQUIRED",
  "LEAVE_REJECTION_REASON_REQUIRED",
  "LEAVE_CANCELLATION_REASON_REQUIRED",
  "LEAVE_GENERATION_CONFLICT",
];

test("migration creates every approved leave view and public workflow RPC", () => {
  for (const view of views) {
    assert.match(sql, new RegExp(`create or replace view public\\.${view}`, "i"));
  }
  for (const rpc of publicRpcs) {
    assert.match(sql, new RegExp(`create or replace function public\\.${rpc}\\s*\\(`, "i"));
  }
});

test("migration exposes all stable leave error codes", () => {
  for (const code of stableErrors) assert.match(sql, new RegExp(code, "i"));
});

test("database and TypeScript contracts include paid and unpaid leave statuses", () => {
  for (const status of ["paid_leave", "unpaid_leave"] as const) {
    assert.match(sql, new RegExp(`'${status}'`, "i"));
    assert.ok(leaveClassifications.includes(status));
    assert.ok(attendanceCalculationBaseStatuses.includes(status));
  }
});

test("migration declares the required indexes for active requests, reservations, ledger, and conflicts", () => {
  for (const fragment of [
    "leave_request_groups_employee_status_idx",
    "leave_request_days_date_idx",
    "leave_balance_ledger_account_expiration_idx",
    "leave_balance_ledger_generation_unique",
    "leave_conflicts_queue_idx",
  ]) assert.match(sql, new RegExp(fragment, "i"));
});
