import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../../../supabase/migrations/202607160001_leave_management.sql", import.meta.url),
  "utf8",
);
const editPage = await readFile(
  new URL("../../app/(dashboard)/employee/leave/[requestGroupId]/edit/page.tsx", import.meta.url),
  "utf8",
);
const queries = await readFile(
  new URL("./requests/queries.ts", import.meta.url),
  "utf8",
);

function functionBody(name: string) {
  return migration.match(
    new RegExp(`create or replace function public\\.${name}\\s*\\([\\s\\S]*?\\$\\$;`, "i"),
  )?.[0] ?? "";
}

test("leave functions that call pgcrypto include the extensions schema in search_path", () => {
  for (const name of ["get_leave_request_detail", "review_leave_request"]) {
    const body = functionBody(name);
    assert.notEqual(body, "", `missing function ${name}`);
    assert.match(body, /digest\(/i, `${name} should calculate a fingerprint`);
    assert.match(
      body,
      /set search_path = pg_catalog, public, extensions/i,
      `${name} must be able to resolve Supabase pgcrypto functions`,
    );
  }
});

test("employee edit page uses notFound only for a confirmed missing request", () => {
  assert.match(queries, /LeaveRequestNotFoundError/);
  assert.match(editPage, /instanceof LeaveRequestNotFoundError/);
  assert.doesNotMatch(editPage, /catch\s*\{[\s\S]*?notFound\(\);[\s\S]*?\}/);
});
