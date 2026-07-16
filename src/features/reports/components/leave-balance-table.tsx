import { formatCompanyDate } from "@/features/attendance/time";
import type { LeaveBalanceReportRow, PaginatedReport } from "../types";

function units(value: number): string {
  return value.toFixed(1);
}

export function LeaveBalanceTable({ result }: { result: PaginatedReport<LeaveBalanceReportRow> }) {
  if (result.rows.length === 0) {
    return <div className="card empty-state">No leave balances were found for the selected filters.</div>;
  }
  return (
    <section className="card">
      <h2 className="card-title">Leave balances</h2>
      <div className="report-table-wrap">
        <table className="report-table">
          <thead><tr><th>Employee</th><th>Leave type</th><th>Year</th><th>Allocated</th><th>Carryover</th><th>Adjustments</th><th>Used</th><th>Pending</th><th>Available</th><th>Carryover expires</th></tr></thead>
          <tbody>{result.rows.map((row) => (
            <tr key={`${row.employee_id}:${row.leave_type_id}:${row.leave_year}`}>
              <td><strong>{row.employee_number} · {row.employee_name}</strong><span className="muted table-subtext">{row.department_name ?? "No department"}</span></td>
              <td>{row.leave_type_name}</td>
              <td>{row.leave_year}</td>
              <td>{units(row.allocated_units)}</td>
              <td>{units(row.carryover_units)}</td>
              <td>{units(row.adjustment_units)}</td>
              <td>{units(row.used_units)}</td>
              <td>{units(row.pending_units)}</td>
              <td><strong>{units(row.available_units)}</strong></td>
              <td>{row.carryover_expires ? formatCompanyDate(row.carryover_expires) : "—"}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}
