import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL(
    "../../../../supabase/migrations/202607140002_hr_notes_audit_history.sql",
    import.meta.url,
  ),
  "utf8",
);

const noteActions = await readFile(
  new URL(
    "../../../app/(dashboard)/employees/[id]/hr-note-actions.ts",
    import.meta.url,
  ),
  "utf8",
);

const revealActions = await readFile(
  new URL(
    "../../../app/(dashboard)/employees/[id]/sensitive-actions.ts",
    import.meta.url,
  ),
  "utf8",
);

test("audit definitions contain no prohibited sentinel values", () => {
  for (const sentinel of [
    "DO_NOT_LOG_NOTE_TEXT",
    "DO_NOT_LOG_SSS_1234567890",
    "DO_NOT_LOG_BANK_99887766",
  ]) {
    assert.doesNotMatch(migration, new RegExp(sentinel));
    assert.doesNotMatch(noteActions, new RegExp(sentinel));
    assert.doesNotMatch(revealActions, new RegExp(sentinel));
  }
});

test("audit JSON never uses protected database column names", () => {
  assert.doesNotMatch(migration, /jsonb_build_array\('[^']*_ciphertext'/i);
  assert.doesNotMatch(migration, /jsonb_build_array\('[^']*_hash'/i);
  assert.doesNotMatch(migration, /jsonb_build_array\('[^']*_last4'/i);
  assert.doesNotMatch(migration, /jsonb_build_object\('[^']*_ciphertext'/i);
  assert.doesNotMatch(migration, /jsonb_build_object\('[^']*_hash'/i);
  assert.doesNotMatch(migration, /jsonb_build_object\('[^']*_last4'/i);
});

test("deleted note content and ownership metadata are database-protected", () => {
  assert.match(migration, /create or replace function public\.enforce_hr_note_immutability/i);
  assert.match(migration, /Deleted HR notes cannot be edited/i);
  assert.match(migration, /ownership and creation metadata are immutable/i);
});

test("HR note actions never use persistent browser storage or plaintext logs", () => {
  assert.doesNotMatch(noteActions, /localStorage|sessionStorage/);
  assert.doesNotMatch(noteActions, /console\.(log|error)\([^)]*validation\.data\.content/);
  assert.doesNotMatch(noteActions, /console\.(log|error)\([^)]*contentCiphertext/);
});

test("sensitive reveal returns plaintext only after atomic RPC logging", () => {
  const rpcIndex = revealActions.indexOf('"log_sensitive_data_reveal"');
  const returnIndex = revealActions.indexOf("value: plaintext");
  assert.ok(rpcIndex >= 0);
  assert.ok(returnIndex > rpcIndex);
  assert.doesNotMatch(revealActions, /sensitive_data_access_logs"\)\s*\.insert/);
});
