import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const migration = await readFile(
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
const actionLayer = [employeeActions, adminActions, settingsActions].join("\n");
const workflowLayer = [migration, actionLayer].join("\n");

const flows = [
  ["draft submission approval", ["create_leave_draft", "submit_leave_request", "review_leave_request", "approved_leave_charge"]],
  ["pending withdrawal", ["submit_leave_request", "withdraw_leave_request", "withdrawn"]],
  ["pending rejection", ["review_leave_request", "rejected", "LEAVE_REJECTION_REASON_REQUIRED"]],
  ["approved cancellation", ["cancel_approved_leave_request", "cancellation_restoration"]],
  ["attendance conflict", ["apply_leave_attendance_effects", "full_day_completed_attendance", "attendance_conflict_release"]],
  ["year opening", ["preview_leave_year_opening", "generate_leave_year_opening", "carryover"]],
  ["policy replacement", ["create_leave_type_version", "revision_number", "effective_from"]],
  ["HR historical request", ["create_hr_leave_request", "pending"]],
] as const;

const actionRpcs = [
  "create_leave_draft",
  "submit_leave_request",
  "review_leave_request",
  "withdraw_leave_request",
  "cancel_approved_leave_request",
  "preview_leave_year_opening",
  "generate_leave_year_opening",
  "create_leave_type_version",
  "create_hr_leave_request",
];

test("all eight approved leave workflows have migration and server-action ownership", () => {
  for (const [name, tokens] of flows) {
    for (const token of tokens) {
      assert.match(workflowLayer, new RegExp(token, "i"), `${name} is missing ${token}`);
    }
  }
  for (const rpc of actionRpcs) {
    assert.match(actionLayer, new RegExp(`rpc\\("${rpc}"`, "i"), `${rpc} lacks a server action owner`);
  }
});

async function collectProductionFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectProductionFiles(absolute));
    else if (/\.(?:ts|tsx)$/.test(entry.name) && !/\.test\.(?:ts|tsx)$/.test(entry.name)) files.push(absolute);
  }
  return files;
}

test("client and route layers do not bypass protected leave mutations", async () => {
  const files = await collectProductionFiles(root);
  const protectedTables = [
    "leave_request_revisions",
    "leave_request_days",
    "leave_request_day_revisions",
    "leave_request_actions",
    "leave_balance_accounts",
    "leave_balance_ledger",
    "leave_attendance_conflicts",
  ];
  for (const filename of files) {
    const source = await readFile(filename, "utf8");
    for (const table of protectedTables) {
      assert.doesNotMatch(
        source,
        new RegExp(`from\\([\\"']${table}[\\"']\\)[\\s\\S]{0,160}?\\.(?:insert|update|delete)\\(`, "i"),
        `${filename} directly mutates ${table}`,
      );
    }
  }
});

test("approved employee and HR leave route tree exists", async () => {
  const routes = [
    "app/(dashboard)/employee/leave/page.tsx",
    "app/(dashboard)/employee/leave/new/page.tsx",
    "app/(dashboard)/employee/leave/[requestGroupId]/page.tsx",
    "app/(dashboard)/employee/leave/[requestGroupId]/edit/page.tsx",
    "app/(dashboard)/admin/leave/page.tsx",
    "app/(dashboard)/admin/leave/new/page.tsx",
    "app/(dashboard)/admin/leave/[requestGroupId]/page.tsx",
    "app/(dashboard)/admin/leave/balances/page.tsx",
    "app/(dashboard)/admin/leave/conflicts/page.tsx",
    "app/(dashboard)/admin/leave/year-opening/page.tsx",
    "app/(dashboard)/settings/leave-types/page.tsx",
    "app/(dashboard)/settings/leave-types/new/page.tsx",
    "app/(dashboard)/settings/leave-types/[leaveTypeId]/page.tsx",
    "app/(dashboard)/settings/leave-types/[leaveTypeId]/new-version/page.tsx",
    "app/(dashboard)/leave/page.tsx",
  ];
  await Promise.all(routes.map((route) => access(path.join(root, route))));
});
