import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));

async function read(relativePath: string) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

async function listFiles(directory: string): Promise<string[]> {
  const absolute = path.join(projectRoot, directory);
  const entries = await readdir(absolute, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const relative = path.join(directory, entry.name);
      return entry.isDirectory() ? listFiles(relative) : [relative];
    }),
  );
  return nested.flat();
}

const plannedRoutes = [
  "src/app/(dashboard)/payroll/page.tsx",
  "src/app/(dashboard)/payroll/schedules/page.tsx",
  "src/app/(dashboard)/payroll/schedules/new/page.tsx",
  "src/app/(dashboard)/payroll/schedules/[scheduleId]/page.tsx",
  "src/app/(dashboard)/payroll/periods/page.tsx",
  "src/app/(dashboard)/payroll/periods/[periodId]/page.tsx",
  "src/app/(dashboard)/payroll/approvals/page.tsx",
  "src/app/(dashboard)/employees/[id]/compensation/page.tsx",
  "src/app/(dashboard)/employees/[id]/compensation/new/page.tsx",
  "src/app/(dashboard)/employees/[id]/compensation/[recordId]/page.tsx",
  "src/app/(dashboard)/me/compensation/page.tsx",
] as const;

const protectedRpcNames = [
  "create_payroll_schedule",
  "update_payroll_schedule",
  "set_payroll_schedule_active",
  "ensure_payroll_period_horizon",
  "transition_payroll_period",
  "reopen_payroll_period",
  "create_compensation_draft",
  "update_compensation_draft",
  "submit_compensation_record",
  "approve_compensation_record",
  "reject_compensation_record",
  "create_schedule_assignment_draft",
  "update_schedule_assignment_draft",
  "submit_schedule_assignment",
  "approve_schedule_assignment",
  "reject_schedule_assignment",
] as const;

const actionFiles = [
  "src/app/(dashboard)/payroll/actions.ts",
  "src/app/(dashboard)/payroll/schedules/actions.ts",
  "src/app/(dashboard)/payroll/periods/actions.ts",
  "src/app/(dashboard)/payroll/approvals/actions.ts",
  "src/app/(dashboard)/employees/[id]/compensation/actions.ts",
] as const;

test("all approved Phase 10A routes exist and remain server-authorized", async () => {
  for (const route of plannedRoutes) {
    const source = await read(route);
    assert.match(source, /require(?:Payroll(?:Viewer|Administrator|Approver)|EmployeeProfileManager)/, route);
  }
});

test("all payroll mutations use protected RPCs instead of direct table writes", async () => {
  const sources = await Promise.all(actionFiles.map(read));
  const combined = sources.join("\n");
  for (const rpc of protectedRpcNames) {
    assert.match(combined, new RegExp(`"${rpc}"`), rpc);
  }
  for (const source of sources) {
    assert.match(source, /^"use server";/);
    assert.match(source, /requirePayroll(?:Administrator|Approver)/);
    assert.doesNotMatch(source, /\.from\([^)]*\)[\s\S]*?\.\s*(?:insert|update|delete|upsert)\s*\(/);
    assert.doesNotMatch(source, /console\.(?:log|info|warn|error)/);
  }
});

test("browser-facing payroll files never reference the service-role key", async () => {
  const candidates = [
    ...(await listFiles("src/app/(dashboard)/payroll")),
    ...(await listFiles("src/app/(dashboard)/me/compensation")),
    ...(await listFiles("src/components/payroll")),
  ].filter((file) => /\.(?:ts|tsx)$/.test(file));
  for (const file of candidates) {
    assert.doesNotMatch(await read(file), /SUPABASE_SERVICE_ROLE_KEY|service_role/i, file);
  }
});

test("payroll notification builders exclude compensation amounts and private reasons", async () => {
  const migration = await read("supabase/migrations/202607180002_payroll_foundation.sql");
  const notifications = migration.match(/perform public\.notify_payroll_[\s\S]*?\n\s*\);/gi) ?? [];
  assert.ok(notifications.length >= 6, "expected payroll notification calls");
  for (const block of notifications) {
    assert.doesNotMatch(
      block,
      /monthly_salary|hourly_rate|change_reason|override_reason|rejection_reason|p_reason|v_reason/i,
    );
  }
});

test("private reasons do not enter action retry state or application logs", async () => {
  const sources = await Promise.all(actionFiles.map(read));
  for (const source of sources) {
    assert.doesNotMatch(source, /console\.(?:log|info|warn|error)/);
    assert.doesNotMatch(source, /(?:error|success)\s*:\s*(?:reason|p_reason|v_reason)\b/i);
    assert.doesNotMatch(source, /(?:error|success)\s*:\s*`[^`]*\$\{reason\}/i);
  }
});

test("payroll navigation and responsive layout hooks are present", async () => {
  const sidebar = await read("src/components/sidebar.tsx");
  const css = await read("src/app/globals.css");
  assert.match(sidebar, /\["\/me\/compensation",\s*"My Compensation"/);
  assert.match(sidebar, /\["\/payroll",\s*"Payroll"/);
  for (const className of [
    "payroll-layout",
    "payroll-overview-grid",
    "payroll-schedule-preview",
    "payroll-period-list",
    "payroll-summary-grid",
    "payroll-approval-grid",
    "payroll-timeline",
    "payroll-filter-form",
  ]) {
    assert.match(css, new RegExp(`\\.${className}(?:[\\s.{:#,>]|$)`), className);
  }
  assert.match(css, /@media\s*\(max-width:\s*760px\)[\s\S]*?\.payroll-filter-form/);
});

test("README preserves forward migration order through Phase 10A", async () => {
  const readme = await read("README.md");
  const phase9Fix = readme.indexOf("202607180001_fix_notification_archive_outer_join_lock.sql");
  const phase10a = readme.indexOf("202607180002_payroll_foundation.sql");
  assert.ok(phase9Fix >= 0, "README must list the Phase 9 archive-lock fix");
  assert.ok(phase10a > phase9Fix, "Phase 10A migration must follow the Phase 9 fix");
});

test("post-migration verification covers the Phase 10A deployment contract", async () => {
  const verification = await read("phase10a_post_migration_verification.sql");
  for (const token of [
    "payroll_settings",
    "payroll_schedules",
    "payroll_periods",
    "employee_compensation_records",
    "employee_payroll_schedule_assignments",
    "payroll_period_events",
    "compensation_events",
    "SECURITY DEFINER",
    "search_path=pg_catalog, public",
    "hris-daily-payroll-period-generation",
    "15 0 * * *",
    "PHASE10A_VERIFICATION_ROLLBACK",
    "FOR UPDATE OF N",
  ]) {
    assert.match(verification, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
});
