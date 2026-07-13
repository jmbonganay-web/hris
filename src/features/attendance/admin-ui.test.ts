import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(relative: string) {
  return readFile(new URL(relative, import.meta.url), "utf8");
}

test("admin attendance routes require HR authorization", async () => {
  for (const path of [
    "../../app/(dashboard)/admin/attendance/page.tsx",
    "../../app/(dashboard)/admin/attendance/new/page.tsx",
    "../../app/(dashboard)/admin/attendance/[employeeId]/page.tsx",
    "../../app/(dashboard)/admin/attendance/[employeeId]/[recordId]/edit/page.tsx",
  ]) {
    assert.match(await source(path), /requireAttendanceAdmin/);
  }
});

test("admin attendance form uses Manila-local controls and omits reasons from retry values", async () => {
  const form = await source("../../components/attendance/admin-attendance-form.tsx");
  assert.match(form, /type="datetime-local"/);
  assert.match(form, /Asia\/Manila/);
  assert.match(form, /name="reason"/);
  assert.match(form, /maxLength=\{1000\}/);
  assert.doesNotMatch(form, /state\.values\?\.reason/);
});

test("admin attendance pages use protected actions and record-scoped queries", async () => {
  const newPage = await source("../../app/(dashboard)/admin/attendance/new/page.tsx");
  const editPage = await source("../../app/(dashboard)/admin/attendance/[employeeId]/[recordId]/edit/page.tsx");
  assert.match(newPage, /createAttendanceByHr/);
  assert.match(editPage, /correctAttendanceByHr/);
  assert.match(editPage, /getAttendanceRecord/);
  assert.match(editPage, /notFound\(\)/);
});
