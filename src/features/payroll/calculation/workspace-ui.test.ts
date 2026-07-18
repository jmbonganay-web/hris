import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workspacePage = await readFile(
  new URL("../../../app/(dashboard)/payroll/periods/[periodId]/workspace/page.tsx", import.meta.url),
  "utf8",
).catch(() => "");
const employeePage = await readFile(
  new URL("../../../app/(dashboard)/payroll/periods/[periodId]/employees/[employeeId]/page.tsx", import.meta.url),
  "utf8",
).catch(() => "");
const workspace = await readFile(
  new URL("../../../components/payroll/payroll-calculation-workspace.tsx", import.meta.url),
  "utf8",
).catch(() => "");
const detail = await readFile(
  new URL("../../../components/payroll/payroll-employee-calculation-detail.tsx", import.meta.url),
  "utf8",
).catch(() => "");
const periodDetail = await readFile(
  new URL("../../../components/payroll/payroll-period-detail.tsx", import.meta.url),
  "utf8",
);

test("workspace and employee routes require payroll administration and protected queries", () => {
  for (const source of [workspacePage, employeePage]) {
    assert.match(source, /requirePayrollAdministrator/);
    assert.match(source, /notFound/);
  }
  assert.match(workspacePage, /getPayrollCalculationWorkspace/);
  assert.match(employeePage, /getPayrollEmployeeCalculationDetail/);
});

test("workspace exposes run summaries, filters, readiness, and controlled actions", () => {
  for (const text of [
    "Start calculation",
    "Calculated",
    "Needs recalculation",
    "Blocking exception",
    "Gross pay",
    "Submit for review",
  ]) assert.match(workspace, new RegExp(text));
  assert.match(workspace, /startPayrollCalculationAction/);
  assert.match(workspace, /recalculatePayrollEmployeeAction/);
  assert.match(workspace, /excludeEmployeeFromPayrollAction/);
});

test("employee detail explains daily rows, snapshots, and version history", () => {
  for (const text of ["Daily breakdown", "Source snapshots", "Calculation history", "Eligible", "Overtime input"]) {
    assert.match(detail, new RegExp(text));
  }
  assert.match(detail, /formatPayrollMoney/);
  assert.match(detail, /formatPayrollMinutes/);
});

test("period detail links authorized users to the calculation workspace", () => {
  assert.match(periodDetail, /workspace/);
  assert.match(periodDetail, /Payroll workspace/);
});
