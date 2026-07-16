import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sql = await readFile(
  new URL("../../../supabase/migrations/202607160001_leave_management.sql", import.meta.url),
  "utf8",
);

const employeeActions = await readFile(
  new URL("../../app/(dashboard)/employee/leave/actions.ts", import.meta.url),
  "utf8",
);
const adminActions = await readFile(
  new URL("../../app/(dashboard)/admin/leave/actions.ts", import.meta.url),
  "utf8",
);
const settingsActions = await readFile(
  new URL("../../app/(dashboard)/settings/leave-types/actions.ts", import.meta.url),
  "utf8",
);

const baseTables = [
  "leave_types", "leave_type_versions", "employee_leave_year_settings",
  "leave_request_groups", "leave_request_revisions", "leave_request_days",
  "leave_request_day_revisions", "leave_request_actions", "leave_request_attachments",
  "leave_balance_accounts", "leave_balance_ledger", "leave_attendance_conflicts",
];

test("RLS is enabled on every leave base table", () => {
  for (const table of baseTables) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
});

test("ledger and immutable submitted history have no direct write policies", () => {
  for (const table of [
    "leave_type_versions", "leave_request_days", "leave_request_day_revisions",
    "leave_request_actions", "leave_balance_accounts", "leave_balance_ledger",
  ]) {
    assert.doesNotMatch(
      sql,
      new RegExp(`create policy[^;]+${table}[^;]+for (insert|update|delete)`, "i"),
    );
  }
});

test("employee reads are scoped by current employee and HR reads use role checks", () => {
  assert.match(sql, /public\.current_employee_id\(\)/i);
  assert.match(sql, /public\.is_hr_admin\(\)/i);
  assert.doesNotMatch(sql, /using \(true\)/i);
});

test("private storage policies scope objects to request ownership or HR", () => {
  assert.match(sql, /on storage\.objects/i);
  assert.match(sql, /bucket_id = 'leave-documents'/i);
  assert.match(sql, /public\.can_access_leave_storage_object/i);
  assert.doesNotMatch(sql, /create policy[^;]+storage\.objects[^;]+using \(true\)/i);
});


test("employee leave actions use employee auth only", () => {
  assert.match(employeeActions, /requireLeaveEmployee/);
  assert.doesNotMatch(employeeActions, /service_role|createAdminClient/);
});

test("admin and settings actions require leave admin", () => {
  assert.match(adminActions, /requireLeaveAdmin/);
  assert.match(settingsActions, /requireLeaveAdmin/);
});

test("server actions call RPCs instead of writing protected tables", () => {
  for (const source of [employeeActions, adminActions, settingsActions]) {
    assert.doesNotMatch(source, /from\("leave_balance_ledger"\)/);
    assert.doesNotMatch(source, /from\("leave_request_actions"\)/);
    assert.doesNotMatch(source, /from\("leave_request_day_revisions"\)/);
  }
});

test("server action retry state excludes confidential leave text", () => {
  const employeeRetryValues = employeeActions.match(
    /function leaveDraftValues[\s\S]*?\n}/,
  )?.[0] ?? "";
  const adminRetryValues = adminActions.match(
    /function leaveDraftValues[\s\S]*?\n}/,
  )?.[0] ?? "";
  const policyRetryValues = settingsActions.match(
    /function policyValues[\s\S]*?\n}/,
  )?.[0] ?? "";

  assert.doesNotMatch(employeeRetryValues, /employee_note|employeeNote/);
  assert.doesNotMatch(adminRetryValues, /employee_note|employeeNote/);
  assert.doesNotMatch(policyRetryValues, /change_reason|changeReason/);
  for (const source of [employeeActions, adminActions, settingsActions]) {
    for (const match of source.matchAll(/values:\s*\{([^{}]*)\}/g)) {
      assert.doesNotMatch(
        match[1],
        /employee_note|change_reason|private_reason|(?:^|\s)reason\s*:/,
      );
    }
  }
});


const privilegedRpcs = [
  "create_leave_type",
  "create_leave_type_version",
  "archive_leave_type",
  "create_leave_draft",
  "update_leave_draft",
  "delete_leave_draft",
  "submit_leave_request",
  "create_hr_leave_request",
  "withdraw_leave_request",
  "review_leave_request",
  "cancel_approved_leave_request",
  "create_leave_balance_adjustment",
  "upsert_employee_leave_year_setting",
  "preview_leave_year_opening",
  "generate_leave_year_opening",
  "generate_individual_leave_allocation",
  "recalculate_leave_request_dates",
  "resolve_leave_attendance_conflict",
];

function functionBody(name: string) {
  return sql.match(
    new RegExp(`create or replace function public\\.${name}\\s*\\([\\s\\S]*?\\$\\$;`, "i"),
  )?.[0] ?? "";
}

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(absolute));
    else if (/\.(?:ts|tsx)$/.test(entry.name) && !/\.test\.(?:ts|tsx)$/.test(entry.name)) files.push(absolute);
  }
  return files;
}

const sourceRoot = fileURLToPath(new URL("../../", import.meta.url));
const productionFiles = await sourceFiles(sourceRoot);
const productionSources = await Promise.all(
  productionFiles.map(async (filename) => ({ filename, source: await readFile(filename, "utf8") })),
);

test("every privileged leave RPC is security definer with a fixed search path", () => {
  for (const rpc of privilegedRpcs) {
    const body = functionBody(rpc);
    assert.notEqual(body, "", `missing RPC ${rpc}`);
    assert.match(body, /security definer/i, `${rpc} must be security definer`);
    assert.match(body, /set search_path = pg_catalog, public/i, `${rpc} must fix search_path`);
  }
});

test("internal accounting, audit, and normalization helpers are revoked from authenticated", () => {
  for (const helper of [
    "write_leave_audit",
    "normalize_leave_code",
    "normalize_leave_private_text",
    "get_or_create_leave_balance_account",
    "get_leave_balance",
    "get_leave_source_remaining",
    "consume_leave_balance",
    "restore_leave_charge",
    "get_leave_balance_projection",
    "resolve_leave_day_context",
    "submit_leave_request_internal",
    "apply_leave_attendance_effects",
    "recalculate_attendance_for_leave_dates",
  ]) {
    assert.match(
      sql,
      new RegExp(`revoke all on function public\\.${helper}\\([\\s\\S]*?from public, anon, authenticated`, "i"),
      `${helper} must not be executable by authenticated clients`,
    );
  }
});

test("all submitted history, accounting rows, and frozen attachments have database mutation guards", () => {
  for (const table of [
    "leave_request_revisions",
    "leave_request_day_revisions",
    "leave_request_actions",
    "leave_balance_ledger",
    "leave_request_attachments",
  ]) {
    assert.match(
      sql,
      new RegExp(`create trigger [^;]+[\\s\\S]*?before update or delete on public\\.${table}`, "i"),
      `${table} requires an update/delete guard`,
    );
  }
  const attachmentGuard = functionBody("prevent_submitted_leave_attachment_mutation");
  assert.match(attachmentGuard, /old\.frozen_at is not null[\s\S]*LEAVE_IMMUTABLE_RECORD/i);
  assert.match(attachmentGuard, /v_status <> 'draft'[\s\S]*LEAVE_IMMUTABLE_RECORD/i);
  assert.match(attachmentGuard, /new\.storage_path is distinct from old\.storage_path/i);
  assert.match(attachmentGuard, /new\.frozen_at is null/i);
});

test("protected history and ledger tables expose no employee mutation policies", () => {
  for (const table of [
    "leave_request_revisions",
    "leave_request_days",
    "leave_request_day_revisions",
    "leave_request_actions",
    "leave_request_attachments",
    "leave_balance_accounts",
    "leave_balance_ledger",
    "leave_attendance_conflicts",
  ]) {
    assert.doesNotMatch(
      sql,
      new RegExp(`create policy[\\s\\S]*?on public\\.${table}\\s+for (?:insert|update|delete)`, "i"),
      `${table} must be read-only through RLS`,
    );
  }
});

test("employee select policies use employee identity and HR policies use the HR role helper", () => {
  for (const table of [
    "leave_request_groups",
    "leave_request_revisions",
    "leave_request_days",
    "leave_request_day_revisions",
    "leave_request_actions",
    "leave_request_attachments",
  ]) {
    const policy = sql.match(
      new RegExp(`create policy[^;]+on public\\.${table} for select[\\s\\S]*?;`, "i"),
    )?.[0] ?? "";
    assert.match(policy, /current_employee_id\(\)/i, `${table} must scope employee reads`);
    assert.match(policy, /is_hr_admin\(\)/i, `${table} must allow authorized HR reads`);
  }
  for (const table of ["leave_types", "leave_type_versions", "employee_leave_year_settings", "leave_balance_accounts", "leave_balance_ledger", "leave_attendance_conflicts"]) {
    const policy = sql.match(
      new RegExp(`create policy[^;]+on public\\.${table} for select[\\s\\S]*?;`, "i"),
    )?.[0] ?? "";
    assert.match(policy, /is_hr_admin\(\)/i, `${table} must use HR role authorization`);
  }
});

test("storage policies authorize through the leave storage access helper", () => {
  const policies = [...sql.matchAll(/create policy[^;]+on storage\.objects[\s\S]*?;/gi)].map((match) => match[0]);
  assert.equal(policies.length, 3);
  for (const policy of policies) {
    assert.match(policy, /bucket_id = 'leave-documents'/i);
    assert.match(policy, /can_access_leave_storage_object\(name\)/i);
  }
});

test("production client source contains no service role secret or raw leave object path construction", () => {
  for (const { filename, source } of productionSources) {
    assert.doesNotMatch(source, /service_role|SUPABASE_SERVICE_ROLE_KEY/i, filename);
    assert.doesNotMatch(
      source,
      /leave-documents\s*[`'\"]?\s*\/\s*\$?\{?(?:employee|employeeId|employee_id)/i,
      `${filename} constructs a raw leave storage path`,
    );
  }
});

test("leave report SQL, exports, and audit payload builders omit confidential fields", async () => {
  const confidential = /employee_note|storage_path|original_filename|action_reason|review_note|private_reason|private_resolution_note/i;
  for (const auditCall of sql.matchAll(/perform public\.write_leave_audit\([\s\S]*?\n\s*\);/gi)) {
    assert.doesNotMatch(auditCall[0], confidential, "general leave audit payload exposes confidential content");
  }
  for (const rpc of ["get_leave_balance_report", "get_leave_usage_report", "get_leave_conflict_report"]) {
    assert.doesNotMatch(functionBody(rpc), confidential, `${rpc} exposes confidential leave content`);
  }
  for (const relative of [
    "features/reports/csv.ts",
    "features/reports/xlsx.ts",
    "features/reports/audit.ts",
    "app/api/reports/export/csv/route.ts",
    "app/api/reports/export/xlsx/route.ts",
  ]) {
    const source = await readFile(path.join(sourceRoot, relative), "utf8");
    assert.doesNotMatch(source, confidential, relative);
  }
});
