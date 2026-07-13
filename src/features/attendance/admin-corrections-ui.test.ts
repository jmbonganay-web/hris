import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(relative: string) {
  return readFile(new URL(relative, import.meta.url), "utf8");
}

test("admin correction routes require attendance admin authorization", async () => {
  for (const path of [
    "../../app/(dashboard)/admin/attendance/corrections/page.tsx",
    "../../app/(dashboard)/admin/attendance/corrections/[requestId]/page.tsx",
  ]) {
    assert.match(await source(path), /requireAttendanceAdmin/);
  }
});

test("review form has explicit approval confirmation and private note limits", async () => {
  const form = await source("../../components/attendance/correction-review-form.tsx");
  assert.match(form, /value="approve"/);
  assert.match(form, /value="reject"/);
  assert.match(form, /maxLength=\{1000\}/);
  assert.match(form, /confirm/);
  assert.doesNotMatch(form, /state\.values\?\.review_note/);
});
