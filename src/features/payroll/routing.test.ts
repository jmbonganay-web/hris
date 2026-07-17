import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

const routes = {
  overview: await source("../../app/(dashboard)/payroll/page.tsx"),
  schedules: await source("../../app/(dashboard)/payroll/schedules/page.tsx"),
  scheduleNew: await source("../../app/(dashboard)/payroll/schedules/new/page.tsx"),
  scheduleDetail: await source("../../app/(dashboard)/payroll/schedules/[scheduleId]/page.tsx"),
  periods: await source("../../app/(dashboard)/payroll/periods/page.tsx"),
  periodDetail: await source("../../app/(dashboard)/payroll/periods/[periodId]/page.tsx"),
  approvals: await source("../../app/(dashboard)/payroll/approvals/page.tsx"),
  employeeCompensation: await source("../../app/(dashboard)/employees/[id]/compensation/page.tsx"),
  employeeCompensationNew: await source("../../app/(dashboard)/employees/[id]/compensation/new/page.tsx"),
  employeeCompensationEdit: await source("../../app/(dashboard)/employees/[id]/compensation/[recordId]/page.tsx"),
  ownCompensation: await source("../../app/(dashboard)/me/compensation/page.tsx"),
};

function assertGuardBeforeQuery(text: string, guard: string, query: string) {
  const guardIndex = text.indexOf(guard);
  const queryIndex = text.indexOf(query, text.indexOf("export default"));
  assert.ok(guardIndex >= 0, `missing ${guard}`);
  assert.ok(queryIndex >= 0, `missing ${query}`);
  assert.ok(guardIndex < queryIndex, `${guard} must run before ${query}`);
}

test("payroll routes authorize before protected queries", () => {
  assertGuardBeforeQuery(routes.overview, "requirePayrollViewer()", "getPayrollOverview()");
  for (const text of [routes.schedules, routes.scheduleNew, routes.scheduleDetail, routes.periods, routes.periodDetail]) {
    assert.match(text, /requirePayrollAdministrator\(\)/);
  }
  assertGuardBeforeQuery(routes.approvals, "requirePayrollApprover()", "listPayrollApprovals()");
  for (const text of [routes.employeeCompensation, routes.employeeCompensationNew, routes.employeeCompensationEdit]) {
    assertGuardBeforeQuery(text, "requireEmployeeProfileManager(id)", "getEmployeeCompensationAdmin(id)");
  }
  assertGuardBeforeQuery(routes.ownCompensation, "requirePayrollViewer()", "getOwnCompensation()");
});

test("self-service route uses only the own-compensation projection", () => {
  assert.match(routes.ownCompensation, /getOwnCompensation/);
  assert.doesNotMatch(routes.ownCompensation, /getEmployeeCompensationAdmin|listPayrollApprovals|compensationHistory|auditEvents/);
  assert.match(routes.ownCompensation, /currently effective approved compensation/i);
});

test("payroll routes do not add manager direct-report compensation access", () => {
  const all = Object.values(routes).join("\n");
  assert.doesNotMatch(all, /direct[- ]report|manager compensation/i);
});
