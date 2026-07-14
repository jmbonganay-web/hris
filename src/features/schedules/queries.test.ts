import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./queries.ts", import.meta.url), "utf8");
const auth = await readFile(new URL("./auth.ts", import.meta.url), "utf8");

test("schedule queries are server-only", () => {
  assert.match(source, /import "server-only"/);
});

test("schedule administration reuses HR authorization", () => {
  assert.match(auth, /requireOrganizationAdmin/);
  assert.match(auth, /requireAttendanceEmployee/);
});

test("template queries use explicit version and profile relationships", () => {
  assert.match(source, /creator:profiles!work_schedule_versions_created_by_fkey/);
  assert.match(source, /template:work_schedule_templates!employee_schedule_assignments_schedule_template_id_fkey/);
});

test("active schedule options exclude archived templates", () => {
  assert.match(source, /\.eq\("is_archived", false\)/);
});

test("assignment previews include current and future non-superseded rows", () => {
  assert.match(source, /getAssignmentPreview/);
  assert.match(source, /getBulkAssignmentPreview/);
  assert.match(source, /\.eq\("is_superseded", false\)/);
});

const tabs = await readFile(
  new URL("../../components/employees/profile/profile-tabs.tsx", import.meta.url),
  "utf8",
);

test("employee profiles expose an HR-only schedule route tab", () => {
  assert.match(tabs, /id: "schedule"/);
  assert.match(tabs, /\/employees\/\$\{employeeId\}\/schedule/);
});

test("self-service resolution uses a protected safe-projection RPC", () => {
  assert.match(source, /getResolvedEmployeeSchedule/);
  assert.match(source, /rpc\("get_my_schedule"/);
  assert.doesNotMatch(source, /getResolvedEmployeeSchedule[\s\S]+assignment_reason/);
  assert.doesNotMatch(source, /getResolvedEmployeeSchedule[\s\S]+change_reason/);
});
