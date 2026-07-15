import ExcelJS from "exceljs";
import { REPORT_EXPORT_ROW_LIMIT } from "./constants.ts";
import type {
  AttendanceExceptionReportRow,
  DailyAttendanceReportRow,
  EmployeeAttendanceSummaryRow,
  OvertimeHolidayReportRow,
} from "./types.ts";

type WorkbookValue = string | number | boolean | null | undefined;
type WorkbookRow = Record<string, WorkbookValue>;
type WorkbookColumn = { header: string; key: string; width: number; kind: "value" | "date" | "timestamp" };

const dateKeys = new Set(["attendance_date", "report_start_date", "report_end_date"]);
const timestampKeys = new Set([
  "scheduled_start", "scheduled_end", "clock_in", "clock_out", "generated_at",
  "detected_start", "detected_end", "reviewed_at",
]);

const dailyKeys = [
  "attendance_date", "employee_number", "employee_name", "department_name",
  "job_title_name", "employment_status", "attendance_status", "calculation_state",
  "is_holiday", "holiday_name", "holiday_type", "is_scheduled_day",
  "scheduled_start", "scheduled_end", "clock_in", "clock_out",
  "worked_minutes", "worked_duration", "late_minutes", "late_duration",
  "undertime_minutes", "undertime_duration", "pre_shift_detected_minutes",
  "pre_shift_approved_minutes", "pre_shift_status", "post_shift_detected_minutes",
  "post_shift_approved_minutes", "post_shift_status", "rest_day_detected_minutes",
  "rest_day_approved_minutes", "rest_day_status", "holiday_work_detected_minutes",
  "holiday_work_approved_minutes", "holiday_work_status",
  "total_approved_overtime_minutes", "total_approved_overtime_duration",
  "attendance_calculation_revision_id", "generated_at", "timezone",
] as const;

const employeeSummaryKeys = [
  "employee_number", "employee_name", "department_name", "job_title_name",
  "employment_status", "report_start_date", "report_end_date", "employee_day_records",
  "scheduled_days", "present_days", "absent_days", "holiday_days",
  "missing_clock_out_days", "rest_day_worked_days", "unscheduled_attendance_days",
  "finalized_days", "provisional_days", "worked_minutes", "worked_duration",
  "late_minutes", "late_duration", "undertime_minutes", "undertime_duration",
  "approved_pre_shift_minutes", "approved_pre_shift_duration",
  "approved_post_shift_minutes", "approved_post_shift_duration",
  "approved_rest_day_minutes", "approved_rest_day_duration",
  "approved_holiday_work_minutes", "approved_holiday_work_duration",
  "total_approved_overtime_minutes", "total_approved_overtime_duration",
  "regular_holiday_work_minutes", "regular_holiday_work_duration",
  "special_non_working_holiday_work_minutes", "special_non_working_holiday_work_duration",
  "company_holiday_work_minutes", "company_holiday_work_duration", "generated_at", "timezone",
] as const;

const exceptionKeys = [
  "attendance_date", "employee_number", "employee_name", "department_name",
  "job_title_name", "employment_status", "exception_type", "attendance_status",
  "calculation_state", "clock_in", "clock_out", "worked_minutes", "worked_duration",
  "late_minutes", "late_duration", "undertime_minutes", "undertime_duration",
  "is_corrected", "is_recalculated", "attendance_calculation_revision_id",
] as const;

const overtimeKeys = [
  "attendance_date", "employee_number", "employee_name", "department_name",
  "job_title_name", "employment_status", "segment_type", "holiday_name",
  "holiday_type", "detected_start", "detected_end", "detected_minutes",
  "detected_duration", "approved_minutes", "approved_duration", "approval_status",
  "reviewed_at", "is_active_detection", "is_superseded",
  "attendance_calculation_revision_id", "detection_revision_id", "approval_item_id",
] as const;

function columnWidth(key: string): number {
  if (key.includes("name") || key.includes("revision_id") || key.includes("approval_item_id")) return 24;
  if (key.includes("start") || key.includes("end") || key.includes("clock") || key.includes("generated_at") || key.includes("reviewed_at")) return 22;
  if (key.includes("duration") || key.includes("minutes")) return 18;
  return Math.max(14, Math.min(22, key.length + 2));
}

function columns(keys: readonly string[]): WorkbookColumn[] {
  return keys.map((key) => ({
    header: key,
    key,
    width: columnWidth(key),
    kind: dateKeys.has(key) ? "date" : timestampKeys.has(key) ? "timestamp" : "value",
  }));
}

function companyWallClockDate(value: string, kind: "date" | "timestamp"): Date | null {
  const match = kind === "date"
    ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    : /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour = "00", minute = "00", second = "00"] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
}

function safeWorkbookValue(kind: WorkbookColumn["kind"], value: WorkbookValue): string | number | boolean | Date | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && kind !== "value") {
    return companyWallClockDate(value, kind) ?? value;
  }
  return typeof value === "string" && /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function addSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  sheetColumns: WorkbookColumn[],
  rows: WorkbookRow[],
) {
  if (rows.length > REPORT_EXPORT_ROW_LIMIT) {
    throw new Error("The report contains more than 25,000 rows. Narrow the selected filters.");
  }

  const sheet = workbook.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = sheetColumns.map(({ header, key, width }) => ({ header, key, width }));
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheetColumns.length },
  };

  for (const [index, column] of sheetColumns.entries()) {
    if (column.kind === "date") sheet.getColumn(index + 1).numFmt = "yyyy-mm-dd";
    if (column.kind === "timestamp") sheet.getColumn(index + 1).numFmt = "yyyy-mm-dd hh:mm:ss";
  }

  for (const row of rows) {
    const projected = Object.fromEntries(
      sheetColumns.map(({ key, kind }) => [key, safeWorkbookValue(kind, row[key])]),
    );
    sheet.addRow(projected);
  }

  sheet.getRow(1).font = { bold: true };
  return sheet;
}

export async function buildAttendanceWorkbook(data: {
  daily: DailyAttendanceReportRow[];
  employeeSummary: EmployeeAttendanceSummaryRow[];
  exceptions: AttendanceExceptionReportRow[];
  overtime: OvertimeHolidayReportRow[];
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HRIS";
  workbook.description = "All dates and timestamps use Asia/Manila.";
  workbook.created = new Date();

  addSheet(workbook, "Daily Attendance", columns(dailyKeys), data.daily as WorkbookRow[]);
  addSheet(workbook, "Employee Summary", columns(employeeSummaryKeys), data.employeeSummary as WorkbookRow[]);
  addSheet(workbook, "Exceptions", columns(exceptionKeys), data.exceptions as WorkbookRow[]);
  addSheet(workbook, "Overtime & Holiday Work", columns(overtimeKeys), data.overtime as WorkbookRow[]);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function xlsxFilename(startDate: string, endDate: string): string {
  return `attendance-report-${startDate}-to-${endDate}.xlsx`;
}
