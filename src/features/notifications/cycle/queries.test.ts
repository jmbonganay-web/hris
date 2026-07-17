import test from "node:test";
import assert from "node:assert/strict";
import { normalizeNotificationCycleRows } from "./normalize.ts";

test("cycle rows normalize counts and safe rule results", () => {
  const result = normalizeNotificationCycleRows([{id:"c1",run_date:"2026-07-17",run_source:"scheduled",status:"partial_failed",started_at:"2026-07-17T00:00:00Z",completed_at:"2026-07-17T00:00:05Z",created_count:"2",reminded_count:1,escalated_count:0,resolved_count:3,archived_count:4,error_code:"NOTIFICATION_RULE_PROCESSING_FAILED",safe_error_message:"One rule failed.",rule_results:{documents:{status:"failed",created:0,reminded:0,escalated:0,resolved:0,errorCode:"NOTIFICATION_RULE_PROCESSING_FAILED"}}}]);
  assert.equal(result[0].createdCount,2);
  assert.equal(result[0].status,"partial_failed");
  assert.equal(result[0].ruleResults.documents.errorCode,"NOTIFICATION_RULE_PROCESSING_FAILED");
});
