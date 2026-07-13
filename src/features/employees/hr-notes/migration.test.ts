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

test("migration creates encrypted HR notes and immutable employee activity", () => {
  assert.match(sql, /create table if not exists public\.employee_hr_notes/i);
  assert.match(sql, /content_ciphertext text not null/i);
  assert.match(sql, /create table if not exists public\.employee_audit_logs/i);
  assert.match(sql, /alter table public\.employee_hr_notes enable row level security/i);
  assert.match(sql, /alter table public\.employee_audit_logs enable row level security/i);
});

test("HR note categories and ownership policies are constrained", () => {
  for (const category of [
    "general",
    "performance",
    "disciplinary",
    "medical",
    "payroll",
  ]) {
    assert.match(sql, new RegExp(`'${category}'`, "i"));
  }

  assert.match(sql, /created_by = auth\.uid\(\)/i);
  assert.match(sql, /public\.is_super_admin\(\)/i);
  assert.match(sql, /No DELETE policy is created for employee_hr_notes/i);
});

test("audit rows are append-only and employee users receive no policy", () => {
  assert.match(
    sql,
    /create policy "HR can view employee audit logs"[\s\S]+using \(public\.is_hr_admin\(\)\)/i,
  );
  assert.match(sql, /No INSERT, UPDATE, or DELETE policy is created for employee_audit_logs/i);
  assert.doesNotMatch(sql, /employee_audit_logs[\s\S]{0,220}current_employee_id\(\)/i);
});

test("sensitive reveal logging is atomic", () => {
  assert.match(sql, /create or replace function public\.log_sensitive_data_reveal/i);
  assert.match(sql, /insert into public\.sensitive_data_access_logs/i);
  assert.match(sql, /perform public\.write_employee_audit/i);
  assert.match(sql, /sensitive_field\.revealed/i);
});

test("trigger functions use fixed search paths and are not publicly executable", () => {
  assert.match(sql, /set search_path = pg_catalog, public/i);
  assert.match(sql, /revoke all on function public\./i);
});
