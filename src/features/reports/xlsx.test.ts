import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { buildAttendanceWorkbook, xlsxFilename } from "./xlsx.ts";

test("workbook has four visible worksheets with frozen filtered headers", async () => {
  const bytes = await buildAttendanceWorkbook({ daily: [], employeeSummary: [], exceptions: [], overtime: [] });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as never);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["Daily Attendance", "Employee Summary", "Exceptions", "Overtime & Holiday Work"]);
  for (const sheet of workbook.worksheets) {
    assert.equal(sheet.state, "visible");
    assert.equal(sheet.views[0]?.state, "frozen");
    assert.equal(sheet.views[0]?.ySplit, 1);
    assert.ok(sheet.autoFilter);
  }
});

test("formula-like values remain plain strings", async () => {
  const bytes = await buildAttendanceWorkbook({ daily: [{ employee_name: "=1+1" } as never], employeeSummary: [], exceptions: [], overtime: [] });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as never);
  assert.equal(workbook.getWorksheet("Daily Attendance")?.getCell("C2").value, "'=1+1");
});

test("XLSX filename is controlled", () => {
  assert.equal(xlsxFilename("2026-07-01", "2026-07-15"), "attendance-report-2026-07-01-to-2026-07-15.xlsx");
});

test("workbook enforces the 25,000-row limit before serialization", async () => {
  const rows = Array.from({ length: 25_001 }, () => ({ employee_name: "Safe" } as never));
  await assert.rejects(
    () => buildAttendanceWorkbook({ daily: rows, employeeSummary: [], exceptions: [], overtime: [] }),
    /more than 25,000 rows/,
  );
});

test("minute fields remain numeric and null timestamps stay blank", async () => {
  const bytes = await buildAttendanceWorkbook({
    daily: [{ attendance_date: "2026-07-15", employee_name: "Safe", scheduled_start: "2026-07-15T08:00:00+08:00", clock_out: null, worked_minutes: 0, worked_duration: "00:00" } as never],
    employeeSummary: [],
    exceptions: [],
    overtime: [],
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as never);
  const sheet = workbook.getWorksheet("Daily Attendance");
  assert.ok(sheet?.getCell("A2").value instanceof Date);
  assert.equal(sheet?.getCell("A2").numFmt, "yyyy-mm-dd");
  assert.ok(sheet?.getCell("M2").value instanceof Date);
  assert.equal(sheet?.getCell("M2").numFmt, "yyyy-mm-dd hh:mm:ss");
  assert.equal(sheet?.getCell("P2").value, null);
  assert.equal(sheet?.getCell("Q2").value, 0);
  assert.equal(sheet?.getCell("R2").value, "00:00");
});

test("workbook generation is in-memory and never writes files or uses storage", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("./xlsx.ts", import.meta.url), "utf8"));
  assert.match(source, /writeBuffer/);
  assert.doesNotMatch(source, /writeFile|createWriteStream|tmpdir|supabase\.storage|\.storage\./i);
});
