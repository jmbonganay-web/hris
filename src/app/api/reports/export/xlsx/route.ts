import { companyDateAt } from "@/features/attendance/time";
import { buildAttendanceWorkbook, xlsxFilename } from "@/features/reports/xlsx";
import { recordReportExportAudit } from "@/features/reports/audit";
import { ReportAccessError, requireReportApiAdmin } from "@/features/reports/auth";
import { parseReportFilters } from "@/features/reports/filters";
import {
  getAttendanceExceptionReport,
  getDailyAttendanceReport,
  getEmployeeAttendanceSummary,
  getOvertimeHolidayReport,
} from "@/features/reports/queries";

export const dynamic = "force-dynamic";

function safeJsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function validationMessage(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  const allowed = new Set([
    "The selected date range is invalid.",
    "Operational reports are limited to 31 days.",
    "Payroll reports are limited to 366 days.",
    "Future report dates are not allowed.",
    "The selected report filter is invalid.",
    "The report contains more than 25,000 rows. Narrow the selected filters.",
  ]);
  return allowed.has(error.message) ? error.message : null;
}

export async function GET(request: Request) {
  try {
    await requireReportApiAdmin();

    const url = new URL(request.url);
    const filters = parseReportFilters(Object.fromEntries(url.searchParams.entries()), companyDateAt());
    if (filters.mode !== "payroll") {
      return safeJsonError("Exports are available in Payroll mode only.", 400);
    }

    const [daily, employeeSummary, exceptions, overtime] = await Promise.all([
      getDailyAttendanceReport(filters, true),
      getEmployeeAttendanceSummary(filters, true),
      getAttendanceExceptionReport(filters, true),
      getOvertimeHolidayReport(filters, true),
    ]);

    const buffer = await buildAttendanceWorkbook({
      daily: daily.rows,
      employeeSummary: employeeSummary.rows,
      exceptions: exceptions.rows,
      overtime: overtime.rows,
    });

    await recordReportExportAudit({
      dataset: "workbook",
      format: "xlsx",
      filters,
      rowCount: daily.rows.length + employeeSummary.rows.length + exceptions.rows.length + overtime.rows.length,
      sheetRowCounts: {
        "Daily Attendance": daily.rows.length,
        "Employee Summary": employeeSummary.rows.length,
        Exceptions: exceptions.rows.length,
        "Overtime & Holiday Work": overtime.rows.length,
      },
    });

    const filename = xlsxFilename(filters.startDate, filters.endDate);
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store, max-age=0",
        Pragma: "no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof ReportAccessError) {
      return safeJsonError("You do not have permission to access attendance reports.", 403);
    }
    const message = validationMessage(error);
    if (message) return safeJsonError(message, 400);
    console.error("Attendance XLSX export failed.");
    return safeJsonError("The export could not be generated.", 500);
  }
}
