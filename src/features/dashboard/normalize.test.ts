import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDashboardPayload } from "./normalize.ts";

const range = { preset: "current_month" as const, startDate: "2026-07-01", endDate: "2026-07-31", label: "July 1–31, 2026" };

test("HR dashboard normalization applies safe numeric and array defaults", () => {
  const result = normalizeDashboardPayload("hr", {
    metrics: { activeEmployees: "12", pendingLeave: null },
    attendance: { trend: [{ date: "2026-07-01", present: "7", absent: 2, exceptions: null }] },
  }, range);
  assert.equal(result.kind, "hr");
  assert.equal(result.metrics.activeEmployees, 12);
  assert.equal(result.metrics.pendingLeave, 0);
  assert.deepEqual(result.attendance.trend[0], { date: "2026-07-01", present: 7, absent: 2, exceptions: 0 });
  assert.deepEqual(result.recentHires, []);
});

test("manager and employee payloads never inherit organization fields", () => {
  const manager = normalizeDashboardPayload("manager", { directReportCount: "3", metrics: { documentIssues: "2" }, recentHires: [{ id: "forbidden" }] }, range);
  assert.equal(manager.kind, "manager");
  assert.equal(manager.directReportCount, 3);
  assert.equal("recentHires" in manager, false);

  const employee = normalizeDashboardPayload("employee", { metrics: { unreadNotifications: "4" }, workforceStatus: [{ label: "forbidden", value: 1 }] }, range);
  assert.equal(employee.kind, "employee");
  assert.equal(employee.metrics.unreadNotifications, 4);
  assert.equal("workforceStatus" in employee, false);
});
