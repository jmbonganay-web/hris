import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL("../../../supabase/migrations/202607160001_leave_management.sql", import.meta.url),
  "utf8",
);
function body(name: string) {
  return sql.match(new RegExp(`create or replace function public\\.${name}\\s*\\([\\s\\S]*?\\$\\$;`, "i"))?.[0] ?? "";
}

test("submission locks employee and tracked balance account before reservation checks", () => {
  const submit = body("submit_leave_request_internal");
  const employeeLock = submit.search(/from public\.employees[\s\S]+for update/i);
  const accountLock = submit.search(/get_or_create_leave_balance_account/i);
  const reservationCheck = submit.search(/leave_pending_reservations/i);
  assert.ok(employeeLock >= 0);
  assert.ok(accountLock > employeeLock);
  assert.ok(reservationCheck > accountLock);
});

test("submission overlap query locks blocking request groups", () => {
  const submit = body("submit_leave_request_internal");
  assert.match(submit, /current_status in \('pending','approved'\)/i);
  assert.match(submit, /for update of request_group/i);
  assert.match(submit, /LEAVE_OVERLAP/i);
});

test("pending reservations exclude the current request during revalidation", () => {
  const submit = body("submit_leave_request_internal");
  assert.match(submit, /request_group\.id <> p_request_group_id/i);
  assert.match(submit, /request_group\.current_status = 'pending'/i);
});

test("review serializes the employee and balance account before charging", () => {
  const review = body("review_leave_request");
  const employeeLock = review.search(/from public\.employees[\s\S]+for update/i);
  const accountLock = review.search(/get_or_create_leave_balance_account/i);
  const charge = review.search(/consume_leave_balance/i);
  assert.ok(employeeLock >= 0);
  assert.ok(accountLock > employeeLock);
  assert.ok(charge > accountLock);
});

test("review compares the exact active-day fingerprint and chargeable units", () => {
  const review = body("review_leave_request");
  assert.match(review, /p_expected_day_fingerprint/i);
  assert.match(review, /p_expected_chargeable_units/i);
  assert.match(review, /digest\(/i);
  assert.match(review, /LEAVE_REQUEST_STALE/i);
});

test("stale guards reject null expected revisions and statuses", () => {
  for (const name of [
    "submit_leave_request_internal",
    "withdraw_leave_request",
    "review_leave_request",
    "cancel_approved_leave_request",
  ]) {
    assert.match(body(name), /active_revision_id is distinct from p_expected_revision_id/i);
  }
  assert.match(body("review_leave_request"), /p_expected_status is distinct from 'pending'/i);
});

test("schedule and holiday recalculation cannot race approval", () => {
  const review = body("review_leave_request");
  const recalc = body("recalculate_leave_request_dates");
  assert.match(review, /pg_advisory_xact_lock/i);
  assert.match(recalc, /pg_advisory_xact_lock/i);
  assert.match(review, /for update/i);
  assert.match(recalc, /for update/i);
});


test("approval rechecks status, active revision, units, fingerprint, and current day context before charging", () => {
  const review = body("review_leave_request");
  const staleStatus = review.search(/current_status is distinct from p_expected_status/i);
  const staleRevision = review.search(/active_revision_id is distinct from p_expected_revision_id/i);
  const staleUnits = review.search(/v_chargeable_units <> p_expected_chargeable_units/i);
  const staleFingerprint = review.search(/v_day_fingerprint is distinct from p_expected_day_fingerprint/i);
  const contextCheck = review.search(/resolve_leave_day_context/i);
  const charge = review.search(/consume_leave_balance/i);
  for (const position of [staleStatus, staleRevision, staleUnits, staleFingerprint, contextCheck]) assert.ok(position >= 0);
  assert.ok(charge > contextCheck);
});

test("approval locks the request and balance source so final units cannot be consumed twice", () => {
  const review = body("review_leave_request");
  assert.match(review, /from public\.leave_request_groups[\s\S]*?for update/i);
  assert.match(review, /get_or_create_leave_balance_account/i);
  assert.match(body("get_or_create_leave_balance_account"), /from public\.leave_balance_accounts[\s\S]*?for update/i);
  assert.match(review, /current_status is distinct from p_expected_status[\s\S]*?LEAVE_REQUEST_STALE/i);
  assert.match(body("consume_leave_balance"), /for update/i);
});

test("withdrawal and approval serialize the same request so one stale loser remains", () => {
  const withdraw = body("withdraw_leave_request");
  const review = body("review_leave_request");
  for (const workflow of [withdraw, review]) {
    assert.match(workflow, /from public\.leave_request_groups[\s\S]*?for update/i);
    assert.match(workflow, /LEAVE_REQUEST_STALE/i);
  }
  assert.match(withdraw, /current_status <> 'pending'/i);
  assert.match(review, /current_status is distinct from p_expected_status/i);
});

test("year opening and individual allocation use deterministic idempotency keys", () => {
  const yearOpening = body("generate_leave_year_opening");
  const individual = body("generate_individual_leave_allocation");
  assert.match(yearOpening, /pg_advisory_xact_lock\(hashtextextended\('leave-year:' \|\| p_leave_year::text/i);
  assert.match(yearOpening, /generation_key/i);
  assert.match(yearOpening, /on conflict \(generation_key\) do nothing/i);
  assert.match(individual, /generation_key/i);
  assert.match(individual, /on conflict \(generation_key\) do nothing/i);
  assert.match(individual, /where generation_key = v_key/i);
});

test("cancellation restores each original charge at most once", () => {
  const cancel = body("cancel_approved_leave_request");
  const restore = body("restore_leave_charge");
  assert.match(cancel, /current_status <> 'approved'[\s\S]*?LEAVE_REQUEST_STALE/i);
  assert.match(cancel, /restoration\.reversal_of_entry_id = ledger\.id/i);
  assert.match(cancel, /public\.restore_leave_charge/i);
  assert.match(restore, /reversal_of_entry_id = v_charge\.id/i);
  assert.match(restore, /if v_units = 0 then[\s\S]*?return null/i);
});

function advisoryIdentity(source: string) {
  return source.match(/hashtextextended\([\s\S]*?leave_year::text[\s\S]*?,\s*0\s*\)/i)?.[0]
    .replace(/v_(?:group|policy|revision|lock)\./gi, "")
    .replace(/\s+/g, " ")
    .toLowerCase() ?? "";
}

test("approval and schedule or holiday recalculation use the same leave-account advisory identity", () => {
  const reviewKey = advisoryIdentity(body("review_leave_request"));
  const recalcKey = advisoryIdentity(body("recalculate_leave_request_dates"));
  assert.notEqual(reviewKey, "");
  assert.notEqual(recalcKey, "");
  for (const fragment of ["employee_id::text", "leave_type_id::text", "leave_year::text"]) {
    assert.match(reviewKey, new RegExp(fragment));
    assert.match(recalcKey, new RegExp(fragment));
  }
});

test("HR balance adjustment and individual allocation lock employee-year balance state", () => {
  const adjustment = body("create_leave_balance_adjustment");
  const individual = body("generate_individual_leave_allocation");
  assert.match(adjustment, /get_or_create_leave_balance_account/i);
  assert.match(body("get_or_create_leave_balance_account"), /from public\.leave_balance_accounts[\s\S]*?for update/i);
  assert.match(individual, /from public\.employees[\s\S]*?for update/i);
  assert.match(individual, /from public\.employee_leave_year_settings[\s\S]*?for update/i);
});
