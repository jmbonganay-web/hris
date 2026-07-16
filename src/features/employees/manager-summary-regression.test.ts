import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const querySource = await readFile(
  new URL("./profile-queries.ts", import.meta.url),
  "utf8",
);

const migration = await readFile(
  new URL(
    "../../../supabase/migrations/202607160004_fix_employee_manager_summary.sql",
    import.meta.url,
  ),
  "utf8",
);

test("employee profile loads its manager through a safe ownership-scoped RPC", () => {
  assert.match(
    querySource,
    /\.rpc\(\s*["']get_employee_manager_summary["']/,
  );
  assert.doesNotMatch(
    querySource,
    /manager:employee_manager\s*\(/,
  );
  assert.match(
    querySource,
    /manager:\s*managerSummary/,
  );
});

test("manager summary RPC exposes only safe fields to the employee or HR", () => {
  assert.match(
    migration,
    /create or replace function public\.get_employee_manager_summary\(p_employee_id uuid\)/i,
  );
  assert.match(migration, /security definer/i);
  assert.match(
    migration,
    /set search_path\s*=\s*pg_catalog,\s*public/i,
  );
  assert.match(
    migration,
    /public\.is_hr_admin\(\)[\s\S]*public\.current_employee_id\(\)/i,
  );
  assert.match(
    migration,
    /returns table\s*\(\s*id uuid,\s*first_name text,\s*last_name text,\s*employee_number text,\s*employment_status public\.employment_status,\s*archived_at timestamptz\s*\)/i,
  );
  assert.match(
    migration,
    /revoke all on function public\.get_employee_manager_summary\(uuid\)\s*from public, anon/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.get_employee_manager_summary\(uuid\)\s*to authenticated/i,
  );
});
