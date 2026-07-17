import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./queries.ts", import.meta.url), "utf8");

test("payroll query module is server-only and uses protected RPCs", () => {
  assert.match(source, /import ["']server-only["']/);
  for (const rpc of "list_payroll_schedules|get_payroll_schedule_detail|preview_payroll_schedule_periods".split("|")) assert.match(source, new RegExp(`rpc\\(["']${rpc}["']`));
  assert.doesNotMatch(source, /service_role|SUPABASE_SERVICE_ROLE_KEY/i);
});
