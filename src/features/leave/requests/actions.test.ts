import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL("../../../../supabase/migrations/202607160001_leave_management.sql", import.meta.url),
  "utf8",
);

const employeeActions = await readFile(
  new URL("../../../app/(dashboard)/employee/leave/actions.ts", import.meta.url),
  "utf8",
);
const adminActions = await readFile(
  new URL("../../../app/(dashboard)/admin/leave/actions.ts", import.meta.url),
  "utf8",
);
function body(name: string) {
  return sql.match(new RegExp(`create or replace function public\\.${name}\\s*\\([\\s\\S]*?\\$\\$;`, "i"))?.[0] ?? "";
}

test("draft creation restricts employees to themselves and permits HR on behalf", () => {
  const create = body("create_leave_draft");
  assert.match(create, /public\.current_employee_id\(\)/i);
  assert.match(create, /public\.is_hr_admin\(\)/i);
  assert.match(create, /created_source/i);
  assert.match(create, /'employee'|'hr'/i);
});

test("draft update locks group and checks expected revision", () => {
  const update = body("update_leave_draft");
  assert.match(update, /from public\.leave_request_groups[\s\S]+for update/i);
  assert.match(update, /p_expected_revision_id/i);
  assert.match(update, /current_status <> 'draft'/i);
  assert.match(update, /LEAVE_REQUEST_STALE/i);
});

test("submitted revisions cannot be changed or deleted", () => {
  assert.match(sql, /create or replace function public\.prevent_submitted_leave_revision_mutation/i);
  assert.match(sql, /old\.frozen_at is not null/i);
  assert.match(sql, /before update or delete on public\.leave_request_revisions/i);
});

test("preview resolves policy, schedule, holiday, rest day, and deterministic half-day boundary", () => {
  const resolver = body("resolve_leave_day_context");
  assert.match(resolver, /leave_type_versions/i);
  assert.match(resolver, /employee_schedule_assignments/i);
  assert.match(resolver, /work_schedule_versions/i);
  assert.match(resolver, /resolve_active_holiday/i);
  assert.match(resolver, /scheduled_start_at \+ \(scheduled_end_at - scheduled_start_at\) \/ 2/i);
});

test("draft preview is advisory and creates no request-day or ledger rows", () => {
  const preview = body("preview_leave_request");
  assert.doesNotMatch(preview, /insert into public\.leave_request_days/i);
  assert.doesNotMatch(preview, /insert into public\.leave_balance_ledger/i);
  assert.match(preview, /generate_series/i);
});

test("draft deletion is the only permanent request deletion path", () => {
  const deletion = body("delete_leave_draft");
  assert.match(deletion, /current_status <> 'draft'/i);
  assert.match(deletion, /delete from public\.leave_request_actions/i);
  assert.match(deletion, /delete from public\.leave_request_groups/i);
});

test("draft deletion can remove draft action rows without weakening submitted history", () => {
  assert.match(sql, /create or replace function public\.prevent_submitted_leave_request_action_mutation/i);
  assert.match(sql, /if tg_op = 'DELETE'[\s\S]+v_status = 'draft'[\s\S]+return old/i);
  assert.match(sql, /raise exception using errcode = 'P0001', message = 'LEAVE_IMMUTABLE_RECORD'/i);
  assert.match(sql, /before update or delete on public\.leave_request_actions[\s\S]+prevent_submitted_leave_request_action_mutation/i);
});

test("replacement drafts can reference only withdrawn or cancelled requests for the same employee", () => {
  const create = body("create_leave_draft");
  const update = body("update_leave_draft");
  for (const source of [create, update]) {
    assert.match(source, /employee_id/i);
    assert.match(source, /current_status in \('withdrawn', 'cancelled'\)/i);
  }
});

test("draft preview enforces employee date windows while allowing HR overrides", () => {
  const preview = body("preview_leave_request");
  assert.match(preview, /30/);
  assert.match(preview, /365/);
  assert.match(preview, /public\.is_hr_admin\(\)/i);
  assert.match(preview, /LEAVE_OUTSIDE_DATE_WINDOW/i);
});

test("draft creation validates active employee and normalizes private note", () => {
  const create = body("create_leave_draft");
  assert.match(create, /archived_at is null/i);
  assert.match(create, /normalize_leave_private_text/i);
});

test("submission freezes one policy version and immutable day snapshots", () => {
  const submit = body("submit_leave_request_internal");
  assert.match(submit, /resolve_leave_type_version/i);
  assert.match(submit, /insert into public\.leave_request_days/i);
  assert.match(submit, /insert into public\.leave_request_day_revisions/i);
  assert.match(submit, /frozen_at = now\(\)/i);
  assert.match(submit, /update public\.leave_request_attachments[\s\S]+frozen_at = now\(\)/i);
  assert.match(submit, /current_status = 'pending'/i);
  assert.doesNotMatch(submit, /insert into public\.leave_balance_ledger/i);
});

test("submission enforces employee window, one year, half-day, and chargeable-day rules", () => {
  const submit = body("submit_leave_request_internal");
  assert.match(submit, /v_company_date - 30/i);
  assert.match(submit, /v_company_date \+ 365/i);
  assert.match(submit, /LEAVE_OUTSIDE_DATE_WINDOW/i);
  assert.match(submit, /LEAVE_CROSSES_YEAR/i);
  assert.match(submit, /LEAVE_HALF_DAY_RANGE_INVALID/i);
  assert.match(submit, /LEAVE_NO_CHARGEABLE_DAYS/i);
});

test("submission validates notes and documents against frozen policy", () => {
  const submit = body("submit_leave_request_internal");
  assert.match(submit, /employee_note_required/i);
  assert.match(submit, /document_required_min_units/i);
  assert.match(submit, /LEAVE_DOCUMENT_REQUIRED/i);
  assert.match(submit, /count\(\*\)[\s\S]+leave_request_attachments/i);
});

test("overlap rules allow opposite halves but block full and matching halves", () => {
  const overlap = body("leave_duration_overlaps");
  assert.match(overlap, /p_left = 'full_day' or p_right = 'full_day'/i);
  assert.match(overlap, /p_left = p_right/i);
  assert.doesNotMatch(overlap, /first_half'[\s\S]*second_half'[\s\S]*true/i);
});

test("submission uses public entry points and keeps the internal helper private", () => {
  const employee = body("submit_leave_request");
  const hr = body("create_hr_leave_request");
  assert.match(employee, /public\.current_employee_id\(\)/i);
  assert.match(employee, /submit_leave_request_internal[\s\S]+false/i);
  assert.match(hr, /public\.is_hr_admin\(\)/i);
  assert.match(hr, /submit_leave_request_internal[\s\S]+true/i);
  assert.match(sql, /revoke all on function public\.submit_leave_request_internal\(uuid,uuid,boolean\)[\s\S]+authenticated/i);
});

test("review locks the request and checks expected revision and status", () => {
  const source = body("review_leave_request");
  assert.match(source, /for update/i);
  assert.match(source, /p_expected_revision_id/i);
  assert.match(source, /p_expected_status/i);
  assert.match(source, /p_expected_day_fingerprint/i);
  assert.match(source, /LEAVE_REQUEST_STALE/i);
  assert.match(source, /consume_leave_balance/i);
  assert.match(source, /approved_leave_charge/i);
  assert.match(source, /recalculate_attendance_for_leave_dates/i);
});

test("rejection requires a private reason and creates no ledger charge", () => {
  const source = body("review_leave_request");
  assert.match(source, /p_decision = 'reject'/i);
  assert.match(source, /LEAVE_REJECTION_REASON_REQUIRED/i);
  const rejectionBranch = source.split(/p_decision = 'reject'/i)[1] ?? "";
  assert.doesNotMatch(rejectionBranch.split(/end if/i)[0] ?? "", /consume_leave_balance/i);
});

test("employee withdrawal is pending-only and creates no ledger row", () => {
  const source = body("withdraw_leave_request");
  assert.match(source, /current_status <> 'pending'/i);
  assert.match(source, /LEAVE_REQUEST_STALE/i);
  assert.match(source, /current_employee_id\(\)/i);
  assert.doesNotMatch(source, /insert into public\.leave_balance_ledger/i);
});

test("approved cancellation restores original sources and requires HR", () => {
  const source = body("cancel_approved_leave_request");
  assert.match(source, /is_hr_admin\(\)/i);
  assert.match(source, /current_status <> 'approved'/i);
  assert.match(source, /restore_leave_charge/i);
  assert.match(source, /LEAVE_CANCELLATION_REASON_REQUIRED/i);
  assert.match(source, /recalculate_attendance_for_leave_dates/i);
});

test("replacement supersedes the old request only after approval", () => {
  const source = body("review_leave_request");
  assert.match(source, /replaces_request_group_id/i);
  assert.match(source, /superseded_by_request_group_id/i);
  assert.match(source, /'superseded'/i);
  assert.match(source, /current_status = 'approved'[\s\S]+replaces_request_group_id/i);
});

test("lifecycle actions write safe audit events without private review text", () => {
  for (const name of ["withdraw_leave_request", "review_leave_request", "cancel_approved_leave_request"]) {
    const source = body(name);
    const auditMetadata = [...source.matchAll(/write_leave_audit\([\s\S]*?jsonb_build_object\(([\s\S]*?)\)\s*\)\s*;/gi)];
    assert.ok(auditMetadata.length > 0, `${name} must write an audit event`);
    for (const call of auditMetadata) {
      assert.doesNotMatch(call[1] ?? "", /v_(review_text|reason)/i);
    }
  }
});


test("employee actions expose draft preview submit and withdrawal workflows", () => {
  for (const rpc of [
    "create_leave_draft",
    "update_leave_draft",
    "delete_leave_draft",
    "submit_leave_request",
    "withdraw_leave_request",
  ]) assert.match(employeeActions, new RegExp(rpc));
  assert.match(employeeActions, /previewLeaveRequest/);
});

test("admin actions expose HR submission and immutable lifecycle decisions", () => {
  for (const rpc of [
    "create_leave_draft",
    "create_hr_leave_request",
    "review_leave_request",
    "cancel_approved_leave_request",
    "resolve_leave_attendance_conflict",
  ]) assert.match(adminActions, new RegExp(rpc));
});
