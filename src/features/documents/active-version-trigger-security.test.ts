import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const patch = await readFile(
  new URL(
    "../../../supabase/migrations/202607170003_fix_document_active_version_trigger_permissions.sql",
    import.meta.url,
  ),
  "utf8",
);

function functionSql(name: string) {
  return (
    patch.match(
      new RegExp(
        `create or replace function public\\.${name}\\s*\\([\\s\\S]*?\\$\\$;`,
        "i",
      ),
    )?.[0] ?? ""
  );
}

test("deferred active-version guard runs with definer privileges", () => {
  const definition = functionSql("validate_employee_document_active_version");

  assert.match(definition, /returns trigger/i);
  assert.match(definition, /security definer/i);
  assert.match(definition, /set search_path = pg_catalog, public/i);
  assert.match(definition, /from public\.employee_document_versions/i);
  assert.match(patch, /revoke all on function public\.validate_employee_document_active_version\(\) from public, anon, authenticated/i);
});

test("patch is forward-only and reloads PostgREST schema", () => {
  assert.match(patch, /^begin;/m);
  assert.match(patch, /notify pgrst, 'reload schema';/i);
  assert.match(patch, /commit;/i);
  assert.doesNotMatch(patch, /drop table|truncate table|delete from/i);
});
