import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sidebar = await readFile(new URL("../../components/sidebar.tsx", import.meta.url), "utf8");
const shell = await readFile(new URL("../../components/app-shell.tsx", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../../app/(dashboard)/dashboard/page.tsx", import.meta.url), "utf8");

test("app shell passes role-aware attendance navigation to the sidebar", () => {
  assert.match(shell, /<Sidebar role=\{user\.role\}/);
  assert.match(sidebar, /My Attendance/);
  assert.match(sidebar, /Correction Requests/);
  assert.match(sidebar, /\/admin\/attendance/);
});

test("dashboard uses production attendance queries instead of mock attendance", () => {
  assert.match(dashboard, /getCurrentRole/);
  assert.match(dashboard, /getTodayAttendanceContext/);
  assert.match(dashboard, /getAdminAttendanceSummary/);
  assert.doesNotMatch(dashboard, /import \{[^}]*attendance[^}]*\} from "@\/data\/mock"/);
});

test("HR navigation exposes personal attendance alongside admin attendance", () => {
  const adminStart = sidebar.indexOf("? [");
  const employeeStart = sidebar.indexOf(": [[", adminStart);
  const adminItems = sidebar.slice(adminStart, employeeStart);
  assert.match(adminItems, /\["\/attendance", "My Attendance"/);
  assert.match(adminItems, /\["\/admin\/attendance", "Attendance"/);
});

test("HR navigation exposes attendance policy, recalculation, and finalization", () => {
  const adminStart = sidebar.indexOf("? [");
  const employeeStart = sidebar.indexOf(": [[", adminStart);
  const adminItems = sidebar.slice(adminStart, employeeStart);
  assert.match(adminItems, /\/admin\/attendance\/recalculate/);
  assert.match(adminItems, /Recalculate Attendance/);
  assert.match(adminItems, /\/admin\/attendance\/finalization/);
  assert.match(adminItems, /Finalization Runs/);
  assert.match(adminItems, /\/settings\/attendance-policy/);
  assert.match(adminItems, /Attendance Policy/);
});
