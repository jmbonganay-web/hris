import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./queries.ts", import.meta.url), "utf8").catch(() => "");

test("request queries are server-only and use safe projection RPCs", () => {
  assert.match(source, /import "server-only"/);
  assert.match(source, /get_my_leave_requests/);
  assert.match(source, /get_admin_leave_requests/);
  assert.match(source, /get_leave_request_detail/);
  assert.doesNotMatch(source, /select\("\*"\)/);
});

test("request detail exposes a day fingerprint for stale review", () => {
  assert.match(source, /day_fingerprint/);
  assert.match(source, /current_chargeable_units/);
});

test("preview mapping converts database fields into leave domain types", () => {
  assert.match(source, /preview_leave_request/);
  assert.match(source, /chargeableUnits: Number/);
  assert.match(source, /halfDayBoundaryAt/);
});

test("request queries avoid direct private leave tables", () => {
  assert.doesNotMatch(source, /from\("leave_request_revisions"\)/);
  assert.doesNotMatch(source, /from\("leave_request_actions"\)/);
});

test("request detail mapper normalizes summary, day, attachment, and balance units", () => {
  assert.match(source, /mapLeaveRequestDetail/);
  assert.match(source, /requestedUnits: Number\(summary\.requested_units\)/);
  assert.match(source, /chargeableUnits: Number\(row\.current_chargeable_units\)/);
  assert.match(source, /chargeableUnits: Number\(day\.chargeable_units\)/);
  assert.match(source, /sizeBytes: Number\(attachment\.size_bytes\)/);
  assert.match(source, /mapLeaveBalance/);
});


test("list mapping preserves the active revision used by stale-safe actions", () => {
  assert.match(source, /active_revision_id/);
  assert.match(source, /activeRevisionId: row\.active_revision_id/);
});
