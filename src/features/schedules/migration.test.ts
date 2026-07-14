import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL(
    "../../../supabase/migrations/202607140004_work_schedules.sql",
    import.meta.url,
  ),
  "utf8",
);

test("migration creates the three schedule tables", () => {
  assert.match(sql, /create table if not exists public\.work_schedule_templates/i);
  assert.match(sql, /create table if not exists public\.work_schedule_versions/i);
  assert.match(sql, /create table if not exists public\.employee_schedule_assignments/i);
});

test("schedule versions are unique by template and effective date", () => {
  assert.match(sql, /unique \(schedule_template_id, effective_date\)/i);
  assert.match(sql, /prevent_work_schedule_version_mutation/i);
  assert.match(sql, /raise exception[\s\S]*?SCHEDULE_VERSION_IMMUTABLE/i);
});

test("active employee schedule assignment ranges cannot overlap", () => {
  assert.match(sql, /create extension if not exists btree_gist/i);
  assert.match(sql, /exclude using gist/i);
  assert.match(sql, /daterange\(/i);
  assert.match(sql, /where \(not is_superseded\)/i);
});

test("base schedule tables are HR-only and have no direct writes", () => {
  assert.match(sql, /HR views all schedule templates/i);
  assert.match(sql, /HR views all schedule versions/i);
  assert.match(sql, /HR views all employee schedule assignments/i);
  assert.doesNotMatch(sql, /Employees view own schedule assignments/i);
  assert.doesNotMatch(sql, /Employees view referenced schedule templates/i);
  assert.doesNotMatch(sql, /Employees view referenced schedule versions/i);
  assert.doesNotMatch(
    sql,
    /create policy[^;]+on public\.(work_schedule_templates|work_schedule_versions|employee_schedule_assignments)[^;]+for (insert|update|delete)/i,
  );
});

test("organization-level audit entries may have no employee", () => {
  assert.match(
    sql,
    /alter table public\.employee_audit_logs alter column employee_id drop not null/i,
  );
});

test("schedule descriptions and reasons never enter audit builder calls", () => {
  assert.doesNotMatch(
    sql,
    /write_employee_audit\([^;]+(description|change_reason|assignment_reason)/i,
  );
});

test("assignment RPCs lock employees, end preceding rows, and supersede future rows", () => {
  assert.match(sql, /create or replace function public\.apply_employee_schedule_assignment/i);
  assert.match(sql, /order by id[\s\S]+for update/i);
  assert.match(sql, /effective_end_date = p_effective_start_date - 1/i);
  assert.match(sql, /is_superseded = true/i);
  assert.match(sql, /superseded_by_assignment_id = v_assignment_id/i);
});

test("bulk assignment rejects duplicates and invokes one private assignment helper", () => {
  assert.match(sql, /create or replace function public\.bulk_assign_employee_schedule/i);
  assert.match(sql, /SCHEDULE_EMPLOYEE_DUPLICATE/i);
  assert.match(sql, /public\.apply_employee_schedule_assignment/i);
});

test("archived templates and inactive employees cannot be assigned", () => {
  assert.match(sql, /SCHEDULE_ARCHIVED/i);
  assert.match(sql, /SCHEDULE_EMPLOYEE_INELIGIBLE/i);
});

test("audit writer accepts organization-level events with no employee", () => {
  assert.match(
    sql,
    /create or replace function public\.write_employee_audit[\s\S]*?if p_employee_id is not null[\s\S]*?Employee not found/i,
  );
});
