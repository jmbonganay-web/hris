import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const csvRoute = await readFile(new URL("../../app/api/reports/export/csv/route.ts", import.meta.url), "utf8");
const xlsxRoute = await readFile(new URL("../../app/api/reports/export/xlsx/route.ts", import.meta.url), "utf8");

test("export routes use API authorization and private download headers", () => {
  for (const source of [csvRoute, xlsxRoute]) {
    assert.match(source, /requireReportApiAdmin/);
    assert.match(source, /ReportAccessError/);
    assert.match(source, /private, no-store, max-age=0/);
    assert.match(source, /X-Content-Type-Options/);
  }
});

test("generation completes before audit and response", () => {
  for (const source of [csvRoute, xlsxRoute]) {
    const generation = Math.max(source.indexOf("dailyCsv"), source.indexOf("buildAttendanceWorkbook"));
    const audit = source.indexOf("recordReportExportAudit");
    const response = source.lastIndexOf("new Response");
    assert.ok(generation >= 0 && audit > generation && response > audit);
  }
});

test("routes whitelist payroll exports and never expose raw database errors", () => {
  assert.match(csvRoute, /daily[\s\S]+employee_summary[\s\S]+exceptions[\s\S]+overtime_holiday/);
  for (const source of [csvRoute, xlsxRoute]) {
    assert.match(source, /filters\.mode !== "payroll"/);
    assert.doesNotMatch(source, /error\.(details|hint|code)|SQLSTATE|PGRST/);
    assert.match(source, /The report contains more than 25,000 rows/);
  }
});

test("spreadsheet dependency remains outside client components and files stay in memory", async () => {
  const panel = await readFile(new URL("./components/exports-panel.tsx", import.meta.url), "utf8");
  const workbook = await readFile(new URL("./xlsx.ts", import.meta.url), "utf8");
  assert.doesNotMatch(panel, /exceljs/i);
  assert.match(workbook, /writeBuffer/);
  for (const source of [csvRoute, xlsxRoute, workbook]) {
    assert.doesNotMatch(source, /writeFile|createWriteStream|tmpdir|supabase\.storage|\.storage\./i);
  }
});
