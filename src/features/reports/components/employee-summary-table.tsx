import { StatusBadge } from "@/components/status-badge";
import type { EmployeeAttendanceSummaryRow, PaginatedReport } from "../types";

export function EmployeeSummaryTable({ result }: { result: PaginatedReport<EmployeeAttendanceSummaryRow> }) {
  if (result.rows.length === 0) return <div className="card empty-state">No reportable attendance data was found for the selected filters.</div>;
  return (
    <section className="card">
      <h2 className="card-title">Employee summary</h2>
      <div className="report-table-wrap">
        <table className="report-table">
          <thead><tr><th>Employee</th><th>Status</th><th>Days</th><th>Worked</th><th>Late / undertime</th><th>Approved overtime</th><th>Holiday work</th></tr></thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={row.employee_id}>
                <td><strong>{row.employee_number} · {row.employee_name}</strong><span className="muted table-subtext">{row.department_name ?? "No department"} · {row.job_title_name ?? "No job title"}</span>{row.employee_day_records === 0 && <span className="muted table-subtext">No reportable records</span>}</td>
                <td><StatusBadge value={row.employment_status} /></td>
                <td>{row.employee_day_records} records<br /><span className="muted">{row.present_days} present · {row.absent_days} absent · {row.holiday_days} holiday · {row.paid_leave_days} paid leave · {row.unpaid_leave_days} unpaid leave</span></td>
                <td>{row.worked_duration}</td>
                <td>{row.late_duration} / {row.undertime_duration}</td>
                <td>{row.total_approved_overtime_duration}<span className="muted table-subtext">Pre {row.approved_pre_shift_duration} · Post {row.approved_post_shift_duration} · Rest {row.approved_rest_day_duration}</span></td>
                <td>{row.approved_holiday_work_duration}<span className="muted table-subtext">Regular {row.regular_holiday_work_duration} · Special {row.special_non_working_holiday_work_duration} · Company {row.company_holiday_work_duration}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
