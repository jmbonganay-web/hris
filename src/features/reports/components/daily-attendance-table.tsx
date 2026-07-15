import { StatusBadge } from "@/components/status-badge";
import { formatCompanyDate, formatCompanyTime } from "@/features/attendance/time";
import type { DailyAttendanceReportRow, PaginatedReport } from "../types";

function label(value: string) {
  return value.replaceAll("_", " ");
}

function OvertimeCell({ labelText, detected, approved, status }: { labelText: string; detected: number | null; approved: number | null; status: string | null }) {
  if (detected === null && approved === null && !status) return null;
  return <span><strong>{labelText}</strong> {status ? <StatusBadge value={status} /> : null}<small>{detected ?? 0}m detected · {approved ?? 0}m approved</small></span>;
}

export function DailyAttendanceTable({ result }: { result: PaginatedReport<DailyAttendanceReportRow> }) {
  if (result.rows.length === 0) return <div className="card empty-state">No reportable attendance data was found for the selected filters.</div>;
  return (
    <section className="card">
      <h2 className="card-title">Daily attendance</h2>
      <div className="report-table-wrap">
        <table className="report-table">
          <thead><tr><th>Date / employee</th><th>Status</th><th>Schedule</th><th>Clock activity</th><th>Worked</th><th>Late / undertime</th><th>Holiday</th><th>Overtime</th></tr></thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={row.attendance_calculation_revision_id}>
                <td><strong>{formatCompanyDate(row.attendance_date)}</strong><span className="muted table-subtext">{row.employee_number} · {row.employee_name}</span><span className="muted table-subtext">{row.department_name ?? "No department"}</span></td>
                <td><StatusBadge value={row.attendance_status} /><span className="muted table-subtext">{label(row.calculation_state)}</span></td>
                <td>{row.is_scheduled_day ? `${formatCompanyTime(row.scheduled_start)}–${formatCompanyTime(row.scheduled_end)}` : "Not scheduled"}</td>
                <td>{formatCompanyTime(row.clock_in)}–{formatCompanyTime(row.clock_out)}</td>
                <td>{row.worked_duration || "—"}</td>
                <td>{row.late_duration || "—"} / {row.undertime_duration || "—"}</td>
                <td>{row.is_holiday ? <><strong>{row.holiday_name ?? "Holiday"}</strong><span className="muted table-subtext">{row.holiday_type ? label(row.holiday_type) : ""}</span></> : "—"}</td>
                <td><div className="report-overtime-cells"><OvertimeCell labelText="Pre" detected={row.pre_shift_detected_minutes} approved={row.pre_shift_approved_minutes} status={row.pre_shift_status} /><OvertimeCell labelText="Post" detected={row.post_shift_detected_minutes} approved={row.post_shift_approved_minutes} status={row.post_shift_status} /><OvertimeCell labelText="Rest" detected={row.rest_day_detected_minutes} approved={row.rest_day_approved_minutes} status={row.rest_day_status} /><OvertimeCell labelText="Holiday" detected={row.holiday_work_detected_minutes} approved={row.holiday_work_approved_minutes} status={row.holiday_work_status} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
