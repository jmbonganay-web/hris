import { StatusBadge } from "@/components/status-badge";
import { formatCompanyDate, formatCompanyTime } from "@/features/attendance/time";
import type { AttendanceExceptionReportRow, PaginatedReport } from "../types";

function humanize(value: string) {
  return value.replaceAll("_", " ");
}

export function ExceptionsTable({ result }: { result: PaginatedReport<AttendanceExceptionReportRow> }) {
  if (result.rows.length === 0) {
    return <div className="card empty-state">No attendance exceptions were found for the selected filters.</div>;
  }

  return (
    <section className="card">
      <h2 className="card-title">Attendance exceptions</h2>
      <div className="report-table-wrap">
        <table className="report-table">
          <thead>
            <tr>
              <th>Date / employee</th>
              <th>Exception</th>
              <th>Attendance status</th>
              <th>Clock activity</th>
              <th>Worked</th>
              <th>Late / undertime</th>
              <th>Context</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={`${row.attendance_calculation_revision_id}:${row.exception_type}`}>
                <td>
                  <strong>{formatCompanyDate(row.attendance_date)}</strong>
                  <span className="muted table-subtext">{row.employee_number} · {row.employee_name}</span>
                  <span className="muted table-subtext">{row.department_name ?? "No department"} · {row.job_title_name ?? "No job title"}</span>
                </td>
                <td><StatusBadge value={row.exception_type} /></td>
                <td>
                  <StatusBadge value={row.attendance_status} />
                  <span className="muted table-subtext">{humanize(row.calculation_state)}</span>
                </td>
                <td>{formatCompanyTime(row.clock_in)}–{formatCompanyTime(row.clock_out)}</td>
                <td>{row.worked_duration || "—"}</td>
                <td>{row.late_duration || "—"} / {row.undertime_duration || "—"}</td>
                <td>
                  {row.is_corrected ? <StatusBadge value="corrected" /> : null}
                  {row.is_recalculated ? <StatusBadge value="recalculated" /> : null}
                  {!row.is_corrected && !row.is_recalculated ? "—" : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
