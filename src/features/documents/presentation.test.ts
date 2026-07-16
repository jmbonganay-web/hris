import test from "node:test";
import assert from "node:assert/strict";
import {
  documentExpirationLabel,
  documentStatusLabel,
  requirementStatusLabel,
} from "./presentation.ts";

test("document status labels are explicit", () => {
  assert.equal(documentStatusLabel("pending_review"), "Pending review");
  assert.equal(documentStatusLabel("replacement_requested"), "Replacement requested");
  assert.equal(documentExpirationLabel("no_expiration"), "No expiration");
  assert.equal(requirementStatusLabel("expiring_soon"), "Expiring soon");
});
