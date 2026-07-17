import test from "node:test";
import assert from "node:assert/strict";
import { canManageNotificationSettings, canViewNotificationSettings } from "./predicates.ts";

test("notification settings role predicates are independent", () => {
  assert.equal(canViewNotificationSettings("super_admin"), true);
  assert.equal(canManageNotificationSettings("super_admin"), true);
  assert.equal(canViewNotificationSettings("hr_admin"), true);
  assert.equal(canManageNotificationSettings("hr_admin"), false);
  assert.equal(canViewNotificationSettings("employee"), false);
});
