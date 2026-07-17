import test from "node:test";
import assert from "node:assert/strict";
import { normalizeNotificationRows } from "./normalize.ts";

test("notification normalization returns safe list fields only", () => {
  const item = normalizeNotificationRows([{id:"n1",type:"document_expiring",title:"Expiring",body:"A document expires soon.",module:"documents",priority:"high",status:"unread",action_url:"/documents",reminder_count:1,escalation_level:0,created_at:"2026-07-17T00:00:00Z",last_reminded_at:null,read_at:null,resolved_at:null,archived_at:null,safe_context:{forbidden:true},recipient_user_id:"u1",source_event_key:"secret"}])[0];
  assert.deepEqual(Object.keys(item), ["id","type","title","body","module","priority","status","actionUrl","reminderCount","escalationLevel","createdAt","lastRemindedAt","readAt","resolvedAt","archivedAt"]);
});

import { normalizeNotificationDashboardSummary } from "./normalize.ts";

test("dashboard summary normalizes aggregate counts and safe compact items", () => {
  const result = normalizeNotificationDashboardSummary({
    unreadCount: 4,
    urgentCount: 2,
    activeCount: 7,
    resolvedCount: 12,
    latestCycleStatus: "partial_failed",
    items: [
      {
        id: "n1",
        title: "Review needed",
        module: "documents",
        priority: "urgent",
        actionUrl: "/admin/documents/review",
        safeContext: { forbidden: true },
      },
    ],
  });
  assert.deepEqual(result, {
    unreadCount: 4,
    urgentCount: 2,
    activeCount: 7,
    resolvedCount: 12,
    latestCycleStatus: "partial_failed",
    items: [
      {
        id: "n1",
        title: "Review needed",
        module: "documents",
        priority: "urgent",
        actionUrl: "/admin/documents/review",
      },
    ],
  });
});
