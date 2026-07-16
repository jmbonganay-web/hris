import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../../../supabase/migrations/202607160001_leave_management.sql", import.meta.url),
  "utf8",
);

function body(name: string) {
  const match = migration.match(
    new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`, "i"),
  );
  assert.ok(match, `${name} must exist`);
  return match[0];
}

test("approved leave date recalculation appends revisions", () => {
  const source = body("recalculate_leave_request_dates");
  assert.match(source, /insert into public\.leave_request_day_revisions/i);
  assert.match(source, /update public\.leave_request_days/i);
  assert.doesNotMatch(source, /update public\.leave_request_day_revisions/i);
});

test("nonchargeable replacement restores the original charge", () => {
  const source = body("recalculate_leave_request_dates");
  assert.match(source, /recalculation_release/i);
  assert.match(source, /restore_leave_charge/i);
  assert.match(source, /request_day_id = v_day\.id/i);
});

test("new chargeable workday checks balance before charging", () => {
  const source = body("recalculate_leave_request_dates");
  assert.match(source, /get_leave_balance/i);
  assert.match(source, /insufficient_balance_after_recalculation/i);
  assert.match(source, /consume_leave_balance/i);
});

test("schedule assignment and holiday activation trigger leave recalculation", () => {
  assert.match(migration, /trigger_leave_recalculation_for_schedule/i);
  assert.match(migration, /trigger_leave_recalculation_for_schedule_version/i);
  assert.match(migration, /trigger_leave_recalculation_for_holiday/i);
  assert.match(migration, /after insert or update on public\.employee_schedule_assignments/i);
  assert.match(migration, /after insert on public\.work_schedule_versions/i);
  assert.match(migration, /after insert or update of active_version_id on public\.holiday_calendar_groups/i);
});

test("recalculation serializes before locking request rows", () => {
  const source = body("recalculate_leave_request_dates");
  const advisoryLock = source.indexOf("pg_advisory_xact_lock");
  const requestRowLock = source.search(/select \* into v_group[\s\S]*?from public\.leave_request_groups[\s\S]*?for update/i);
  assert.ok(advisoryLock >= 0);
  assert.ok(requestRowLock > advisoryLock);
});

test("recalculation releases use the original charge date for same-request reuse", () => {
  const source = body("recalculate_leave_request_dates");
  assert.match(source, /select ledger\.id, ledger\.effective_date/i);
  assert.match(source, /jsonb_build_object\('source', p_source\),[\s\S]*?v_charge\.effective_date/i);
});

test("restorations lock the balance account before charge rows", () => {
  const source = body("restore_leave_charge");
  const accountLock = source.search(/from public\.leave_balance_accounts[\s\S]*?for update/i);
  const chargeLock = source.search(/select \* into strict v_charge[\s\S]*?for update/i);
  assert.ok(accountLock >= 0);
  assert.ok(chargeLock > accountLock);
});

test("schedule and holiday triggers run against the final transaction state", () => {
  assert.match(migration, /create constraint trigger trigger_leave_recalculation_for_schedule[\s\S]*?deferrable initially deferred/i);
  assert.match(migration, /create constraint trigger trigger_leave_recalculation_for_schedule_version[\s\S]*?deferrable initially deferred/i);
  assert.match(migration, /create constraint trigger trigger_leave_recalculation_for_holiday[\s\S]*?deferrable initially deferred/i);
});

test("insufficient balance rolls back request mutations before recording one conflict", () => {
  const source = body("recalculate_leave_request_dates");
  assert.match(source, /when raise_exception then/i);
  assert.match(source, /insufficient_balance_after_recalculation/i);
  assert.match(source, /upsert_leave_attendance_conflict/i);
});
