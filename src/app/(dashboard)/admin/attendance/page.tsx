import Link from "next/link";
import { AdminAttendanceTable } from "@/components/attendance/admin-attendance-table";
import { PageHeader } from "@/components/page-header";
import { requireAttendanceAdmin } from "@/features/attendance/auth";
import { getAdminAttendance } from "@/features/attendance/queries";
import { companyDateAt } from "@/features/attendance/time";
import { getEmployeeOptions } from "@/features/employees/queries";

function value(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] : input ?? "";
}

function pageHref(filters: Record<string, string>, page: number) {
  const search = new URLSearchParams();
  for (const [key, item] of Object.entries(filters)) if (item) search.set(key, item);
  if (page > 1) search.set("page", String(page));
  return `/admin/attendance${search.size ? `?${search}` : ""}`;
}

export default async function AdminAttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAttendanceAdmin();
  const raw = await searchParams;
  const query = value(raw.query);
  const department = value(raw.department);
  const status = value(raw.status);
  const calculationStatus = value(raw.calculation_status);
  const late = value(raw.late);
  const undertime = value(raw.undertime);
  const calculationState = value(raw.calculation_state);
  const correctedCalculation = value(raw.corrected_calculation);
  const recalculated = value(raw.recalculated);
  const hasDateFilter = Object.prototype.hasOwnProperty.call(raw, "date");
  const date = hasDateFilter ? value(raw.date) : companyDateAt();
  const page = Math.max(1, Number(value(raw.page) || "1") || 1);

  const [options, result] = await Promise.all([
    getEmployeeOptions(),
    getAdminAttendance({
      query, department, status, date, page,
      calculationBaseStatus: calculationStatus || undefined,
      isLate: late ? late === "true" : undefined,
      isUndertime: undertime ? undertime === "true" : undefined,
      isProvisional: calculationState ? calculationState === "provisional" : undefined,
      isCorrectedCalculation: correctedCalculation ? correctedCalculation === "true" : undefined,
      isRecalculated: recalculated ? recalculated === "true" : undefined,
    }),
  ]);
  const filters = { query, department, status, date, calculation_status: calculationStatus, late, undertime, calculation_state: calculationState, corrected_calculation: correctedCalculation, recalculated };

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Review and correct employee attendance in Asia/Manila."
        action={(
          <div className="header-actions">
            <Link className="btn" href="/admin/attendance/corrections">Correction requests</Link>
            <Link className="btn" href="/admin/attendance/recalculate">Recalculate</Link>
            <Link className="btn" href="/admin/attendance/finalization">Finalization runs</Link>
            <Link className="btn primary" href="/admin/attendance/new">Create attendance record</Link>
          </div>
        )}
      />

      <section className="card">
        <form className="toolbar attendance-filter-toolbar" method="get">
          <input
            className="field employee-search"
            name="query"
            defaultValue={query}
            placeholder="Search employee name or ID"
            aria-label="Search attendance employees"
          />
          <select className="field" name="department" defaultValue={department} aria-label="Filter by department">
            <option value="">All departments</option>
            {options.departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select className="field" name="status" defaultValue={status} aria-label="Filter by attendance status">
            <option value="">All statuses</option>
            <option value="clocked_in">Clocked in</option>
            <option value="completed">Completed</option>
            <option value="missing_clock_out">Missing clock-out</option>
            <option value="corrected">Corrected</option>
          </select>
          <select className="field" name="calculation_status" defaultValue={calculationStatus} aria-label="Calculation base status"><option value="">All calculation statuses</option><option value="present">Present</option><option value="absent">Absent</option><option value="missing_clock_out">Missing clock-out</option><option value="rest_day_worked">Rest day worked</option><option value="unscheduled_attendance">Unscheduled attendance</option></select>
          <select className="field" name="late" defaultValue={late}><option value="">Late: any</option><option value="true">Late</option><option value="false">Not late</option></select>
          <select className="field" name="undertime" defaultValue={undertime}><option value="">Undertime: any</option><option value="true">Undertime</option><option value="false">No undertime</option></select>
          <select className="field" name="calculation_state" defaultValue={calculationState}><option value="">All calculation states</option><option value="provisional">Provisional</option><option value="finalized">Finalized</option></select>
          <select className="field" name="corrected_calculation" defaultValue={correctedCalculation}><option value="">Corrected: any</option><option value="true">Corrected</option><option value="false">Not corrected</option></select>
          <select className="field" name="recalculated" defaultValue={recalculated}><option value="">Recalculated: any</option><option value="true">Recalculated</option><option value="false">Not recalculated</option></select>
          <input className="field" type="date" name="date" defaultValue={date} aria-label="Attendance date" />
          <button className="btn" type="submit">Apply filters</button>
          {(query || department || status || date) && <Link className="btn" href="/admin/attendance?date=">Clear</Link>}
        </form>

        <AdminAttendanceTable records={result.records} />

        <nav className="pagination" aria-label="Admin attendance pages">
          <Link
            aria-disabled={result.page <= 1}
            className={`btn${result.page <= 1 ? " disabled" : ""}`}
            href={pageHref(filters, Math.max(1, result.page - 1))}
          >Previous</Link>
          <span>Page {result.page} of {result.totalPages} · {result.total} records</span>
          <Link
            aria-disabled={result.page >= result.totalPages}
            className={`btn${result.page >= result.totalPages ? " disabled" : ""}`}
            href={pageHref(filters, Math.min(result.totalPages, result.page + 1))}
          >Next</Link>
        </nav>
      </section>
    </>
  );
}
