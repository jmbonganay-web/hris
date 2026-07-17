import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../../../supabase/migrations/202607170005_notifications_reminders_escalations.sql", import.meta.url),
  "utf8",
);
const recipientActions = await readFile(
  new URL("../../app/(dashboard)/notifications/actions.ts", import.meta.url),
  "utf8",
);
const settingsActions = await readFile(
  new URL("../../app/(dashboard)/admin/notifications/settings/actions.ts", import.meta.url),
  "utf8",
);
const notificationPage = await readFile(
  new URL("../../app/(dashboard)/notifications/page.tsx", import.meta.url),
  "utf8",
);
const notificationList = await readFile(
  new URL("../../components/notifications/notification-list.tsx", import.meta.url),
  "utf8",
);

const routeFiles = [
  "../../app/(dashboard)/notifications/page.tsx",
  "../../app/(dashboard)/notifications/loading.tsx",
  "../../app/(dashboard)/notifications/error.tsx",
  "../../app/(dashboard)/admin/notifications/settings/page.tsx",
  "../../app/(dashboard)/admin/notifications/settings/loading.tsx",
  "../../app/(dashboard)/admin/notifications/settings/error.tsx",
] as const;

test("approved notification routes exist", async () => {
  for (const route of routeFiles) {
    await assert.doesNotReject(access(new URL(route, import.meta.url)));
  }
});

test("recipient and settings mutations are owned by protected workflows", () => {
  for (const rpc of [
    "mark_notification_read",
    "mark_notification_unread",
    "dismiss_notification",
    "bulk_mark_notifications_read",
    "bulk_dismiss_notifications",
  ]) {
    assert.match(recipientActions, new RegExp(`invoke\\(\"${rpc}\"`));
  }
  for (const rpc of [
    "update_notification_rule",
    "reset_notification_rules_to_defaults",
    "run_notification_cycle_now",
  ]) {
    assert.match(settingsActions, new RegExp(`rpc\\(\"${rpc}\"`));
  }
  assert.match(migration, /run_daily_notification_cycle/i);
  assert.match(migration, /'0 0 \* \* \*'/i);
});

test("browser-facing notification UI excludes protected payload fields", () => {
  const browserFacing = [notificationPage, notificationList].join("\n");
  for (const token of [
    "safeContext",
    "recipientUserId",
    "sourceEventKey",
    "employeeId",
    "storagePath",
    "signedUrl",
    "internalReason",
    "serviceRoleKey",
  ]) {
    assert.doesNotMatch(browserFacing, new RegExp(token));
  }
  assert.doesNotMatch(browserFacing, /mockNotifications|fakeNotifications/);
});
