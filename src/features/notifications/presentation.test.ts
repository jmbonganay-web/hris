import test from "node:test";
import assert from "node:assert/strict";
import {
  notificationModuleLabel,
  notificationPriorityLabel,
  notificationStatusLabel,
  unreadCountLabel,
} from "./presentation.ts";

test("notification labels are explicit and readable", () => {
  assert.equal(notificationModuleLabel("documents"), "Documents");
  assert.equal(notificationPriorityLabel("urgent"), "Urgent");
  assert.equal(notificationStatusLabel("dismissed"), "Dismissed");
});

test("unread count labels cap visual text while preserving exact accessible text", () => {
  assert.deepEqual(unreadCountLabel(0), { visual: "", accessible: "No unread notifications" });
  assert.deepEqual(unreadCountLabel(12), { visual: "12", accessible: "12 unread notifications" });
  assert.deepEqual(unreadCountLabel(142), { visual: "99+", accessible: "142 unread notifications" });
});
