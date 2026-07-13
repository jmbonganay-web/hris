import Link from "next/link";
import { AttendanceClockCard } from "@/components/attendance/attendance-clock-card";
import { AttendanceHistory } from "@/components/attendance/attendance-history";
import { PageHeader } from "@/components/page-header";
import { requireAttendanceEmployee } from "@/features/attendance/auth";
import {
  getOwnAttendanceHistory,
  getTodayAttendanceContext,
} from "@/features/attendance/queries";

function value(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] : input ?? "";
}

function pageHref(filters: Record<string, string>, page: number) {
  const search = new URLSearchParams();
  for (const [key, item] of Object.entries(filters)) if (item) search.set(key, item);
  if (page > 1) search.set("page", String(page));
  return `/attendance${search.size ? `?${search}` : ""}`;
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const status = value(query.status);
  const fromDate = value(query.from);
  const toDate = value(query.to);
  const page = Math.max(1, Number(value(query.page) || "1") || 1);
  const success = value(query.success);
  const { employee } = await requireAttendanceEmployee();

  const [context, history] = await Promise.all([
    getTodayAttendanceContext(employee),
    getOwnAttendanceHistory({ employeeId: employee.id, status, fromDate, toDate, page }),
  ]);

  const filters = { status, from: fromDate, to: toDate };

  return (
    <>
      <PageHeader
        title="My Attendance"
        description="Clock in, clock out, review your attendance, and request corrections."
        action={<Link className="btn" href="/attendance/corrections">Correction requests</Link>}
      />

      {success === "clocked_in" && <p className="form-success">You clocked in successfully.</p>}
      {success === "clocked_out" && <p className="form-success">You clocked out successfully.</p>}

      <AttendanceClockCard context={context} />

      <section className="card attendance-history-section">
        <div className="section-heading-row">
          <div><h2 className="card-title">Attendance history</h2><p className="muted">Times are shown in Asia/Manila.</p></div>
          <Link className="btn" href={`/attendance/corrections/new?date=${context.companyDate}`}>Request missing day</Link>
        </div>
        <form className="toolbar attendance-filter-toolbar" method="get">
          <select className="field" name="status" defaultValue={status}>
            <option value="">All statuses</option>
            <option value="clocked_in">Clocked in</option>
            <option value="completed">Completed</option>
            <option value="missing_clock_out">Missing clock-out</option>
            <option value="corrected">Corrected</option>
          </select>
          <input className="field" type="date" name="from" defaultValue={fromDate} aria-label="From date" />
          <input className="field" type="date" name="to" defaultValue={toDate} aria-label="To date" />
          <button className="btn" type="submit">Apply filters</button>
          {(status || fromDate || toDate) && <Link className="btn" href="/attendance">Clear</Link>}
        </form>
        <AttendanceHistory records={history.records} />
        <nav className="pagination" aria-label="Attendance pages">
          <Link aria-disabled={history.page <= 1} className={`btn${history.page <= 1 ? " disabled" : ""}`} href={pageHref(filters, Math.max(1, history.page - 1))}>Previous</Link>
          <span>Page {history.page} of {history.totalPages} · {history.total} records</span>
          <Link aria-disabled={history.page >= history.totalPages} className={`btn${history.page >= history.totalPages ? " disabled" : ""}`} href={pageHref(filters, Math.min(history.totalPages, history.page + 1))}>Next</Link>
        </nav>
      </section>
    </>
  );
}
