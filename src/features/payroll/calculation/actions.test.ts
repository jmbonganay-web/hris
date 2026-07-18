import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../../../app/(dashboard)/payroll/calculation/actions.ts", import.meta.url),
  "utf8",
);
const errors = await readFile(new URL("../errors.ts", import.meta.url), "utf8");

test("calculation actions are protected server actions using the expected RPCs", () => {
  assert.match(source, /^"use server";/);
  assert.match(source, /requirePayrollAdministrator/);
  assert.match(source, /requirePayrollApprover/);
  for (const rpc of [
    "create_payroll_basis_rule",
    "submit_payroll_basis_rule",
    "approve_payroll_basis_rule",
    "reject_payroll_basis_rule",
    "start_payroll_calculation_run",
    "recalculate_payroll_employee",
    "exclude_employee_from_payroll",
    "reverse_payroll_exclusion",
    "resolve_payroll_exception",
    "ignore_blocking_payroll_exception",
  ]) {
    assert.match(source, new RegExp(`rpc\\(["']${rpc}["']`));
  }
});

test("calculation actions validate inputs, use request IDs, and refresh payroll views", () => {
  assert.match(source, /validatePayrollBasisRuleInput/);
  assert.match(source, /validatePayrollCalculationRunInput/);
  assert.match(source, /validatePayrollReasonActionInput/);
  assert.match(source, /validateRecordVersion/);
  assert.match(source, /crypto\.randomUUID\(\)/);
  for (const route of [
    "/payroll/periods",
    "/payroll/settings/basis-rules",
    "/dashboard",
    "/notifications",
  ]) {
    assert.match(source, new RegExp(route.replaceAll("/", "\\/")));
  }
});

test("actions and error mapping redact payroll amounts and raw error details", () => {
  assert.doesNotMatch(source, /console\.(log|error|warn)|error\.message\s*[},]/);
  assert.doesNotMatch(source, /return\s*\{[^}]*(monthlySalary|hourlyRate|grossPay|amount)/i);
  for (const code of [
    "PAYROLL_BASIS_REQUIRED",
    "PAYROLL_CALCULATION_ALREADY_RUNNING",
    "PAYROLL_PERIOD_NOT_READY",
    "PAYROLL_REASON_REQUIRED",
  ]) {
    assert.match(errors, new RegExp(code));
  }
});


test("calculation run actions handle safe failed and exception outcomes", () => {
  assert.match(source, /const \{ data, error \} = await supabase\.rpc\("start_payroll_calculation_run"/);
  assert.match(source, /runStatus === "failed"/);
  assert.match(source, /The payroll calculation run could not be completed\./);
  assert.match(source, /runStatus === "completed_with_exceptions"/);
  assert.doesNotMatch(source, /safe_error_message|safeErrorMessage/);
});
