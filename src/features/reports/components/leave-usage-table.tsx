import { StatusBadge } from "@/components/status-badge";
import { formatCompanyDate, formatCompanyDateTime } from "@/features/attendance/time";
import type { LeaveUsageReportRow, PaginatedReport } from "../types";

function label(value: string): string {
  return value.replaceAll("_", " ");
}

export function LeaveUsageTable({ result }: { result: PaginatedReport<LeaveUsageReportRow> }) {
  if (result.rows.length === 0) {
    return <div className="card empty-state">No leave requests were found for the selected filters.</div>;
  }
  return (
    <section className="card">
      <h2 className="card-title">Leave usage</h2>
      <div className="report-table-wrap">
        <table className="report-table">
          <thead><tr><th>Employee</th><th>Leave type</th><th>Date range</th><th>Duration</th><th>Status</th><th>Requested</th><th>Chargeable</th><th>Submitted</th><th>Reviewed</th></tr></thead>
          <tbody>{result.rows.map((row) => (
            <tr key={row.request_group_id}>
              <td><strong>{row.employee_number} · {row.employee_name}</strong><span className="muted table-subtext">{row.department_name ?? "No department"}</span></td>
              <td>{row.leave_type_name}<span className="muted table-subtext">{label(row.paid_state)}</span></td>
              <td>{formatCompanyDate(row.start_date)}–{formatCompanyDate(row.end_date)}</td>
              <td>{label(row.duration_mode)}</td>
              <td><StatusBadge value={row.status} /></td>
              <td>{row.requested_units.toFixed(1)}</td>
              <td>{row.chargeable_units.toFixed(1)}</td>
              <td>{row.submitted_at ? formatCompanyDateTime(row.submitted_at) : "—"}</td>
              <td>{row.reviewed_at ? formatCompanyDateTime(row.reviewed_at) : "—"}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}
