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

test("README documents Phase 9 notification deployment and operations", async () => {
  const readme = await readFile(new URL("../../README.md", import.meta.url), "utf8");
  for (const token of [
    "202607170005_notifications_reminders_escalations.sql",
    "hris-daily-notification-cycle",
    "0 0 * * *",
    "8:00 AM Asia/Manila",
    "90-day",
    "forward-only",
  ]) {
    assert.match(readme, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
});

test("README documents Phase 10A payroll deployment and operating boundaries", async () => {
  const readme = await readFile(new URL("../../README.md", import.meta.url), "utf8");
  for (const token of [
    "202607180001_fix_notification_archive_outer_join_lock.sql",
    "202607180002_payroll_foundation.sql",
    "hris-daily-payroll-period-generation",
    "15 0 * * *",
    "8:15 AM Asia/Manila",
    "/payroll/approvals",
    "/me/compensation",
    "Phase 10B exclusions",
    "forward-only",
  ]) {
    assert.match(readme, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
});

test("Phase 10A requires no new environment secret", () => {
  assert.match(envExample, /No additional payroll-specific environment variables are required/i);
  assert.doesNotMatch(envExample, /PAYROLL_(?:SECRET|KEY|TOKEN)=/i);
});

test("production build type-checks before bypassing the hanging Next.js worker", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8")) as { scripts: { build: string } };
  assert.equal(packageJson.scripts.build, "tsc --noEmit && next build");
  assert.match(source, /typescript:\s*\{[\s\S]*ignoreBuildErrors:\s*true/);
});
