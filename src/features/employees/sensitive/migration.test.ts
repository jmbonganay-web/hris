import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL(
    "../../../../supabase/migrations/202607140001_sensitive_employee_details.sql",
    import.meta.url,
  ),
  "utf8",
);

test("sensitive details migration creates one row per employee", () => {
  assert.match(sql, /create table if not exists public\.employee_sensitive_details/i);
  assert.match(
    sql,
    /employee_id uuid not null unique references public\.employees\(id\) on delete cascade/i,
  );
});

test("government hashes use unique partial indexes", () => {
  for (const column of ["sss_hash", "philhealth_hash", "pagibig_hash", "tin_hash"]) {
    assert.match(
      sql,
      new RegExp(`unique index[^;]+${column}[^;]+where ${column} is not null`, "i"),
    );
  }
});

test("employee role receives no sensitive table policy", () => {
  assert.match(
    sql,
    /alter table public\.employee_sensitive_details enable row level security/i,
  );
  assert.match(sql, /using \(public\.is_hr_admin\(\)\)/i);
  assert.doesNotMatch(sql, /current_employee_id\(\)/i);
});

test("sensitive rows cannot be directly deleted through the API", () => {
  assert.doesNotMatch(
    sql,
    /create policy[^;]+on public\.employee_sensitive_details[^;]+for delete/i,
  );
});

test("reveal logs are append-only", () => {
  assert.match(
    sql,
    /alter table public\.sensitive_data_access_logs enable row level security/i,
  );
  assert.match(
    sql,
    /for insert to authenticated[\s\S]+with check \(public\.is_hr_admin\(\)\)/i,
  );
  assert.doesNotMatch(
    sql,
    /create policy[^;]+on public\.sensitive_data_access_logs[^;]+for update/i,
  );
  assert.doesNotMatch(
    sql,
    /create policy[^;]+on public\.sensitive_data_access_logs[^;]+for delete/i,
  );
});
