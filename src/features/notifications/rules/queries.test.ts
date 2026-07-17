import test from "node:test";
import assert from "node:assert/strict";
import { normalizeNotificationRuleRows } from "./normalize.ts";

test("rule rows normalize safe database fields", () => {
  assert.deepEqual(normalizeNotificationRuleRows([{id:"r1",type_code:"document_expiring",module:"documents",enabled:true,initial_delay_days:null,repeat_interval_days:1,escalation_after_days:7,lead_time_days:30,retention_days:90,version:2,updated_at:"2026-07-17T00:00:00Z",updated_by_name:"Admin"}])[0], {
    id:"r1",typeCode:"document_expiring",module:"documents",enabled:true,initialDelayDays:null,repeatIntervalDays:1,escalationAfterDays:7,leadTimeDays:30,retentionDays:90,version:2,updatedAt:"2026-07-17T00:00:00Z",updatedByName:"Admin"
  });
});
