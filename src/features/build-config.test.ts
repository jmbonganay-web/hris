import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../../next.config.js", import.meta.url),
  "utf8",
);
const envExample = await readFile(new URL("../../.env.example", import.meta.url), "utf8");
const adminClient = await readFile(new URL("../lib/supabase/admin.ts", import.meta.url), "utf8");

test("production builds cap worker concurrency for stable page generation", () => {
  assert.match(source, /experimental:\s*\{[\s\S]*cpus:\s*2/);
});

test("Turbopack is scoped to the project instead of an ancestor lockfile", () => {
  assert.match(source, /turbopack:\s*\{[\s\S]*root:\s*__dirname/);
});

test("README documents Phase 6 migration and private leave bucket", async () => {
  const readme = await readFile(new URL("../../README.md", import.meta.url), "utf8");
  assert.match(readme, /202607160001_leave_management\.sql/);
  assert.match(readme, /leave-documents/);
  assert.match(readme, /private/i);
  assert.match(readme, /Asia\/Manila/);
});


test("document storage secrets remain server-only", () => {
  assert.doesNotMatch(envExample, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(adminClient, /import "server-only"/);
  assert.match(adminClient, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("README documents Phase 7 deployment and document operating limits", async () => {
  const readme = await readFile(new URL("../../README.md", import.meta.url), "utf8");
  assert.match(readme, /202607170001_employee_document_management\.sql/);
  assert.match(readme, /202607160004_fix_employee_manager_summary\.sql/);
  assert.match(readme, /employee-documents/);
  assert.match(readme, /public\s*=\s*false/i);
  for (const token of ["PDF", "JPG", "PNG", "DOCX", "15 MB", "10 files", "10-minute", "60-second", "documents.review", "documents.manage", "forward-only"]) {
    assert.match(readme, new RegExp(token.replace(".", "\\."), "i"));
  }
});
