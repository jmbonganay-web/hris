import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL(
    "../../../supabase/migrations/202607140003_attendance_mvp.sql",
    import.meta.url,
  ),
  "utf8",
);

test("migration creates attendance and correction request tables", () => {
  assert.match(sql, /create table if not exists public\.attendance_records/i);
  assert.match(sql, /create table if not exists public\.attendance_correction_requests/i);
  assert.match(sql, /unique \(employee_id, attendance_date\)/i);
  assert.match(sql, /where status = 'pending'/i);
});

test("attendance constraints reject invalid timestamps and long private text", () => {
  assert.match(sql, /clock_out_at is null or clock_out_at > clock_in_at/i);
  assert.match(sql, /char_length\(clock_in_note\) <= 1000/i);
  assert.match(sql, /char_length\(clock_out_note\) <= 1000/i);
  assert.match(sql, /char_length\(last_correction_reason\) <= 1000/i);
  assert.match(sql, /char_length\(reason\) <= 1000/i);
  assert.match(sql, /char_length\(review_note\) <= 1000/i);
});

test("RLS allows own or HR reads but no direct attendance writes or deletes", () => {
  assert.match(sql, /alter table public\.attendance_records enable row level security/i);
  assert.match(sql, /alter table public\.attendance_correction_requests enable row level security/i);
  assert.match(sql, /employee\.profile_id = auth\.uid\(\)/i);
  assert.match(sql, /public\.is_hr_admin\(\)/i);
  assert.doesNotMatch(
    sql,
    /create policy[^;]+on public\.attendance_records[^;]+for delete/i,
  );
  assert.doesNotMatch(
    sql,
    /create policy[^;]+on public\.attendance_records[^;]+for update/i,
  );
  assert.doesNotMatch(
    sql,
    /create policy[^;]+on public\.attendance_correction_requests[^;]+for delete/i,
  );
});

test("company date is fixed to Asia Manila", () => {
  assert.match(sql, /create or replace function public\.company_attendance_date/i);
  assert.match(sql, /at time zone 'Asia\/Manila'/i);
});

test("privileged functions use a fixed search path and restricted grants", () => {
  assert.match(sql, /set search_path = pg_catalog, public/i);
  assert.match(sql, /revoke all on function public\./i);
  assert.match(sql, /from public, anon/i);
});

test("attendance audit builders never include private text fields", () => {
  const auditCalls = sql.match(/perform public\.write_employee_audit\([\s\S]*?\n\s*\);/gi) ?? [];
  assert.ok(auditCalls.length > 0);
  for (const call of auditCalls) {
    assert.doesNotMatch(
      call,
      /(clock_in_note|clock_out_note|last_correction_reason|reason|employee_note|review_note)/i,
    );
  }
});

test("employee clock RPCs use PostgreSQL time and lock employee state", () => {
  assert.match(sql, /create or replace function public\.clock_in_attendance/i);
  assert.match(sql, /create or replace function public\.clock_out_attendance/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /clock_in_at[\s\S]+now\(\)/i);
  assert.match(sql, /clock_out_at[\s\S]+now\(\)/i);
  assert.match(sql, /attendance\.clocked_in/i);
  assert.match(sql, /attendance\.clocked_out/i);
});

test("clock-in blocks older open records and duplicate company dates", () => {
  assert.match(sql, /attendance_date < v_company_date[\s\S]+clock_out_at is null/i);
  assert.match(sql, /attendance_records_employee_date_unique/i);
});

test("clock RPC audit payloads exclude employee notes", () => {
  const auditCalls = sql.match(/perform public\.write_employee_audit\([\s\S]*?\);/gi) ?? [];
  const clockAuditCalls = auditCalls.filter((call) => /attendance\.clocked_(in|out)/i.test(call));
  assert.equal(clockAuditCalls.length, 2);
  assert.doesNotMatch(
    clockAuditCalls.join("\n"),
    /(clock_in_note|clock_out_note|last_correction_reason|reason|employee_note|review_note)/i,
  );
});

test("correction RPCs enforce the 30-day window, ownership, and self-review rule", () => {
  assert.match(sql, /create or replace function public\.create_attendance_correction_request/i);
  assert.match(sql, /create or replace function public\.cancel_attendance_correction_request/i);
  assert.match(sql, /create or replace function public\.review_attendance_correction_request/i);
  assert.match(sql, /v_company_date - 30/i);
  assert.match(sql, /requested_by = v_actor/i);
  assert.match(sql, /v_request\.requested_by = v_actor/i);
});

test("approval rejects correction requests whose official record state changed", () => {
  const start = sql.indexOf("create or replace function public.review_attendance_correction_request");
  const end = sql.indexOf("revoke all on function public.review_attendance_correction_request", start);
  const reviewFunction = sql.slice(start, end);

  assert.match(
    reviewFunction,
    /v_record\.updated_at > v_request\.created_at[\s\S]+REQUEST_STATE_CHANGED/i,
  );
  assert.match(
    reviewFunction,
    /add_missing_clock_out[\s\S]+clock_out_at is not null[\s\S]+REQUEST_STATE_CHANGED/i,
  );
  assert.match(
    reviewFunction,
    /change_clock_out[\s\S]+clock_out_at is null[\s\S]+REQUEST_STATE_CHANGED/i,
  );
});

test("approval writes both official attendance and request audit events atomically", () => {
  assert.match(sql, /attendance\.corrected/i);
  assert.match(sql, /attendance_correction\.approved/i);
  assert.match(sql, /for update/i);
});

test("correction audit payloads exclude request reason and review text", () => {
  const auditCalls = sql.match(/perform public\.write_employee_audit\([\s\S]*?\n\s*\);/gi) ?? [];
  const correctionCalls = auditCalls.filter((call) => /attendance(_correction)?\.(requested|cancelled|approved|rejected|corrected)/i.test(call));
  assert.ok(correctionCalls.length >= 5);
  for (const call of correctionCalls) {
    assert.doesNotMatch(call, /(last_correction_reason|\breason\b|employee_note|review_note)/i);
  }
});

test("HR create and correct RPCs require HR role and private reasons", () => {
  assert.match(sql, /create or replace function public\.hr_create_attendance/i);
  assert.match(sql, /create or replace function public\.hr_correct_attendance/i);
  assert.match(sql, /not public\.is_hr_admin\(\)/i);
  assert.match(sql, /normalize_attendance_private_text\(p_reason, true\)/i);
});

test("HR timestamp validation uses Asia Manila and rejects overnight values", () => {
  assert.match(sql, /p_clock_in_local at time zone 'Asia\/Manila'/i);
  assert.match(sql, /company_attendance_date\(v_clock_in\) <> p_attendance_date/i);
  assert.match(sql, /company_attendance_date\(v_clock_out\) <> p_attendance_date/i);
});
