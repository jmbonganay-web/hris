import { StatusBadge } from "@/components/status-badge";
import { formatCompanyDate, formatCompanyDateTime, formatCompanyTime } from "@/features/attendance/time";
import type { OvertimeHolidayReportRow, PaginatedReport } from "../types";

function humanize(value: string) {
  return value.replaceAll("_", " ");
}

export function OvertimeHolidayTable({ result }: { result: PaginatedReport<OvertimeHolidayReportRow> }) {
  if (result.rows.length === 0) {
    return <div className="card empty-state">No overtime or holiday-work records were found for the selected filters.</div>;
  }

  return (
    <section className="card">
      <h2 className="card-title">Overtime &amp; holiday work</h2>
      <div className="report-table-wrap">
        <table className="report-table">
          <thead>
            <tr>
              <th>Date / employee</th>
              <th>Segment</th>
              <th>Detected period</th>
              <th>Detected</th>
              <th>Approved</th>
              <th>Approval</th>
              <th>Holiday</th>
              <th>Lifecycle</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={row.detection_revision_id}>
                <td>
                  <strong>{formatCompanyDate(row.attendance_date)}</strong>
                  <span className="muted table-subtext">{row.employee_number} · {row.employee_name}</span>
                  <span className="muted table-subtext">{row.department_name ?? "No department"}</span>
                </td>
                <td><StatusBadge value={row.segment_type} /></td>
                <td>{formatCompanyTime(row.detected_start)}–{formatCompanyTime(row.detected_end)}</td>
                <td>{row.detected_duration}</td>
                <td>{row.approved_duration}</td>
                <td>
                  {row.approval_status ? <StatusBadge value={row.approval_status} /> : <span className="muted">No approval item</span>}
                  {row.reviewed_at ? <span className="muted table-subtext">Reviewed {formatCompanyDateTime(row.reviewed_at)}</span> : null}
                </td>
                <td>
                  {row.holiday_name ? <><strong>{row.holiday_name}</strong><span className="muted table-subtext">{row.holiday_type ? humanize(row.holiday_type) : ""}</span></> : "—"}
                </td>
                <td>
                  <StatusBadge value={row.is_active_detection ? "active" : "inactive"} />
                  {row.is_superseded ? <StatusBadge value="superseded" /> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
