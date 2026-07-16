import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const patch = await readFile(
  new URL("../../../supabase/migrations/202607170002_fix_document_category_policy_recursion.sql", import.meta.url),
  "utf8",
);

function policySql(name: string) {
  return patch.match(new RegExp(`create policy ${name}[\\s\\S]*?;`, "i"))?.[0] ?? "";
}

function functionSql(name: string) {
  return patch.match(new RegExp(`create or replace function public\\.${name}\\s*\\([\\s\\S]*?\\$\\$;`, "i"))?.[0] ?? "";
}

test("category policy patch uses security-definer boolean helpers", () => {
  for (const name of [
    "document_category_is_employee_selectable",
    "document_category_version_is_employee_selectable",
    "document_category_allows_employee_document_access",
  ]) {
    const definition = functionSql(name);
    assert.match(definition, /security definer/i);
    assert.match(definition, /set search_path = pg_catalog, public/i);
    assert.match(patch, new RegExp(`grant execute on function public\\.${name}`, "i"));
  }
});

test("replacement policies avoid direct reciprocal table lookups", () => {
  const categories = policySql("document_categories_safe_select");
  const versions = policySql("document_category_versions_safe_select");
  const fields = policySql("document_category_fields_safe_select");
  const documents = policySql("employee_documents_safe_select");

  assert.match(categories, /document_category_is_employee_selectable\(id\)/i);
  assert.match(versions, /document_category_version_is_employee_selectable\(id\)/i);
  assert.match(fields, /document_category_version_is_employee_selectable\(category_version_id\)/i);
  assert.match(documents, /document_category_allows_employee_document_access\(\s*category_id,\s*visibility_override\s*\)/i);

  for (const policy of [categories, versions, fields, documents]) {
    assert.doesNotMatch(policy, /select\s+1\s+from\s+public\.document_(categories|category_versions|category_fields)/i);
  }
});

test("patch is forward-only and reloads PostgREST schema", () => {
  assert.match(patch, /^begin;/m);
  assert.match(patch, /notify pgrst, 'reload schema';/i);
  assert.match(patch, /commit;/i);
  assert.doesNotMatch(patch, /drop table|truncate table|delete from/i);
});
