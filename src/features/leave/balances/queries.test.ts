import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./queries.ts", import.meta.url), "utf8");

test("balance queries use safe RPC projections", () => {
  assert.match(source, /import "server-only"/);
  assert.match(source, /get_my_leave_balances/);
  assert.match(source, /get_admin_leave_balances/);
  assert.doesNotMatch(source, /from\("leave_balance_ledger"\)/);
});

test("year-opening preview remains separate from generation", () => {
  assert.match(source, /previewLeaveYearOpening/);
  assert.match(source, /preview_leave_year_opening/);
  assert.doesNotMatch(source, /generate_leave_year_opening/);
});
