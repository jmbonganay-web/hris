import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../../../supabase/migrations/202607170001_employee_document_management.sql", import.meta.url), "utf8");

function functionSql(name: string) {
  return sql.match(new RegExp(`create or replace function public\\.${name}\\s*\\([\\s\\S]*?\\$\\$;`, "i"))?.[0] ?? "";
}

test("review locks the document and version and rejects stale state", () => {
  const definition = functionSql("review_employee_document");
  assert.match(definition, /for update/i);
  assert.match(definition, /DOCUMENT_VERSION_STALE/i);
  assert.match(definition, /DOCUMENT_REVIEW_ALREADY_COMPLETED/i);
  assert.match(definition, /DOCUMENT_SELF_REVIEW_FORBIDDEN/i);
  assert.match(definition, /active_version_id/i);
});

test("idempotent workflows persist request identifiers", () => {
  for (const name of [
    "finalize_employee_document_upload", "finalize_hr_document_upload", "review_employee_document",
    "restore_document_version", "archive_employee_document", "restore_employee_document",
    "grant_document_permission", "revoke_document_permission", "permanently_delete_employee_document",
  ]) {
    const definition = functionSql(name);
    assert.match(definition, /p_request_id/i);
    assert.match(definition, /document_lifecycle_actions/i);
  }
});

test("approval atomically replaces the active approved version", () => {
  const definition = functionSql("review_employee_document");
  assert.match(definition, /review_status = 'approved'/i);
  assert.match(definition, /active_version_id = v_version\.id/i);
  assert.match(definition, /document_reviews/i);
  assert.match(definition, /notifications/i);
  assert.match(definition, /document_audit_logs/i);
});

test("state-changing document workflows lock their authoritative rows", () => {
  const requiredLocks = [
    "create_document_category_version",
    "create_document_upload_session",
    "finalize_employee_document_upload",
    "finalize_hr_document_upload",
    "review_employee_document",
    "restore_document_version",
    "archive_employee_document",
    "restore_employee_document",
    "grant_document_permission",
    "revoke_document_permission",
    "permanently_delete_employee_document",
  ];
  for (const name of requiredLocks) {
    assert.match(functionSql(name), /for update/i, `${name} must lock mutable state`);
  }
  assert.match(functionSql("create_document_category_version"), /DOCUMENT_CATEGORY_STALE/i);
  assert.match(functionSql("restore_document_version"), /DOCUMENT_ACTIVE_VERSION_CONFLICT/i);
});

test("state transitions replay safe lifecycle results by actor, action, and request", () => {
  for (const name of [
    "create_document_category_version",
    "finalize_employee_document_upload",
    "finalize_hr_document_upload",
    "review_employee_document",
    "restore_document_version",
    "archive_employee_document",
    "restore_employee_document",
    "grant_document_permission",
    "revoke_document_permission",
    "permanently_delete_employee_document",
  ]) {
    const definition = functionSql(name);
    assert.match(definition, /p_request_id/i);
    assert.match(definition, /actor_user_id\s*=\s*auth\.uid\(\)/i);
    assert.match(definition, /document_lifecycle_actions/i);
  }
  const prepare = functionSql("create_document_upload_session");
  assert.match(prepare, /actor_user_id\s*=\s*auth\.uid\(\)/i);
  assert.match(prepare, /idempotency_key\s*=\s*p_idempotency_key/i);
});

test("finalization, review, restoration, and deletion reject duplicate completion", () => {
  for (const name of ["finalize_employee_document_upload", "finalize_hr_document_upload", "review_employee_document", "restore_document_version", "permanently_delete_employee_document"]) {
    assert.match(functionSql(name), /if\s+v_[a-z_]+\s+is not null\s+then\s+return/i, `${name} must return its prior result`);
  }
  const completion = functionSql("complete_permanent_document_deletion");
  assert.match(completion, /storage_cleanup_status\s*=\s*'completed'/i);
  assert.match(completion, /return jsonb_build_object\('tombstone_id'/i);
});
