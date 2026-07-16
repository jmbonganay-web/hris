import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../../../supabase/migrations/202607170001_employee_document_management.sql", import.meta.url), "utf8");
const tables = [
  "document_categories",
  "document_category_versions",
  "document_category_fields",
  "employee_documents",
  "employee_document_versions",
  "document_reviews",
  "document_requirements",
  "document_requirement_targets",
  "document_permission_grants",
  "document_upload_sessions",
  "document_upload_session_files",
  "document_lifecycle_actions",
  "document_audit_logs",
  "document_deletion_tombstones",
  "notifications",
];

test("migration creates every document table", () => {
  for (const table of tables) assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, "i"));
});

test("migration creates stable identities and immutable versions", () => {
  assert.match(sql, /document_categories_code_unique/i);
  assert.match(sql, /document_category_versions_number_unique/i);
  assert.match(sql, /employee_document_versions_number_unique/i);
  assert.match(sql, /document_reviews_version_unique/i);
  assert.match(sql, /prevent_document_immutable_mutation/i);
  for (const table of ["document_category_versions", "document_category_fields", "document_reviews", "document_audit_logs", "document_deletion_tombstones"]) {
    assert.match(sql, new RegExp(`before update or delete on public\\.${table}`, "i"));
  }
});

test("migration constrains approved enums and global limits", () => {
  for (const value of [
    "employee_hr", "hr_only", "super_admin_only", "single", "multiple",
    "required", "optional", "disabled", "draft", "pending_review", "approved",
    "rejected", "replacement_requested", "employee", "hr", "documents.review",
    "documents.manage", "all_active_employees", "department", "job_title",
    "employment_type", "pending", "finalized", "cancelled", "expired", "failed",
  ]) assert.match(sql, new RegExp(`'${value.replace(".", "\\.")}'`, "i"));
  assert.match(sql, /15 \* 1024 \* 1024/i);
  assert.match(sql, /manifest_count[^;]*<= 10/i);
});

test("migration creates a private employee-documents bucket", () => {
  assert.match(sql, /insert into storage\.buckets/i);
  assert.match(sql, /'employee-documents'/i);
  assert.match(sql, /public\s*,\s*file_size_limit/i);
  assert.match(sql, /false\s*,\s*15 \* 1024 \* 1024/i);
  for (const mime of ["application/pdf", "image/jpeg", "image/png", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]) assert.match(sql, new RegExp(mime.replaceAll("/", "\\/"), "i"));
});

test("migration includes supporting indexes and one transaction", () => {
  for (const name of [
    "document_category_versions_current_idx",
    "employee_documents_employee_category_idx",
    "employee_document_versions_review_queue_idx",
    "document_requirements_effective_idx",
    "document_permission_grants_active_unique",
    "document_upload_sessions_expiry_idx",
    "notifications_recipient_unread_idx",
  ]) assert.match(sql, new RegExp(name, "i"));
  assert.equal((sql.toLowerCase().match(/^begin;/gm) ?? []).length, 1);
  assert.equal((sql.toLowerCase().match(/^commit;/gm) ?? []).length, 1);
  assert.equal((sql.toLowerCase().match(/notify pgrst, 'reload schema';/g) ?? []).length, 1);
});

const publicRpcs = [
  "create_document_category",
  "create_document_category_version",
  "archive_document_category",
  "restore_document_category",
  "create_document_requirement",
  "revise_document_requirement",
  "archive_document_requirement",
  "restore_document_requirement",
  "grant_document_permission",
  "revoke_document_permission",
  "create_document_upload_session",
  "finalize_employee_document_upload",
  "finalize_hr_document_upload",
  "submit_document_draft",
  "review_employee_document",
  "restore_document_version",
  "archive_employee_document",
  "restore_employee_document",
  "permanently_delete_employee_document",
  "get_employee_document_compliance",
  "get_manager_document_compliance",
  "mark_notification_read",
];

const stableErrors = [
  "DOCUMENT_PERMISSION_DENIED", "DOCUMENT_CATEGORY_NOT_FOUND", "DOCUMENT_CATEGORY_ARCHIVED",
  "DOCUMENT_CATEGORY_STALE", "DOCUMENT_INVALID_VISIBILITY", "DOCUMENT_INVALID_METADATA",
  "DOCUMENT_INVALID_FILE", "DOCUMENT_FILE_TOO_LARGE", "DOCUMENT_FILE_COUNT_EXCEEDED",
  "DOCUMENT_CARDINALITY_CONFLICT", "DOCUMENT_UPLOAD_SESSION_INVALID",
  "DOCUMENT_UPLOAD_SESSION_EXPIRED", "DOCUMENT_UPLOAD_INCOMPLETE", "DOCUMENT_VERSION_STALE",
  "DOCUMENT_INVALID_STATUS", "DOCUMENT_SELF_REVIEW_FORBIDDEN",
  "DOCUMENT_REVIEW_ALREADY_COMPLETED", "DOCUMENT_REJECTION_REASON_REQUIRED",
  "DOCUMENT_REPLACEMENT_INSTRUCTIONS_REQUIRED", "DOCUMENT_ACTIVE_VERSION_CONFLICT",
  "DOCUMENT_REQUIREMENT_CONFLICT", "DOCUMENT_PERMISSION_GRANT_INVALID", "DOCUMENT_ARCHIVED",
  "DOCUMENT_DELETE_REASON_REQUIRED", "DOCUMENT_ACCESS_DENIED", "DOCUMENT_NOT_PREVIEWABLE",
  "DOCUMENT_NOT_FOUND",
];

test("migration creates every protected document workflow", () => {
  for (const rpc of publicRpcs) assert.match(sql, new RegExp(`create or replace function public\\.${rpc}\\s*\\(`, "i"));
});

test("migration exposes every stable document error", () => {
  for (const code of stableErrors) assert.match(sql, new RegExp(code, "i"));
});

test("migration seeds editable prototype categories", () => {
  for (const code of [
    "employment_contract", "government_id", "birth_certificate", "training_certificate",
    "professional_license", "medical_record", "disciplinary_record",
    "investigation_record", "other_employment_form",
  ]) assert.match(sql, new RegExp(`'${code}'`, "i"));
});

const safeViews = [
  "document_current_category_versions",
  "document_employee_safe_list",
  "document_hr_review_queue",
  "document_active_requirement_rules",
];

const documentHelpers = [
  "current_document_actor",
  "has_document_permission",
  "write_document_audit",
  "create_document_notification",
  "document_prior_action_result",
  "authorize_document_file_access",
  "get_document_upload_session_manifest",
  "mark_document_upload_files_verified",
];

test("migration creates security-invoker document projections and protected helpers", () => {
  for (const view of safeViews) {
    assert.match(sql, new RegExp(`create or replace view public\\.${view}[\\s\\S]*?security_invoker\\s*=\\s*true`, "i"));
  }
  for (const helper of documentHelpers) {
    assert.match(sql, new RegExp(`create or replace function public\\.${helper}\\s*\\(`, "i"));
  }
  assert.match(sql, /create constraint trigger employee_documents_active_version_guard/i);
  assert.match(sql, /execute function public\.validate_employee_document_active_version\(\)/i);
});

test("every public document workflow has explicit authenticated execution", () => {
  for (const rpc of publicRpcs) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${rpc}`, "i"));
    assert.match(sql, new RegExp(`grant execute on function public\\.${rpc}`, "i"));
  }
});

test("seed MIME arrays use unambiguous array append syntax", () => {
  assert.doesNotMatch(sql, /v_allowed\s*:=\s*v_allowed\s*\|\|\s*'application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document'/i);
  assert.match(sql, /array_append\(v_allowed,\s*'application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document'\)/i);
});
