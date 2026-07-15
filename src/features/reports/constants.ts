export const COMPANY_REPORT_TIME_ZONE = "Asia/Manila" as const;
export const OPERATIONAL_MAX_DAYS = 31;
export const PAYROLL_MAX_DAYS = 366;
export const REPORT_EXPORT_ROW_LIMIT = 25_000;
export const reportPageSizes = [25, 50, 100] as const;
export const reportModes = ["operational", "payroll"] as const;
export const reportTabs = ["summary", "daily", "exceptions", "overtime", "exports"] as const;
export const reportCalculationStates = ["finalized", "provisional"] as const;
export const reportEmploymentStatuses = ["active", "probation", "on_leave", "inactive", "terminated"] as const;
export const attendanceExceptionTypes = [
  "absent",
  "missing_clock_out",
  "provisional_or_incomplete",
  "unscheduled_attendance",
  "late",
  "undertime",
] as const;
