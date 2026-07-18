import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const basisPage = await readFile(
  new URL("../../../app/(dashboard)/payroll/settings/basis-rules/page.tsx", import.meta.url),
  "utf8",
).catch(() => "");
const exceptionsPage = await readFile(
  new URL("../../../app/(dashboard)/payroll/periods/[periodId]/exceptions/page.tsx", import.meta.url),
  "utf8",
).catch(() => "");
const basis = await readFile(
  new URL("../../../components/payroll/payroll-basis-rule-list.tsx", import.meta.url),
  "utf8",
).catch(() => "");
const exceptions = await readFile(
  new URL("../../../components/payroll/payroll-exception-queue.tsx", import.meta.url),
  "utf8",
).catch(() => "");

test("basis and exception routes require payroll administration", () => {
  for (const source of [basisPage, exceptionsPage]) assert.match(source, /requirePayrollAdministrator/);
  assert.match(basisPage, /listPayrollBasisRules/);
  assert.match(exceptionsPage, /listPayrollEntryExceptions/);
});

test("basis settings provide inactive presets and controlled approval actions", () => {
  for (const divisor of ["261", "310", "313", "365"]) assert.match(basis, new RegExp(divisor));
  assert.match(basis, /createPayrollBasisRuleAction/);
  assert.match(basis, /submitPayrollBasisRuleAction/);
  assert.match(basis, /approvePayrollBasisRuleAction/);
  assert.match(basis, /rejectPayrollBasisRuleAction/);
  assert.match(basis, /canApprove/);
  assert.match(basis, /Change reason/);
});

test("exception queue requires reasons and gates blocker overrides", () => {
  assert.match(exceptions, /resolvePayrollExceptionAction/);
  assert.match(exceptions, /ignoreBlockingPayrollExceptionAction/);
  assert.match(exceptions, /canApprove/);
  assert.match(exceptions, /required/);
  assert.match(exceptions, /Blocking/);
});

test("settings and exceptions do not render payroll amounts", () => {
  assert.doesNotMatch(basis + exceptions, /monthlySalary|hourlyRate|grossPay|formatPayrollMoney/);
});
