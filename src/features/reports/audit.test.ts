import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../../../supabase/migrations/202607150004_attendance_reports_payroll_export.sql", import.meta.url), "utf8");

test("export audit is organization-level and stores safe metadata only", () => {
  const body = sql.match(/create or replace function public\.record_attendance_report_export[\s\S]*?\$\$;/i)?.[0] ?? "";
  assert.match(body, /insert into public\.employee_audit_logs/i);
  assert.match(body, /employee_id[\s\S]+null/i);
  assert.match(body, /attendance_report\.(csv|xlsx)_exported/i);
  for (const safe of ["export_dataset", "export_format", "report_mode", "start_date", "end_date", "row_count", "timezone"]) assert.match(body, new RegExp(safe, "i"));
  for (const protectedName of ["employee_name", "clock_in", "clock_out", "revision_id", "approval_note", "rejection_reason", "file_bytes"]) assert.doesNotMatch(body, new RegExp(protectedName, "i"));
});

const source = await readFile(new URL("./audit.ts", import.meta.url), "utf8");

test("audit adapter uses only the protected RPC and safe metadata", () => {
  assert.match(source, /^import "server-only";/);
  assert.match(source, /\.rpc\("record_attendance_report_export"/);
  assert.doesNotMatch(source, /rows|fileBytes|employee_name|clock_in|clock_out|revision_id/);
});
