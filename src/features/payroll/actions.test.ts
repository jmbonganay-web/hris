import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = [
  "../../app/(dashboard)/payroll/actions.ts",
  "../../app/(dashboard)/payroll/schedules/actions.ts",
  "../../app/(dashboard)/payroll/periods/actions.ts",
  "../../app/(dashboard)/employees/[id]/compensation/actions.ts",
  "../../app/(dashboard)/payroll/approvals/actions.ts",
];
const sources = await Promise.all(paths.map((path) => readFile(new URL(path, import.meta.url), "utf8")));
const all = sources.join("\n");

test("payroll actions are server-only and use protected RPCs", () => {
  for (const source of sources) assert.match(source, /^"use server";/);
  for (const rpc of [
    "create_payroll_schedule", "update_payroll_schedule", "set_payroll_schedule_active",
    "transition_payroll_period", "reopen_payroll_period", "ensure_payroll_period_horizon",
    "create_compensation_draft", "update_compensation_draft", "submit_compensation_record",
    "create_schedule_assignment_draft", "update_schedule_assignment_draft", "submit_schedule_assignment",
    "approve_compensation_record", "reject_compensation_record", "approve_schedule_assignment", "reject_schedule_assignment",
  ]) assert.match(all, new RegExp(rpc));
});

test("payroll actions validate, use request IDs, and refresh protected views", () => {
  assert.match(all, /validatePayrollScheduleInput/);
  assert.match(all, /validateCompensationInput/);
  assert.match(all, /requirePayrollApprover/);
  assert.match(all, /crypto\.randomUUID\(\)/);
  for (const route of ["/payroll", "/payroll/approvals", "/payroll/periods", "/dashboard", "/notifications"]) {
    assert.match(all, new RegExp(route.replaceAll("/", "\\/")));
  }
  assert.doesNotMatch(all, /console\.(log|error|warn)/);
  assert.doesNotMatch(all, /return\s*\{[^}]*monthlySalary|return\s*\{[^}]*hourlyRate/i);
});
