import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./queries.ts", import.meta.url), "utf8");

test("payroll calculation queries are server-only and use protected RPCs", () => {
  assert.match(source, /import\s+["']server-only["']/);
  for (const rpc of [
    "list_payroll_basis_rules",
    "get_payroll_calculation_workspace",
    "get_payroll_employee_calculation_detail",
    "list_payroll_entry_exceptions",
  ]) {
    assert.match(source, new RegExp(`rpc\\(["']${rpc}["']`));
  }
});

test("payroll calculation queries use the authenticated server client only", () => {
  assert.match(source, /@\/lib\/supabase\/server/);
  assert.doesNotMatch(source, /createAdminClient|service[_-]?role|SUPABASE_SERVICE_ROLE_KEY/i);
});

test("query errors are safe and do not expose raw Supabase errors", () => {
  assert.doesNotMatch(source, /throw\s+error|error\.message/);
  assert.match(source, /Unable to load payroll calculation workspace\./);
  assert.match(source, /Unable to load payroll basis rules\./);
});
