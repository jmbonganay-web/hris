import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../../../../supabase/migrations/202607190003_payroll_premium_rules.sql", import.meta.url),
  "utf8",
);
const calculationActions = await readFile(
  new URL("../../../app/(dashboard)/payroll/calculation/actions.ts", import.meta.url),
  "utf8",
);

test("period premium calculation never clones stale base entries", () => {
  const body = migration.match(
    /create or replace function public\.calculate_payroll_premiums[\s\S]*?\n\$\$;/i,
  )?.[0] ?? "";

  assert.match(body, /and not entry\.is_stale/i);
  assert.doesNotMatch(body, /entry\.status in \('calculated','recalculated','stale'\)/i);
});

test("employee recalculation refreshes base payroll before premiums", () => {
  const body = calculationActions.match(
    /export async function recalculatePayrollEmployeeAction[\s\S]*?\n}/,
  )?.[0] ?? "";

  const baseCall = body.indexOf('rpc("recalculate_payroll_employee"');
  const premiumCall = body.indexOf('rpc("calculate_payroll_premiums"');
  assert.ok(baseCall >= 0, "expected the base payroll recalculation RPC");
  assert.ok(premiumCall > baseCall, "expected premium calculation after base recalculation");
  assert.match(body, /p_mode:\s*"selected"/);
  assert.match(body, /p_employee_ids:\s*\[employeeId\]/);
});

test("premium recalculation copies only base source snapshots", () => {
  const body = migration.match(
    /create or replace function public\.clone_payroll_entry_for_premiums[\s\S]*?\n\$\$;/i,
  )?.[0] ?? "";
  assert.match(
    body,
    /source_type not in \('premium_rule','attendance_deduction_rule','day_type_resolution'\)/i,
  );
});

test("superseded rule versions remain resolvable for their historical effective dates", () => {
  const premiumResolver = migration.match(
    /create or replace function public\.resolve_employee_premium_rule[\s\S]*?\n\$\$;/i,
  )?.[0] ?? "";
  const attendanceResolver = migration.match(
    /create or replace function public\.resolve_attendance_deduction_rule[\s\S]*?\n\$\$;/i,
  )?.[0] ?? "";
  const calculator = migration.match(
    /create or replace function public\.calculate_payroll_premiums[\s\S]*?\n\$\$;/i,
  )?.[0] ?? "";
  assert.match(premiumResolver, /status in \('approved','superseded'\)/i);
  assert.match(attendanceResolver, /status in \('approved','superseded'\)/i);
  assert.match(premiumResolver, /case when rule\.status='approved' then 0 else 1 end/i);
  assert.match(attendanceResolver, /case when rule\.status='approved' then 0 else 1 end/i);
  assert.match(calculator, /status in \('approved','superseded'\)/i);
});

test("approving a later replacement closes the superseded rule range", () => {
  const premiumApproval = migration.match(
    /create or replace function public\.approve_premium_rule_set[\s\S]*?\n\$\$;/i,
  )?.[0] ?? "";
  const attendanceApproval = migration.match(
    /create or replace function public\.approve_attendance_deduction_rule[\s\S]*?\n\$\$;/i,
  )?.[0] ?? "";
  const immutableGuard = migration.match(
    /create or replace function public\.reject_approved_premium_rule_mutation[\s\S]*?\n\$\$;/i,
  )?.[0] ?? "";
  assert.match(premiumApproval, /effective_to\s*=\s*case/i);
  assert.match(premiumApproval, /v_rule\.effective_from\s*-\s*1/i);
  assert.match(attendanceApproval, /effective_to\s*=\s*case/i);
  assert.match(attendanceApproval, /v_rule\.effective_from\s*-\s*1/i);
  assert.match(immutableGuard, /effective_to/i);
  assert.match(immutableGuard, /new\.effective_to\s*<=\s*old\.effective_to/i);
});
