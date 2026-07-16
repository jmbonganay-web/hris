import { PageHeader } from "@/components/page-header";
import { companyDateAt } from "@/features/attendance/time";
import { requireReportAdmin } from "@/features/reports/auth";
import { DailyAttendanceTable } from "@/features/reports/components/daily-attendance-table";
import { EmployeeSummaryTable } from "@/features/reports/components/employee-summary-table";
import { ExceptionsTable } from "@/features/reports/components/exceptions-table";
import { ExportsPanel } from "@/features/reports/components/exports-panel";
import { LeaveBalanceTable } from "@/features/reports/components/leave-balance-table";
import { LeaveConflictReportTable } from "@/features/reports/components/leave-conflict-report-table";
import { LeaveUsageTable } from "@/features/reports/components/leave-usage-table";
import { OvertimeHolidayTable } from "@/features/reports/components/overtime-holiday-table";
import { ReportFilters } from "@/features/reports/components/report-filters";
import { ReportPagination } from "@/features/reports/components/report-pagination";
import { ReportTabs } from "@/features/reports/components/report-tabs";
import { SummaryCards } from "@/features/reports/components/summary-cards";
import { parseReportFilters } from "@/features/reports/filters";
import {
  getAttendanceExceptionReport,
  getDailyAttendanceReport,
  getEmployeeAttendanceSummary,
  getLeaveBalanceReport,
  getLeaveConflictReport,
  getLeaveUsageReport,
  getOvertimeHolidayReport,
  getReportFilterOptions,
  getReportSummary,
} from "@/features/reports/queries";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireReportAdmin();
  const raw = await searchParams;
  const today = companyDateAt();
  const filters = parseReportFilters(raw, today);
  const [options, summary] = await Promise.all([
    getReportFilterOptions(),
    getReportSummary(filters),
  ]);

  const employeeSummary = filters.tab === "summary" ? await getEmployeeAttendanceSummary(filters) : null;
  const daily = filters.tab === "daily" ? await getDailyAttendanceReport(filters) : null;
  const exceptions = filters.tab === "exceptions" ? await getAttendanceExceptionReport(filters) : null;
  const overtime = filters.tab === "overtime" ? await getOvertimeHolidayReport(filters) : null;
  const leaveBalances = filters.tab === "leave_balances" ? await getLeaveBalanceReport(filters) : null;
  const leaveUsage = filters.tab === "leave_usage" ? await getLeaveUsageReport(filters) : null;
  const leaveConflicts = filters.tab === "leave_conflicts" ? await getLeaveConflictReport(filters) : null;
  const paginated = employeeSummary ?? daily ?? exceptions ?? overtime ?? leaveBalances ?? leaveUsage ?? leaveConflicts;
  const attendanceTab = ["summary", "daily", "exceptions", "overtime"].includes(filters.tab);

  return (
    <>
      <PageHeader title="Attendance and leave reports" description="Review attendance, leave balances, leave usage, conflicts, and finalized payroll-preparation totals." />
      <ReportFilters filters={filters} options={options} today={today} />
      <ReportTabs filters={filters} />
      {attendanceTab && <SummaryCards mode={filters.mode} metrics={summary} />}
      {employeeSummary && <EmployeeSummaryTable result={employeeSummary} />}
      {daily && <DailyAttendanceTable result={daily} />}
      {exceptions && <ExceptionsTable result={exceptions} />}
      {overtime && <OvertimeHolidayTable result={overtime} />}
      {leaveBalances && <LeaveBalanceTable result={leaveBalances} />}
      {leaveUsage && <LeaveUsageTable result={leaveUsage} />}
      {leaveConflicts && <LeaveConflictReportTable result={leaveConflicts} />}
      {filters.tab === "exports" && <ExportsPanel filters={filters} />}
      {paginated && <ReportPagination filters={filters} page={paginated.page} totalPages={paginated.totalPages} total={paginated.total} />}
    </>
  );
}
