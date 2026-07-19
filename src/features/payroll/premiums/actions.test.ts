import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../../../app/(dashboard)/payroll/premiums/actions.ts", import.meta.url),
  "utf8",
);

test("premium actions cover draft, approval, rejection, and calculation workflows", () => {
  for (const name of [
    "createPremiumRuleSetAction",
    "updatePremiumRuleSetDraftAction",
    "clonePremiumRulePresetAction",
    "clonePremiumRuleVersionAction",
    "submitPremiumRuleSetAction",
    "approvePremiumRuleSetAction",
    "rejectPremiumRuleSetAction",
    "createAttendanceDeductionRuleAction",
    "updateAttendanceDeductionRuleDraftAction",
    "cloneAttendanceDeductionRuleAction",
    "submitAttendanceDeductionRuleAction",
    "approveAttendanceDeductionRuleAction",
    "rejectAttendanceDeductionRuleAction",
    "calculatePayrollPremiumsAction",
  ]) assert.match(source, new RegExp(`(?:function|const) ${name}`));
});

test("approval and rejection actions require payroll approver access", () => {
  assert.match(source, /requirePayrollApprover/);
  assert.match(source, /approver \? await requirePayrollApprover\(\)/);
  const rejectBody = source.match(/async function rejectAction[\s\S]*?\n}/)?.[0] ?? "";
  assert.match(rejectBody, /requirePayrollApprover\(\)/);
});

test("write actions validate inputs, map safe errors, and use unique request IDs", () => {
  assert.match(source, /validatePremiumRuleSetInput/);
  assert.match(source, /validatePremiumPresetCloneInput/);
  assert.match(source, /validateAttendanceDeductionRuleInput/);
  assert.match(source, /validatePremiumCalculationInput/);
  assert.match(source, /mapPayrollError\(error\.message\)/);
  assert.match(source, /crypto\.randomUUID\(\)/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|createAdminClient/i);
});

test("premium calculation submits identifiers rather than payroll values", () => {
  const body = source.match(
    /export async function calculatePayrollPremiumsAction[\s\S]*?\n}/,
  )?.[0] ?? "";
  assert.match(body, /p_payroll_period_id/);
  assert.match(body, /p_employee_ids/);
  assert.match(body, /p_idempotency_key/);
  assert.doesNotMatch(body, /salary|hourlyRate|premiumAmount|grossPay/);
});

test("affected-entry recalculation refreshes base payroll before premiums", () => {
  const body = source.match(
    /export async function calculatePayrollPremiumsAction[\s\S]*?\n}/,
  )?.[0] ?? "";
  assert.match(body, /mode === "recalculate"/);
  const baseAt = body.indexOf('rpc("recalculate_payroll_employee"');
  const premiumAt = body.lastIndexOf('rpc("calculate_payroll_premiums"');
  assert.ok(baseAt >= 0);
  assert.ok(premiumAt > baseAt);
});


test("every exported server action is declared as an async function", () => {
  for (const name of [
    "submitPremiumRuleSetAction",
    "approvePremiumRuleSetAction",
    "submitAttendanceDeductionRuleAction",
    "approveAttendanceDeductionRuleAction",
    "rejectPremiumRuleSetAction",
    "rejectAttendanceDeductionRuleAction",
  ]) {
    assert.match(source, new RegExp(`export async function ${name}\\s*\\(`));
  }
  assert.doesNotMatch(source, /export const \w+Action\s*=/);
});
