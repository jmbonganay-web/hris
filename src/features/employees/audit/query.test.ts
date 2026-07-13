import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL(
    "../../../../supabase/migrations/202607140002_hr_notes_audit_history.sql",
    import.meta.url,
  ),
  "utf8",
);

const querySource = await readFile(
  new URL("./query.ts", import.meta.url),
  "utf8",
);

test("all approved row-based tables have audit triggers", () => {
  for (const table of [
    "employees",
    "employee_personal_details",
    "employee_emergency_contacts",
    "employee_sensitive_details",
    "employee_hr_notes",
  ]) {
    assert.match(sql, new RegExp(`create trigger[^;]+on public\\.${table}`, "i"));
  }
});

test("sensitive audit payloads use safe business field names only", () => {
  for (const safeName of [
    "sss_number",
    "philhealth_number",
    "pagibig_number",
    "tin",
    "account_name",
    "account_number",
  ]) {
    assert.match(sql, new RegExp(`'${safeName}'`, "i"));
  }

  assert.doesNotMatch(sql, /jsonb_build_object\([^)]*sss_ciphertext/i);
  assert.doesNotMatch(sql, /jsonb_build_object\([^)]*account_number_ciphertext/i);
});

test("HR note audit never copies note ciphertext", () => {
  const start = sql.indexOf(
    "create or replace function public.audit_employee_hr_note_change()",
  );
  const end = sql.indexOf(
    "revoke all on function public.audit_employee_hr_note_change()",
  );
  const block = sql.slice(start, end);
  const writerCall = block.slice(block.indexOf("perform public.write_employee_audit"));

  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(writerCall, /content_ciphertext/i);
});

test("approved employment fields are whitelisted", () => {
  for (const field of [
    "department_id",
    "job_title_id",
    "manager_id",
    "employment_type",
    "employment_status",
    "hire_date",
    "probation_end_date",
    "regularization_date",
    "work_location",
    "work_schedule",
  ]) {
    assert.match(sql, new RegExp(`'${field}'`, "i"));
  }
});

test("activity query uses stable newest-first pagination", () => {
  assert.match(querySource, /const pageSize = 20/);
  assert.match(querySource, /\.order\("created_at", \{ ascending: false \}\)/);
  assert.match(querySource, /\.order\("id", \{ ascending: false \}\)/);
  assert.match(querySource, /\.range\(from, to\)/);
});

test("activity query uses explicit actor profile relationship", () => {
  assert.match(
    querySource,
    /actor:profiles!employee_audit_logs_actor_profile_id_fkey/,
  );
});
