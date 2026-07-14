import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const actionSource = await readFile(
  new URL(
    "../../app/(dashboard)/settings/work-schedules/actions.ts",
    import.meta.url,
  ),
  "utf8",
);
const migration = await readFile(
  new URL(
    "../../../supabase/migrations/202607140004_work_schedules.sql",
    import.meta.url,
  ),
  "utf8",
);

test("template actions invoke protected RPCs", () => {
  for (const rpc of [
    "create_work_schedule_template",
    "update_work_schedule_template",
    "create_work_schedule_version",
    "set_work_schedule_template_archived",
  ]) {
    assert.match(actionSource, new RegExp(`rpc\\(\\"${rpc}\\"`));
  }
});

test("template mutation RPCs require HR and fixed search paths", () => {
  assert.match(migration, /create or replace function public\.create_work_schedule_template/i);
  assert.match(migration, /create or replace function public\.update_work_schedule_template/i);
  assert.match(migration, /create or replace function public\.create_work_schedule_version/i);
  assert.match(migration, /create or replace function public\.set_work_schedule_template_archived/i);
  assert.match(migration, /set search_path = pg_catalog, public/i);
  assert.match(migration, /not public\.is_hr_admin\(\)/i);
});

test("private descriptions and reasons are not returned in retry state or logs", () => {
  assert.doesNotMatch(actionSource, /values\s*:\s*\{[^}]*\b(description|change_reason)\b/i);
  assert.doesNotMatch(actionSource, /console\.(log|error)\([^)]*(description|changeReason)[\s\S]*?\)/);
});

test("individual and bulk assignment actions invoke one protected RPC", () => {
  assert.match(actionSource, /rpc\("assign_employee_schedule"/);
  assert.match(actionSource, /rpc\("bulk_assign_employee_schedule"/);
});

test("assignment retry state never contains the private assignment reason", () => {
  assert.doesNotMatch(actionSource, /values\s*:\s*\{[^}]*\bassignment_reason\b/i);
});
