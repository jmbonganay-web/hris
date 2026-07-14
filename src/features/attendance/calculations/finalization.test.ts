import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../../../../supabase/migrations/202607150001_attendance_policy_calculations.sql", import.meta.url),
  "utf8",
);
const action = await readFile(
  new URL("../../../app/(dashboard)/admin/attendance/finalization/actions.ts", import.meta.url),
  "utf8",
).catch(() => "");

test("finalization distinguishes scheduled and manual authorization", () => {
  assert.match(migration, /create or replace function public\.finalize_attendance_date/i);
  assert.match(migration, /p_run_source = 'manual'/i);
  assert.match(migration, /p_run_source = 'scheduled_job'/i);
  assert.match(migration, /p_target_date <> v_company_date - 1/i);
  assert.match(migration, /FINALIZATION_REASON_REQUIRED/i);
});

test("finalization creates absences and missing clock-outs while skipping finalized results", () => {
  assert.match(migration, /calculate_attendance_day_internal/i);
  assert.match(migration, /not v_active_revision\.is_provisional/i);
  assert.match(migration, /v_absences := v_absences \+ 1/i);
  assert.match(migration, /v_missing := v_missing \+ 1/i);
  assert.match(migration, /unchanged_results_skipped/i);
});

test("finalization records safe run metrics and never audits the private manual reason", () => {
  assert.match(migration, /attendance_finalization\.started/i);
  assert.match(migration, /attendance_finalization\.completed/i);
  assert.match(migration, /attendance_finalization\.failed/i);
  assert.doesNotMatch(migration, /write_employee_audit\([^;]+p_manual_reason/i);
});

test("manual finalization action calls one protected RPC", () => {
  assert.match(action, /requireAttendanceAdmin/);
  assert.match(action, /\.rpc\("finalize_attendance_date"/);
  assert.doesNotMatch(action, /values:[^}]*reason/);
});
