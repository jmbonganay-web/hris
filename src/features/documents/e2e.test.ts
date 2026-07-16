import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../../../supabase/migrations/202607170001_employee_document_management.sql", import.meta.url), "utf8");
const employeeActions = await readFile(new URL("../../app/(dashboard)/documents/actions.ts", import.meta.url), "utf8");
const adminActions = await readFile(new URL("../../app/(dashboard)/admin/documents/actions.ts", import.meta.url), "utf8");
const prepareRoute = await readFile(new URL("../../app/api/documents/uploads/prepare/route.ts", import.meta.url), "utf8");
const finalizeRoute = await readFile(new URL("../../app/api/documents/uploads/finalize/route.ts", import.meta.url), "utf8");
const accessRoute = await readFile(new URL("../../app/api/documents/versions/[versionId]/access/route.ts", import.meta.url), "utf8");

const flows = [
  ["employee submission", ["create_document_upload_session", "finalize_employee_document_upload", "pending_review", "document_submission_received"]],
  ["HR immediate activation", ["finalize_hr_document_upload", "approved", "active_version_id", "document_activated"]],
  ["review approval", ["review_employee_document", "DOCUMENT_SELF_REVIEW_FORBIDDEN", "document_reviews", "active_version_id"]],
  ["replacement request", ["replacement_requested", "employee_message", "supersedes_version_id"]],
  ["version restoration", ["restore_document_version", "DOCUMENT_ACTIVE_VERSION_CONFLICT"]],
  ["requirement precedence", ["get_employee_document_compliance", "all_active_employees", "employment_type", "department", "job_title", "employee"]],
  ["permission separation", ["documents.review", "documents.manage", "grant_document_permission", "revoke_document_permission"]],
  ["permanent deletion", ["permanently_delete_employee_document", "document_deletion_tombstones", "DOCUMENT_DELETE_REASON_REQUIRED"]],
] as const;

test("approved workflows are owned by protected database and server layers", () => {
  const source = [migration, employeeActions, adminActions, prepareRoute, finalizeRoute, accessRoute].join("\n");
  for (const [name, tokens] of flows) {
    for (const token of tokens) assert.match(source, new RegExp(token.replace(".", "\\."), "i"), `${name} should contain ${token}`);
  }
});

test("browser-facing code never embeds service-role credentials", () => {
  const browserFacing = [employeeActions, adminActions, prepareRoute, finalizeRoute, accessRoute].join("\n");
  assert.doesNotMatch(browserFacing, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(browserFacing, /serviceRoleKey\s*:/);
});

test("upload and access routes do not return raw storage paths", () => {
  const responsePayloads = [...finalizeRoute.matchAll(/Response\.json\(([\s\S]*?),\s*\{\s*(?:status|headers)/g)]
    .map((match) => match[1]);
  assert.ok(responsePayloads.length >= 2);
  for (const payload of responsePayloads) {
    assert.doesNotMatch(payload, /storagePath\s*:|storage_path\s*:/);
  }
  assert.doesNotMatch(accessRoute, /Response\.json\(\s*\{[\s\S]*?path:\s*data\.path/);
  assert.match(accessRoute, /Cache-Control/);
  assert.match(accessRoute, /no-store/);
});
