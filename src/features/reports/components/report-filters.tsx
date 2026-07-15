import Link from "next/link";
import type { ReportFilterOptions, ReportFilters } from "../types";

export function ReportFilters({
  filters,
  options,
  today,
}: {
  filters: ReportFilters;
  options: ReportFilterOptions;
  today: string;
}) {
  return (
    <section className="card report-filter-card" aria-labelledby="report-filter-title">
      <h2 className="card-title" id="report-filter-title">Report filters</h2>
      <form className="report-filter-form" method="get">
        <input type="hidden" name="tab" value={filters.tab} />
        <select className="field" name="mode" defaultValue={filters.mode} aria-label="Report mode">
          <option value="operational">Operational</option>
          <option value="payroll">Payroll</option>
        </select>
        <input className="field" type="date" name="start_date" defaultValue={filters.startDate} max={today} aria-label="Start date" />
        <input className="field" type="date" name="end_date" defaultValue={filters.endDate} max={today} aria-label="End date" />
        <select className="field" name="department" defaultValue={filters.departmentId ?? ""} aria-label="Department">
          <option value="">All departments</option>
          {options.departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <select className="field" name="employee" defaultValue={filters.employeeId ?? ""} aria-label="Employee">
          <option value="">All employees</option>
          {options.employees.map((item) => <option key={item.id} value={item.id}>{item.employee_number} · {item.first_name} {item.last_name}</option>)}
        </select>
        <select className="field" name="employment_status" defaultValue={filters.employmentStatus ?? ""} aria-label="Employment status">
          <option value="">All employment statuses</option>
          <option value="active">Active</option>
          <option value="probation">Probation</option>
          <option value="on_leave">On leave</option>
          <option value="inactive">Inactive</option>
          <option value="terminated">Terminated</option>
        </select>
        <select className="field" name="page_size" defaultValue={String(filters.pageSize)} aria-label="Rows per page">
          <option value="25">25 rows</option>
          <option value="50">50 rows</option>
          <option value="100">100 rows</option>
        </select>

        {filters.tab === "summary" && (
          <label className="checkbox-row">
            <input type="checkbox" name="include_without_records" value="1" defaultChecked={filters.includeEmployeesWithoutRecords} />
            Include employees with no records
          </label>
        )}

        {filters.tab === "daily" && (
          <>
            <select className="field" name="attendance_status" defaultValue={filters.attendanceStatus ?? ""} aria-label="Attendance status">
              <option value="">All attendance statuses</option>
              <option value="present">Present</option>
              <option value="absent">Absent</option>
              <option value="holiday">Holiday</option>
              <option value="missing_clock_out">Missing clock-out</option>
              <option value="rest_day_worked">Rest day worked</option>
              <option value="unscheduled_attendance">Unscheduled attendance</option>
            </select>
            <select className="field" name="calculation_state" defaultValue={filters.calculationState ?? ""} aria-label="Calculation state">
              <option value="">All calculation states</option>
              <option value="finalized">Finalized</option>
              <option value="provisional">Provisional</option>
            </select>
          </>
        )}

        {filters.tab === "exceptions" && (
          <select className="field" name="exception_type" defaultValue={filters.exceptionType ?? ""} aria-label="Exception type">
            <option value="">All exception types</option>
            <option value="absent">Absent</option>
            <option value="missing_clock_out">Missing clock-out</option>
            <option value="provisional_or_incomplete">Provisional or incomplete</option>
            <option value="unscheduled_attendance">Unscheduled attendance</option>
            <option value="late">Late</option>
            <option value="undertime">Undertime</option>
          </select>
        )}

        {filters.tab === "overtime" && (
          <>
            <select className="field" name="segment_type" defaultValue={filters.segmentType ?? ""} aria-label="Segment type">
              <option value="">All segment types</option>
              <option value="pre_shift">Pre-shift</option>
              <option value="post_shift">Post-shift</option>
              <option value="rest_day">Rest-day overtime</option>
              <option value="holiday_work">Holiday work</option>
            </select>
            <select className="field" name="approval_status" defaultValue={filters.approvalStatus ?? ""} aria-label="Approval status">
              <option value="">All approval statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="superseded">Superseded</option>
            </select>
            <select className="field" name="holiday_type" defaultValue={filters.holidayType ?? ""} aria-label="Holiday type">
              <option value="">All holiday types</option>
              <option value="regular_holiday">Regular Holiday</option>
              <option value="special_non_working_holiday">Special Non-Working Holiday</option>
              <option value="company_holiday">Company Holiday</option>
            </select>
          </>
        )}

        <label className="checkbox-row">
          <input type="checkbox" name="active_only" value="1" defaultChecked={filters.activeOnly} />
          Active employees only
        </label>
        <div className="report-filter-actions">
          <button className="btn" type="submit">Apply filters</button>
          <Link className="btn" href="/reports">Reset</Link>
        </div>
      </form>
      <p className="muted report-mode-note">
        {filters.mode === "operational"
          ? "Operational mode may include provisional attendance and is limited to 31 days."
          : "Payroll mode includes finalized attendance only and is limited to 366 days."}
      </p>
    </section>
  );
}
