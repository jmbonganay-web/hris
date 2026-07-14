import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminAttendanceTable } from "@/components/attendance/admin-attendance-table";
import { PageHeader } from "@/components/page-header";
import { requireAttendanceAdmin } from "@/features/attendance/auth";
import { getEmployeeAttendanceHistory } from "@/features/attendance/queries";
import { formatCompanyDateTime } from "@/features/attendance/time";
import { getEmployee } from "@/features/employees/queries";

function value(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] : input ?? "";
}

function pageHref(employeeId: string, page: number) {
  return `/admin/attendance/${employeeId}${page > 1 ? `?page=${page}` : ""}`;
}

export default async function AdminEmployeeAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAttendanceAdmin();
  const [{ employeeId }, raw] = await Promise.all([params, searchParams]);
  const page = Math.max(1, Number(value(raw.page) || "1") || 1);
  const success = value(raw.success);
  const [employee, history] = await Promise.all([
    getEmployee(employeeId),
    getEmployeeAttendanceHistory({ employeeId, page }),
  ]);

  if (!employee) notFound();

  const correctedRecords = history.records.filter((record) => record.is_corrected);

  return (
    <>
      <PageHeader
        title={`${employee.first_name} ${employee.last_name} attendance`}
        description={`${employee.employee_number} · ${employee.department?.name ?? "Unassigned department"}`}
        action={(
          <div className="header-actions">
            <Link className="btn" href={`/employees/${employee.id}/activity`}>View activity</Link>
            <Link className="btn primary" href={`/admin/attendance/new?employee=${employee.id}`}>Create record</Link>
          </div>
        )}
      />

      {success === "created" && <p className="form-success">Attendance record created.</p>}
      {success === "corrected" && <p className="form-success">Attendance record corrected.</p>}

      <section className="card">
        <div className="section-heading-row">
          <div><h2 className="card-title">Attendance history</h2><p className="muted">Open and missing clock-out records are listed first.</p></div>
          <Link className="btn" href="/admin/attendance">All attendance</Link>
        </div>
        <AdminAttendanceTable records={history.records} />
        <nav className="pagination" aria-label="Employee attendance pages">
          <Link
            aria-disabled={history.page <= 1}
            className={`btn${history.page <= 1 ? " disabled" : ""}`}
            href={pageHref(employee.id, Math.max(1, history.page - 1))}
          >Previous</Link>
          <span>Page {history.page} of {history.totalPages} · {history.total} records</span>
          <Link
            aria-disabled={history.page >= history.totalPages}
            className={`btn${history.page >= history.totalPages ? " disabled" : ""}`}
            href={pageHref(employee.id, Math.min(history.totalPages, history.page + 1))}
          >Next</Link>
        </nav>
      </section>

      {correctedRecords.length > 0 && (
        <section className="card">
          <h2 className="card-title">Correction metadata</h2>
          <div className="profile-section-stack">
            {correctedRecords.map((record) => (
              <article className="organization-list-card" key={record.id}>
                <strong>{record.attendance_date}</strong>
                <dl>
                  <div><dt>Corrected at</dt><dd>{formatCompanyDateTime(record.last_corrected_at)}</dd></div>
                  <div><dt>Reason</dt><dd>{record.last_correction_reason ?? "—"}</dd></div>
                </dl>
                <Link className="btn" href={`/admin/attendance/${employee.id}/records/${record.id}/edit`}>Edit record</Link>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
