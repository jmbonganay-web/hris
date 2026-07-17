import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL("../../../supabase/migrations/202607180002_payroll_foundation.sql", import.meta.url),
  "utf8",
);

test("approved compensation and schedule assignments cannot overlap", () => {
  const exclusions = sql.match(/exclude using gist[\s\S]*?where \(status = 'approved'\)/gi) ?? [];
  assert.equal(exclusions.length, 2);
  for (const exclusion of exclusions) {
    assert.match(exclusion, /employee_id with =/i);
    assert.match(exclusion, /daterange\(effective_from,\s*coalesce\(effective_to \+ 1/i);
  }
});

test("approved payroll requests and audit events are immutable", () => {
  assert.match(sql, /guard_payroll_request_mutation/i);
  assert.match(sql, /old\.status in \('approved','superseded'\)/i);
  assert.match(sql, /before update or delete on public\.payroll_period_events/i);
  assert.match(sql, /before update or delete on public\.compensation_events/i);
});

test("payroll workflows use row and advisory locks", () => {
  assert.match(sql, /pg_try_advisory_xact_lock\(hashtextextended\('payroll-period-generation',\s*0\)\)/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /PAYROLL_PERIOD_VERSION_CONFLICT/i);
  assert.match(sql, /PAYROLL_REQUEST_VERSION_CONFLICT/i);
});
