import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const action = await readFile(
  new URL("../../../app/(dashboard)/settings/attendance-policy/actions.ts", import.meta.url),
  "utf8",
);
const listPage = await readFile(
  new URL("../../../app/(dashboard)/settings/attendance-policy/page.tsx", import.meta.url),
  "utf8",
);
const newPage = await readFile(
  new URL("../../../app/(dashboard)/settings/attendance-policy/new/page.tsx", import.meta.url),
  "utf8",
);
const form = await readFile(
  new URL("../../../components/attendance/attendance-policy-form.tsx", import.meta.url),
  "utf8",
);

test("policy actions and pages authorize HR before data access", () => {
  assert.match(action, /requireAttendanceAdmin/);
  assert.match(listPage, /await requireAttendanceAdmin\(\)/);
  assert.match(newPage, /await requireAttendanceAdmin\(\)/);
});

test("policy action invokes protected RPC and never returns the private reason", () => {
  assert.match(action, /\.rpc\("create_attendance_policy_version"/);
  assert.doesNotMatch(action, /values:[^}]*changeReason/);
  assert.doesNotMatch(action, /console\.(log|error)\([^)]*reason/);
});

test("policy UI explains backdating, enforces max grace, and exposes no edit or delete", () => {
  assert.match(form, /will not automatically change existing finalized attendance/i);
  assert.match(form, /max=\{120\}/);
  assert.doesNotMatch(listPage, />Edit</);
  assert.doesNotMatch(listPage, />Delete</);
});
