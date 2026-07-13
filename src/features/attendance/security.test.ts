import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../../../supabase/migrations/202607140003_attendance_mvp.sql", import.meta.url),
  "utf8",
);
const actions = await readFile(
  new URL("../../app/(dashboard)/attendance/actions.ts", import.meta.url),
  "utf8",
);

test("attendance audit calls never include private text columns", () => {
  assert.doesNotMatch(
    migration,
    /write_employee_audit\([^;]+(clock_in_note|clock_out_note|last_correction_reason|reason|employee_note|review_note)/i,
  );
});

test("attendance actions do not log private form values", () => {
  assert.doesNotMatch(actions, /console\.(log|error)\([^)]*(note|reason|review)/i);
  assert.doesNotMatch(actions, /localStorage|sessionStorage/);
});

test("no permanent delete workflow exists", () => {
  assert.doesNotMatch(actions, /\.delete\(\)/);
  assert.doesNotMatch(
    migration,
    /create policy[^;]+on public\.(attendance_records|attendance_correction_requests)[^;]+for delete/i,
  );
});

test("employee clock actions cannot accept official timestamps", () => {
  const clockSection = actions.slice(
    actions.indexOf("export async function clockIn"),
    actions.indexOf("function correctionError"),
  );
  assert.doesNotMatch(clockSection, /\bclock_(in|out)_at\b|\bclock(In|Out)Local\b/);
});
