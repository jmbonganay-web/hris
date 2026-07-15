import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ReportExportDataset, ReportFilters } from "./types";

export async function recordReportExportAudit(params: {
  dataset: ReportExportDataset | "workbook";
  format: "csv" | "xlsx";
  filters: ReportFilters;
  rowCount: number;
  sheetRowCounts?: Record<string, number>;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_attendance_report_export", {
    p_export_dataset: params.dataset,
    p_export_format: params.format,
    p_report_mode: params.filters.mode,
    p_start_date: params.filters.startDate,
    p_end_date: params.filters.endDate,
    p_department_id: params.filters.departmentId,
    p_employee_id_filter: params.filters.employeeId,
    p_employment_status: params.filters.employmentStatus,
    p_active_only: params.filters.activeOnly,
    p_include_employees_without_records: params.filters.includeEmployeesWithoutRecords,
    p_row_count: params.rowCount,
    p_sheet_row_counts: params.sheetRowCounts ?? null,
  });

  if (error) throw new Error("The export could not be audited.");
}
