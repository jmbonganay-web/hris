import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  canApprovePayroll,
  canManagePayroll,
  canViewPayrollAdministration,
} from "./auth.ts";

test("payroll authorization separates administrators and approvers", () => {
  assert.equal(canManagePayroll("employee"), false);
  assert.equal(canManagePayroll("hr_admin"), true);
  assert.equal(canViewPayrollAdministration("super_admin"), true);
  assert.equal(canApprovePayroll("hr_admin"), false);
  assert.equal(canApprovePayroll("super_admin"), true);
});

test("payroll viewer guard exists for role-specific overview routes", async () => {
  const source = await readFile(new URL("./auth.ts", import.meta.url), "utf8");
  assert.match(source, /export async function requirePayrollViewer/);
  assert.match(source, /requireUser/);
  assert.match(source, /canAdminister/);
});
