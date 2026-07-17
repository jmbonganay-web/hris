import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const recipient = await readFile(new URL("../../app/(dashboard)/notifications/actions.ts", import.meta.url), "utf8");
const settings = await readFile(new URL("../../app/(dashboard)/admin/notifications/settings/actions.ts", import.meta.url), "utf8");
test("recipient actions use protected RPCs and safe revalidation", () => {
  for (const rpc of ["mark_notification_read","mark_notification_unread","dismiss_notification","bulk_mark_notifications_read","bulk_dismiss_notifications"]) assert.equal(recipient.includes(`invoke("${rpc}"`), true);
  assert.match(recipient,/validateBulkNotificationIds/);
  assert.match(recipient,/revalidatePath\("\/notifications"\)/);
  assert.doesNotMatch(recipient,/recipient_user_id|recipientUserId/);
});
test("settings actions require Super Admin management and protected workflows", () => {
  assert.match(settings,/requireNotificationSettingsManager/);
  assert.match(settings,/validateNotificationRuleInput/);
  assert.match(settings,/run_notification_cycle_now/);
  assert.match(settings,/reset_notification_rules_to_defaults/);
  assert.match(settings,/Notification cycle finished\. Review the latest run status below\./);
});
