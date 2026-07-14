import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

async function source(relative: string) {
  return readFile(new URL(relative, import.meta.url), "utf8");
}

test("admin attendance routes require HR authorization", async () => {
  for (const path of [
    "../../app/(dashboard)/admin/attendance/page.tsx",
    "../../app/(dashboard)/admin/attendance/new/page.tsx",
    "../../app/(dashboard)/admin/attendance/[employeeId]/page.tsx",
    "../../app/(dashboard)/admin/attendance/[employeeId]/records/[recordId]/edit/page.tsx",
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
  const editPage = await source("../../app/(dashboard)/admin/attendance/[employeeId]/records/[recordId]/edit/page.tsx");
  assert.match(newPage, /createAttendanceByHr/);
  assert.match(editPage, /correctAttendanceByHr/);
  assert.match(editPage, /getAttendanceRecord/);
  assert.match(editPage, /notFound\(\)/);
});

test("calculation detail route authorizes before loading active result and history", async () => {
  const detail = await source("../../app/(dashboard)/admin/attendance/[employeeId]/[attendanceDate]/calculation/page.tsx");
  assert.ok(detail.indexOf("requireAttendanceAdmin") < detail.indexOf("getActiveCalculationForEmployeeDate"));
  assert.match(detail, /getCalculationRevisionHistory/);
  assert.match(detail, /AttendanceCalculationDetails/);
});

test("admin attendance exposes calculation filters and detail links", async () => {
  const page = await source("../../app/(dashboard)/admin/attendance/page.tsx");
  const table = await source("../../components/attendance/admin-attendance-table.tsx");
  for (const name of ["calculation_status", "late", "undertime", "calculation_state", "corrected_calculation", "recalculated"]) {
    assert.match(page, new RegExp(`name="${name}"`));
  }
  assert.match(table, /\/calculation/);
});

test("calculation-only absence rows have no nonexistent attendance edit action", async () => {
  const table = await source("../../components/attendance/admin-attendance-table.tsx");
  assert.match(table, /record\.is_calculation_only/);
  assert.match(table, /!record\.is_calculation_only/);
});


test("admin attendance route tree avoids conflicting dynamic slug names", async () => {
  const routeRoot = new URL(
    "../../app/(dashboard)/admin/attendance/[employeeId]/",
    import.meta.url,
  );
  const entries = await readdir(routeRoot, { withFileTypes: true });
  const dynamicChildren = entries
    .filter((entry) => entry.isDirectory() && /^\[[^\]]+\]$/.test(entry.name))
    .map((entry) => entry.name);

  assert.deepEqual(dynamicChildren, ["[attendanceDate]"]);

  const table = await source("../../components/attendance/admin-attendance-table.tsx");
  const detail = await source("../../app/(dashboard)/admin/attendance/[employeeId]/page.tsx");
  assert.match(table, /\/records\/\$\{record\.id\}\/edit/);
  assert.match(detail, /\/records\/\$\{record\.id\}\/edit/);
});
