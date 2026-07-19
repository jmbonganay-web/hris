import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");
const [workspace, detail, exceptions, sidebar, payrollPage] = await Promise.all([
  read("../../../components/payroll/payroll-calculation-workspace.tsx"),
  read("../../../components/payroll/payroll-employee-calculation-detail.tsx"),
  read("../../../components/payroll/payroll-exception-queue.tsx"),
  read("../../../components/sidebar.tsx"),
  read("../../../app/(dashboard)/payroll/page.tsx"),
]);

test("payroll workspace exposes controlled premium calculation and revised totals", () => {
  for (const text of [
    "Calculate premiums",
    "Premium earnings",
    "Night differential",
    "Gross pay (revised)",
    "Premium status",
    "Review exceptions",
  ]) assert.match(workspace, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(workspace, /calculatePayrollPremiumsAction/);
  assert.match(workspace, /premiumCalculatedAt/);
  assert.match(workspace, /missingPremiumEntryCount/);
  assert.match(workspace, /Recalculate affected entries/);
  assert.match(workspace, /name="employeeIds"/);
});

test("employee calculation detail exposes immutable premium sources and history", () => {
  for (const text of [
    "Premium summary",
    "Day-type resolution",
    "Premium calculation history",
    "Raw minutes",
    "Rounded minutes",
    "Base hourly rate",
    "Rule version",
  ]) assert.match(detail, new RegExp(text));
  assert.match(detail, /premiumLines/);
  assert.match(detail, /dayTypeResolutions/);
  assert.match(detail, /premiumEvents/);
});

test("exception queue links premium and holiday configuration without manual amount overrides", () => {
  assert.match(exceptions, /Premium rule/);
  assert.match(exceptions, /Holiday configuration/);
  assert.match(exceptions, /Night window/);
  assert.match(exceptions, /Premium input changed/);
  assert.doesNotMatch(exceptions, /manual premium|premium amount input/i);
});

test("HR navigation exposes premium settings and Super Admin approval route", () => {
  assert.match(sidebar, /\["\/payroll\/settings\/premium-rules", "Premium Rules"/);
  assert.match(sidebar, /\["\/payroll\/settings\/attendance-deduction-rules", "Attendance Deductions"/);
  assert.match(sidebar, /\["\/payroll\/approvals\/premium-rules", "Premium Approvals"/);
  assert.match(payrollPage, /href="\/payroll\/settings\/premium-rules"/);
  assert.match(payrollPage, /href="\/payroll\/approvals\/premium-rules"/);
});
