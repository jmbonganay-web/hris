// Updated Phase 9 compatibility: validates the effective forward-only document RLS patch.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../../../supabase/migrations/202607170001_employee_document_management.sql", import.meta.url), "utf8");

const categoryPolicyPatch = await readFile(
  new URL(
    "../../../supabase/migrations/202607170002_fix_document_category_policy_recursion.sql",
    import.meta.url,
  ),
  "utf8",
);

const effectiveDocumentSecuritySql = `${sql}\n${categoryPolicyPatch}`;

test("document tables enable RLS and deny direct mutation", () => {
  for (const table of [
    "document_categories", "document_category_versions", "document_category_fields",
    "employee_documents", "employee_document_versions", "document_reviews",
    "document_requirements", "document_requirement_targets", "document_permission_grants",
    "document_upload_sessions", "document_upload_session_files", "document_lifecycle_actions",
    "document_audit_logs", "document_deletion_tombstones", "notifications",
  ]) assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  assert.match(sql, /revoke all on public\.employee_document_versions from authenticated/i);
  assert.match(sql, /revoke all on public\.document_reviews from authenticated/i);
});

test("storage policies do not grant arbitrary list or insert access", () => {
  assert.doesNotMatch(sql, /create policy[\s\S]*?on storage\.objects[\s\S]*?for select[\s\S]*?bucket_id = 'employee-documents'/i);
  assert.doesNotMatch(sql, /create policy[\s\S]*?on storage\.objects[\s\S]*?for insert[\s\S]*?bucket_id = 'employee-documents'/i);
});

test("audit payload guards reject signed URLs and storage credentials", () => {
  assert.match(sql, /assert_safe_document_audit_payload/i);
  assert.match(sql, /signed_url/i);
  assert.match(sql, /storage_path/i);
  assert.match(sql, /service_role/i);
});

test("privileged functions lock search path and revoke default execution", () => {
  for (const rpc of [
    "grant_document_permission", "create_document_upload_session", "review_employee_document",
    "restore_document_version", "permanently_delete_employee_document",
    "get_manager_document_compliance",
  ]) {
    const definition = sql.match(new RegExp(`create or replace function public\\.${rpc}\\s*\\([\\s\\S]*?\\$\\$;`, "i"))?.[0] ?? "";
    assert.match(definition, /security definer/i);
    assert.match(definition, /set search_path = pg_catalog, public/i);
    assert.match(sql, new RegExp(`revoke all on function public\\.${rpc}`, "i"));
  }
});

test("manager compliance function returns aggregate fields only", () => {
  const definition = sql.match(/create or replace function public\.get_manager_document_compliance[\s\S]*?\$\$;/i)?.[0] ?? "";
  for (const field of ["employee_id", "employee_name", "overall_status", "missing_count", "pending_review_count", "expiring_soon_count", "expired_count"]) assert.match(definition, new RegExp(field, "i"));
  for (const forbidden of ["storage_path", "original_filename", "reference_number", "notes", "issuing_organization", "custom_metadata", "internal_reason"]) assert.doesNotMatch(definition, new RegExp(forbidden, "i"));
});

const adminClient = await readFile(new URL("../../lib/supabase/admin.ts", import.meta.url), "utf8");
const accessRoute = await readFile(new URL("../../app/api/documents/versions/[versionId]/access/route.ts", import.meta.url), "utf8");
const documentQueries = await readFile(new URL("./documents/queries.ts", import.meta.url), "utf8");
const employeePage = await readFile(new URL("../../app/(dashboard)/documents/page.tsx", import.meta.url), "utf8");
const employeeDetail = await readFile(new URL("../../app/(dashboard)/documents/[documentId]/page.tsx", import.meta.url), "utf8");

function securityFunctionSql(name: string) {
  return sql.match(new RegExp(`create or replace function public\\.${name}\\s*\\([\\s\\S]*?\\$\\$;`, "i"))?.[0] ?? "";
}

test("employee document policies allow only own employee-visible identities", () => {
  assert.match(
    categoryPolicyPatch,
    /create policy employee_documents_safe_select[\s\S]*?employee_id\s*=\s*public\.current_employee_id\(\)[\s\S]*?document_category_allows_employee_document_access/i,
  );

  assert.match(
    categoryPolicyPatch,
    /create or replace function public\.document_category_allows_employee_document_access[\s\S]*?coalesce\(p_visibility_override,\s*current_version\.default_visibility\)\s*=\s*'employee_hr'/i,
  );

  assert.doesNotMatch(
    effectiveDocumentSecuritySql,
    /create policy[^;]*on public\.employee_document_versions/i,
  );

  assert.doesNotMatch(
    effectiveDocumentSecuritySql,
    /create policy[^;]*on public\.document_reviews/i,
  );
});

test("review, manage, grants, and permanent deletion remain independently authorized", () => {
  const permission = securityFunctionSql("has_document_permission");
  assert.match(permission, /g\.permission_code\s*=\s*p_permission/i);
  assert.doesNotMatch(permission, /documents\.review[\s\S]+documents\.manage/i);
  for (const name of ["grant_document_permission", "revoke_document_permission", "permanently_delete_employee_document"]) {
    assert.match(securityFunctionSql(name), /public\.is_super_admin\(\)/i);
  }
});

test("signed access is authorized and audited before the admin client signs", () => {
  const authorizeIndex = accessRoute.indexOf('rpc("authorize_document_file_access"');
  const signIndex = accessRoute.indexOf("createSignedUrl");
  assert.ok(authorizeIndex >= 0 && signIndex > authorizeIndex);
  const authorization = securityFunctionSql("authorize_document_file_access");
  assert.match(authorization, /DOCUMENT_ACCESS_DENIED/i);
  assert.match(authorization, /write_document_audit/i);
  assert.match(authorization, /'expires_in',\s*60/i);
});

test("service-role storage code remains server-only", () => {
  assert.match(adminClient, /import "server-only"/);
  assert.match(adminClient, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(adminClient, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch([accessRoute, documentQueries, employeePage, employeeDetail].join("\n"), /SUPABASE_SERVICE_ROLE_KEY/);
});

test("employee mappers and pages exclude raw paths and private review reasons", () => {
  const mapper = documentQueries.match(/export function normalizeEmployeeDocumentRow[\s\S]*?\n}\n/)?.[0] ?? "";
  for (const forbidden of ["storage_path", "signed_url", "internal_reason", "custom_metadata"]) {
    assert.doesNotMatch(mapper, new RegExp(forbidden, "i"));
    assert.doesNotMatch(employeePage, new RegExp(forbidden, "i"));
    assert.doesNotMatch(employeeDetail, new RegExp(forbidden, "i"));
  }
  const ownDetail = securityFunctionSql("get_own_document_detail");
  assert.match(ownDetail, /f\.employee_visible/i);
});

test("audit payload guard rejects URLs, paths, credentials, tokens, and raw files", () => {
  const guard = securityFunctionSql("assert_safe_document_audit_payload");
  for (const forbidden of ["signed_url", "storage_path", "service_role", "access_token", "raw_file"]) {
    assert.match(guard, new RegExp(forbidden, "i"));
  }
});
