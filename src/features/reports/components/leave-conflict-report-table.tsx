import { StatusBadge } from "@/components/status-badge";
import { formatCompanyDate, formatCompanyDateTime } from "@/features/attendance/time";
import type { LeaveConflictReportRow, PaginatedReport } from "../types";

function label(value: string | null): string {
  return value ? value.replaceAll("_", " ") : "—";
}

export function LeaveConflictReportTable({ result }: { result: PaginatedReport<LeaveConflictReportRow> }) {
  if (result.rows.length === 0) {
    return <div className="card empty-state">No leave-attendance conflicts were found for the selected filters.</div>;
  }
  return (
    <section className="card">
      <h2 className="card-title">Leave conflicts</h2>
      <div className="report-table-wrap">
        <table className="report-table">
          <thead><tr><th>Date / employee</th><th>Leave type</th><th>Conflict</th><th>Status</th><th>Attendance status</th><th>Balance action</th><th>Created</th></tr></thead>
          <tbody>{result.rows.map((row) => (
            <tr key={row.conflict_id}>
              <td><strong>{formatCompanyDate(row.leave_date)}</strong><span className="muted table-subtext">{row.employee_number} · {row.employee_name}</span><span className="muted table-subtext">{row.department_name ?? "No department"}</span></td>
              <td>{row.leave_type_name}</td>
              <td>{label(row.conflict_type)}</td>
              <td><StatusBadge value={row.conflict_status} /></td>
              <td>{row.attendance_status ? <StatusBadge value={row.attendance_status} /> : "—"}</td>
              <td>{label(row.balance_action)}</td>
              <td>{formatCompanyDateTime(row.created_at)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}
