import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL("../../../../supabase/migrations/202607160001_leave_management.sql", import.meta.url),
  "utf8",
);
const storage = await readFile(new URL("./storage.ts", import.meta.url), "utf8").catch(() => "");
const prepareRoute = await readFile(
  new URL("../../../app/api/leave/attachments/prepare/route.ts", import.meta.url),
  "utf8",
).catch(() => "");
const finalizeRoute = await readFile(
  new URL("../../../app/api/leave/attachments/finalize/route.ts", import.meta.url),
  "utf8",
).catch(() => "");

test("attachment RPCs permit draft-only writes", () => {
  for (const name of ["prepare_leave_attachment", "finalize_leave_attachment", "delete_leave_attachment"]) {
    assert.match(sql, new RegExp(`create or replace function public\\.${name}`, "i"));
  }
  assert.match(sql, /current_status <> 'draft'/i);
  assert.match(sql, /frozen_at is not null/i);
});

test("server storage helper enforces exact types, size, and count", () => {
  assert.match(storage, /LEAVE_ATTACHMENT_MAX_COUNT/);
  assert.match(storage, /LEAVE_ATTACHMENT_MAX_BYTES/);
  assert.match(storage, /LEAVE_ATTACHMENT_MIME_TYPES/);
  assert.match(storage, /LEAVE_ATTACHMENT_EXTENSIONS/);
});

test("prepare and finalize routes authorize through the authenticated Supabase client", () => {
  assert.match(prepareRoute, /createClient/);
  assert.match(prepareRoute, /prepare_leave_attachment/);
  assert.match(prepareRoute, /randomUUID\(\)/);
  assert.doesNotMatch(prepareRoute, /body\.storagePath/);
  assert.match(prepareRoute, /signedUploadUrl/);
  assert.match(prepareRoute, /finalizeToken/);
  assert.doesNotMatch(prepareRoute, /\{ attachmentId, path, token \}/);
  assert.match(finalizeRoute, /createClient/);
  assert.match(finalizeRoute, /finalize_leave_attachment/);
  assert.doesNotMatch(finalizeRoute, /size_bytes:\s*body/i);
  assert.doesNotMatch(finalizeRoute, /body\.path|body\.storagePath/);
  assert.match(finalizeRoute, /decryptSensitiveValue/);
  assert.doesNotMatch(`${prepareRoute}\n${finalizeRoute}`, /service_role|createAdminClient/);
});

test("download route creates a short-lived signed URL after database authorization", async () => {
  const source = await readFile(
    new URL("../../../app/api/leave/attachments/[attachmentId]/download/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /get_leave_attachment_download/);
  assert.match(source, /createSignedUrl/);
  assert.match(source, /60/);
  assert.match(source, /Cache-Control[\s\S]*no-store/i);
});

test("finalization rechecks object metadata and serialized attachment count", () => {
  assert.match(sql, /storage\.objects/i);
  assert.match(sql, /metadata\s*->>\s*'size'/i);
  assert.match(sql, /metadata\s*->>\s*'mimetype'/i);
  assert.match(sql, /v_count\s*>=\s*5/i);
});
