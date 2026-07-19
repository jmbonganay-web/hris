import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");
const [listPage, newPage, detailPage, attendancePage, approvalPage, form, detail, attendance, approvals] = await Promise.all([
  read("../../../app/(dashboard)/payroll/settings/premium-rules/page.tsx"),
  read("../../../app/(dashboard)/payroll/settings/premium-rules/new/page.tsx"),
  read("../../../app/(dashboard)/payroll/settings/premium-rules/[ruleSetId]/page.tsx"),
  read("../../../app/(dashboard)/payroll/settings/attendance-deduction-rules/page.tsx"),
  read("../../../app/(dashboard)/payroll/approvals/premium-rules/page.tsx"),
  read("../../../components/payroll/premium-rule-form.tsx"),
  read("../../../components/payroll/premium-rule-detail.tsx"),
  read("../../../components/payroll/attendance-deduction-rule-list.tsx"),
  read("../../../components/payroll/premium-rule-approval-list.tsx"),
]);

test("premium settings routes enforce HR or Super Admin access", () => {
  for (const source of [listPage, newPage, detailPage, attendancePage]) {
    assert.match(source, /requirePayrollAdministrator/);
  }
  assert.match(approvalPage, /requirePayrollApprover/);
});

test("premium rule editor exposes all governed policy fields", () => {
  for (const text of [
    "Issuing agency",
    "Source reference",
    "Publication date",
    "Source URL",
    "Day-type matrix",
    "Day multiplier",
    "OT multiplier",
    "ND rate (0.10 = 10%)",
    "Overtime rounding",
    "Night rounding",
  ]) assert.match(form, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
});

test("rule detail shows immutable history and a no-write coverage preview", () => {
  assert.match(detail, /Coverage preview/);
  assert.match(detail, /no payroll values are recalculated/i);
  assert.match(detail, /Approved versions are immutable/);
  assert.match(detail, /Submit for approval/);
  assert.match(detail, /Rejection reason/);
  assert.match(detail, /Clone as new version/);
});

test("attendance policy UI states excess-only behavior and separate settings", () => {
  assert.match(attendance, /Deduct only minutes beyond the grace period/i);
  assert.match(attendance, /Raw late time: 14 minutes/);
  assert.match(attendance, /Deductible time: 4 minutes/);
  assert.match(attendance, /Late rounding/);
  assert.match(attendance, /Undertime rounding/);
});

test("approval inbox exposes decisions, legal source, and coverage review link", () => {
  assert.match(approvals, /Legal source/);
  assert.match(approvals, /Review coverage and full rule/);
  assert.match(approvals, /"Approve"/);
  assert.match(approvals, /"Reject"/);
  assert.match(approvals, /Rejection reason/);
  assert.doesNotMatch(approvals, /salary|gross pay|premium amount/i);
});
