import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL("../../../../supabase/migrations/202607160001_leave_management.sql", import.meta.url),
  "utf8",
);

const adminActions = await readFile(
  new URL("../../../app/(dashboard)/admin/leave/actions.ts", import.meta.url),
  "utf8",
);

function body(name: string) {
  return sql.match(new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\$\\$;`, "i"))?.[0] ?? "";
}

test("balance accounts are lock rows and totals derive from unexpired source remainder", () => {
  assert.match(body("get_or_create_leave_balance_account"), /on conflict \(employee_id, leave_type_id, leave_year\)/i);
  assert.match(body("get_leave_balance"), /sum\(public\.get_leave_source_remaining/i);
  assert.match(body("get_leave_source_remaining"), /source\.expires_on is null or source\.expires_on >= p_as_of_date/i);
  assert.match(body("get_leave_source_remaining"), /source\.effective_date <= p_as_of_date/i);
});

test("consumption orders expiring sources first then older sources", () => {
  const consume = body("consume_leave_balance");
  assert.match(consume, /order by source\.expires_on asc nulls last, source\.created_at asc, source\.id asc/i);
  assert.match(consume, /for update/i);
  assert.match(consume, /LEAVE_INSUFFICIENT_BALANCE/i);
  assert.match(consume, /source_entry_id/i);
});

test("restoration points back to original negative entries and preserves source expiry", () => {
  const restore = body("restore_leave_charge");
  assert.match(restore, /reversal_of_entry_id/i);
  assert.match(restore, /source_entry_id/i);
  assert.match(restore, /v_source\.expires_on/i);
  assert.match(restore, /cancellation_restoration|attendance_conflict_release|recalculation_release/i);
});

test("year opening is previewable, deterministic, and idempotent", () => {
  assert.match(sql, /create or replace function public\.preview_leave_year_opening/i);
  const generate = body("generate_leave_year_opening");
  assert.match(generate, /generation_key/i);
  assert.match(generate, /annual:/i);
  assert.match(generate, /carryover:/i);
  assert.match(generate, /on conflict \(generation_key\) do nothing/i);
  assert.match(generate, /pg_advisory_xact_lock/i);
});

test("bulk generation excludes mid-year hires and inactive records", () => {
  const preview = body("preview_leave_year_opening");
  assert.match(preview, /employee\.hire_date <= make_date\(p_leave_year, 1, 1\)/i);
  assert.match(preview, /employee\.archived_at is null/i);
  assert.match(preview, /employment_status in \('active','probation','on_leave'\)/i);
});

test("carryover is one year only, capped, and expires at target year end", () => {
  const preview = body("preview_leave_year_opening");
  const generate = body("generate_leave_year_opening");
  assert.match(preview, /source\.entry_type <> 'carryover'/i);
  assert.match(preview, /least\(/i);
  assert.match(generate, /make_date\(p_leave_year, 12, 31\)/i);
});

test("negative adjustments consume sources and cannot create a negative balance", () => {
  const adjustment = body("create_leave_balance_adjustment");
  assert.match(adjustment, /LEAVE_ADJUSTMENT_REASON_REQUIRED/i);
  assert.match(adjustment, /public\.consume_leave_balance/i);
  assert.match(adjustment, /hr_adjustment_credit/i);
  assert.match(adjustment, /hr_adjustment_debit/i);
  assert.doesNotMatch(adjustment, /update public\.leave_balance_ledger/i);
});


test("admin actions own balance adjustment and allocation workflows", () => {
  for (const rpc of [
    "create_leave_balance_adjustment",
    "preview_leave_year_opening",
    "generate_leave_year_opening",
    "generate_individual_leave_allocation",
    "upsert_employee_leave_year_setting",
  ]) assert.match(adminActions, new RegExp(rpc));
});
