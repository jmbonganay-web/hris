import Link from "next/link";
import { OvertimeApprovalTable } from "@/components/overtime/overtime-approval-table";
import { PageHeader } from "@/components/page-header";
import { formatAttendanceMinutes } from "@/features/attendance/calculations/presentation";
import { requireAttendanceAdmin } from "@/features/attendance/auth";
import { getActiveAttendanceEmployees } from "@/features/attendance/queries";
import { companyDateAt } from "@/features/attendance/time";
import { getEmployeeOptions } from "@/features/employees/queries";
import { getAdminOvertimeApprovalQueue } from "@/features/overtime/queries";
import type { HolidayType } from "@/features/overtime/holidays/types";
import type { OvertimeApprovalStatus, OvertimeSegmentType } from "@/features/overtime/types";

function value(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] : input ?? "";
}

function pageHref(filters: Record<string, string>, page: number) {
  const search = new URLSearchParams();
  for (const [key, item] of Object.entries(filters)) if (item) search.set(key, item);
  if (page > 1) search.set("page", String(page));
  return `/admin/overtime${search.size ? `?${search}` : ""}`;
}

export default async function AdminOvertimePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAttendanceAdmin();
  const raw = await searchParams;
  const dateFrom = value(raw.date_from);
  const dateTo = value(raw.date_to) || companyDateAt();
  const employee = value(raw.employee);
  const department = value(raw.department);
  const segmentType = value(raw.segment_type);
  const holidayType = value(raw.holiday_type);
  const status = value(raw.status);
  const page = Math.max(1, Number(value(raw.page) || "1") || 1);

  const [employees, options, result] = await Promise.all([
    getActiveAttendanceEmployees(),
    getEmployeeOptions(),
    getAdminOvertimeApprovalQueue({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      employeeId: employee || undefined,
      departmentId: department || undefined,
      segmentType: (segmentType || undefined) as OvertimeSegmentType | undefined,
      holidayType: (holidayType || undefined) as HolidayType | undefined,
      status: (status || undefined) as OvertimeApprovalStatus | undefined,
      page,
    }),
  ]);
  const filters = {
    date_from: dateFrom,
    date_to: dateTo,
    employee,
    department,
    segment_type: segmentType,
    holiday_type: holidayType,
    status,
  };

  return (
    <>
      <PageHeader
        title="Overtime approvals"
        description="Review immutable overtime and holiday-work detections."
        action={(
          <div className="header-actions">
            <Link className="btn" href="/admin/overtime/recalculate">Recalculate</Link>
          </div>
        )}
      />

      <section className="metrics-grid overtime-metrics-grid" aria-label="Overtime summary">
        <article className="metric-card"><span>Pending items</span><strong>{result.metrics.pendingItems}</strong></article>
        <article className="metric-card"><span>Approved items</span><strong>{result.metrics.approvedItems}</strong></article>
        <article className="metric-card"><span>Rejected items</span><strong>{result.metrics.rejectedItems}</strong></article>
        <article className="metric-card"><span>Superseded items</span><strong>{result.metrics.supersededItems}</strong></article>
        <article className="metric-card"><span>Total detected</span><strong>{formatAttendanceMinutes(result.metrics.totalDetectedMinutes)}</strong></article>
        <article className="metric-card"><span>Active approved</span><strong>{formatAttendanceMinutes(result.metrics.totalActiveApprovedMinutes)}</strong></article>
      </section>

      <section className="card">
        <form className="toolbar overtime-filter-toolbar" method="get">
          <input className="field" type="date" name="date_from" defaultValue={dateFrom} aria-label="From date" />
          <input className="field" type="date" name="date_to" defaultValue={dateTo} max={companyDateAt()} aria-label="To date" />
          <select className="field" name="employee" defaultValue={employee} aria-label="Filter by employee">
            <option value="">All employees</option>
            {employees.map((item) => <option key={item.id} value={item.id}>{item.employee_number} · {item.first_name} {item.last_name}</option>)}
          </select>
          <select className="field" name="department" defaultValue={department} aria-label="Filter by department">
            <option value="">All departments</option>
            {options.departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select className="field" name="segment_type" defaultValue={segmentType} aria-label="Filter by segment">
            <option value="">All segment types</option>
            <option value="pre_shift">Pre-shift</option><option value="post_shift">Post-shift</option>
            <option value="rest_day">Rest-day overtime</option><option value="holiday_work">Holiday work</option>
          </select>
          <select className="field" name="holiday_type" defaultValue={holidayType} aria-label="Filter by holiday type">
            <option value="">All holiday types</option>
            <option value="regular_holiday">Regular Holiday</option>
            <option value="special_non_working_holiday">Special Non-Working Holiday</option>
            <option value="company_holiday">Company Holiday</option>
          </select>
          <select className="field" name="status" defaultValue={status} aria-label="Filter by status">
            <option value="">All statuses</option><option value="pending">Pending</option>
            <option value="approved">Approved</option><option value="rejected">Rejected</option>
            <option value="superseded">Superseded</option>
          </select>
          <button className="btn" type="submit">Apply filters</button>
          <Link className="btn" href="/admin/overtime">Clear</Link>
        </form>

        <OvertimeApprovalTable items={result.items} />

        <nav className="pagination" aria-label="Overtime approval pages">
          <Link aria-disabled={result.page <= 1} className={`btn${result.page <= 1 ? " disabled" : ""}`} href={pageHref(filters, Math.max(1, result.page - 1))}>Previous</Link>
          <span>Page {result.page} of {result.totalPages} · {result.total} items</span>
          <Link aria-disabled={result.page >= result.totalPages} className={`btn${result.page >= result.totalPages ? " disabled" : ""}`} href={pageHref(filters, Math.min(result.totalPages, result.page + 1))}>Next</Link>
        </nav>
      </section>
    </>
  );
}
