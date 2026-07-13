import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const tabs = await readFile(
  new URL("../../../components/employees/profile/profile-tabs.tsx", import.meta.url),
  "utf8",
);
const form = await readFile(
  new URL("../../../components/employees/profile/hr-note-form.tsx", import.meta.url),
  "utf8",
);
const activePage = await readFile(
  new URL("../../../app/(dashboard)/employees/[id]/hr-notes/page.tsx", import.meta.url),
  "utf8",
);
const deletedPage = await readFile(
  new URL("../../../app/(dashboard)/employees/[id]/hr-notes/deleted/page.tsx", import.meta.url),
  "utf8",
);
const activityPage = await readFile(
  new URL("../../../app/(dashboard)/employees/[id]/activity/page.tsx", import.meta.url),
  "utf8",
);

test("HR Notes and Activity tabs are restricted to managers", () => {
  assert.match(tabs, /id: "hr_notes"[^\n]+restricted: true/);
  assert.match(tabs, /id: "activity"[^\n]+restricted: true/);
  assert.match(tabs, /filter\(\(tab\) => !tab\.restricted \|\| canManage\)/);
});

test("HR note form limits content and does not place it in action state", () => {
  assert.match(form, /maxLength=\{5000\}/);
  assert.match(form, /autoComplete="off"/);
  assert.doesNotMatch(form, /state\.values\?\.content/);
  assert.doesNotMatch(form, /localStorage|sessionStorage/);
});

test("protected pages authorize before loading note or activity data", () => {
  assert.match(activePage, /await requireHrNoteManager\(id\)[\s\S]+getActiveHrNotes\(id/);
  assert.match(deletedPage, /await requireDeletedHrNoteManager\(id\)[\s\S]+getDeletedHrNotes\(id\)/);
  assert.match(activityPage, /await requireEmployeeProfileManager\(id\)[\s\S]+getEmployeeActivity\(id/);
});
