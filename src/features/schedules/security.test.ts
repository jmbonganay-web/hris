import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sidebar = await readFile(
  new URL("../../components/sidebar.tsx", import.meta.url),
  "utf8",
);
const managementPage = await readFile(
  new URL("../../app/(dashboard)/settings/work-schedules/page.tsx", import.meta.url),
  "utf8",
);
const selfPage = await readFile(
  new URL("../../app/(dashboard)/my-schedule/page.tsx", import.meta.url),
  "utf8",
);
const migration = await readFile(
  new URL("../../../supabase/migrations/202607140004_work_schedules.sql", import.meta.url),
  "utf8",
);

test("navigation exposes My Schedule and HR work schedule management", () => {
  assert.match(sidebar, /\/my-schedule/);
  assert.match(sidebar, /\/settings\/work-schedules/);
});

test("management and self-service routes authorize before queries", () => {
  assert.ok(managementPage.indexOf("requireScheduleAdmin") < managementPage.indexOf("getScheduleTemplates"));
  assert.ok(selfPage.indexOf("requireOwnScheduleEmployee") < selfPage.indexOf("getResolvedEmployeeSchedule"));
});

test("employees have no base schedule table policy and no permanent delete workflow", () => {
  assert.doesNotMatch(migration, /Employees view (own|referenced) schedule/i);
  assert.match(migration, /create or replace function public\.get_my_schedule/i);
  assert.doesNotMatch(migration, /for delete to authenticated/i);
  assert.doesNotMatch(migration, /for insert to authenticated/i);
  assert.doesNotMatch(migration, /for update to authenticated/i);
});

test("audit calls exclude schedule descriptions and private reasons", () => {
  assert.doesNotMatch(
    migration,
    /write_employee_audit\([^;]+(description|change_reason|assignment_reason)/i,
  );
});

test("schedule reasons are never printed or stored in browser persistence", async () => {
  const actions = await readFile(
    new URL("../../app/(dashboard)/settings/work-schedules/actions.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    actions,
    /console\.(log|error)\([^)]*(reason|description)[\s\S]*?\)/i,
  );
  assert.doesNotMatch(actions, /localStorage|sessionStorage/);
});

test("schedule versions expose no update or delete application action", async () => {
  const actions = await readFile(
    new URL("../../app/(dashboard)/settings/work-schedules/actions.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(actions, /updateScheduleVersion|deleteScheduleVersion/);
});

test("employee schedule projection excludes private and creator metadata", () => {
  const start = migration.indexOf("create or replace function public.get_my_schedule");
  const end = migration.indexOf("revoke all on function public.get_my_schedule", start);
  const selfServiceFunction = migration.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(
    selfServiceFunction,
    /'change_reason'|'created_by'|'created_at'|'assignment_reason'/i,
  );
});
