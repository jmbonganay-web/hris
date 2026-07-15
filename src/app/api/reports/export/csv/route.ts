import { companyDateAt } from "@/features/attendance/time";
import {
  csvFilename,
  dailyCsv,
  employeeSummaryCsv,
  exceptionsCsv,
  overtimeHolidayCsv,
} from "@/features/reports/csv";
import { recordReportExportAudit } from "@/features/reports/audit";
import { ReportAccessError, requireReportApiAdmin } from "@/features/reports/auth";
import { parseReportFilters } from "@/features/reports/filters";
import {
  getAttendanceExceptionReport,
  getDailyAttendanceReport,
  getEmployeeAttendanceSummary,
  getOvertimeHolidayReport,
} from "@/features/reports/queries";
import type { ReportExportDataset, ReportFilters } from "@/features/reports/types";

export const dynamic = "force-dynamic";

const datasets = new Set<ReportExportDataset>([
  "daily",
  "employee_summary",
  "exceptions",
  "overtime_holiday",
]);

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

async function loadCsv(filters: ReportFilters, dataset: ReportExportDataset) {
  switch (dataset) {
    case "daily": {
      const result = await getDailyAttendanceReport(filters, true);
      return { csv: dailyCsv(result.rows), count: result.rows.length };
    }
    case "employee_summary": {
      const result = await getEmployeeAttendanceSummary(filters, true);
      return { csv: employeeSummaryCsv(result.rows), count: result.rows.length };
    }
    case "exceptions": {
      const result = await getAttendanceExceptionReport(filters, true);
      return { csv: exceptionsCsv(result.rows), count: result.rows.length };
    }
    case "overtime_holiday": {
      const result = await getOvertimeHolidayReport(filters, true);
      return { csv: overtimeHolidayCsv(result.rows), count: result.rows.length };
    }
  }
}

export async function GET(request: Request) {
  try {
    await requireReportApiAdmin();

    const url = new URL(request.url);
    const filters = parseReportFilters(Object.fromEntries(url.searchParams.entries()), companyDateAt());
    if (filters.mode !== "payroll") {
      return safeJsonError("Exports are available in Payroll mode only.", 400);
    }

    const rawDataset = url.searchParams.get("dataset") ?? "";
    if (!datasets.has(rawDataset as ReportExportDataset)) {
      return safeJsonError("The selected export dataset is invalid.", 400);
    }
    const dataset = rawDataset as ReportExportDataset;

    const generated = await loadCsv(filters, dataset);
    await recordReportExportAudit({
      dataset,
      format: "csv",
      filters,
      rowCount: generated.count,
    });

    const filename = csvFilename(dataset, filters.startDate, filters.endDate);
    return new Response(generated.csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
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
    console.error("Attendance CSV export failed.");
    return safeJsonError("The export could not be generated.", 500);
  }
}
