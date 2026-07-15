import { formatAttendanceMinutes } from "@/features/attendance/calculations/presentation";
import { formatCompanyDate, formatCompanyDateTime } from "@/features/attendance/time";
import {
  holidayTypeLabel,
  overtimeApprovalStatusLabel,
  overtimeSegmentLabel,
} from "@/features/overtime/presentation";
import type { SafeEmployeeOvertimeItem } from "@/features/overtime/types";

export function EmployeeOvertimeHistory({
  items,
}: {
  items: SafeEmployeeOvertimeItem[];
}) {
  if (items.length === 0) {
    return <div className="empty">No overtime items match these dates.</div>;
  }

  return (
    <div className="attendance-responsive-list">
      <div className="table-wrap attendance-desktop-table">
        <table>
          <thead><tr><th>Attendance date</th><th>Segment</th><th>Holiday</th><th>Detected</th><th>Approved</th><th>Status</th><th>Approval date</th></tr></thead>
          <tbody>{items.map((item, index) => (
            <tr key={`${item.attendance_date}:${item.segment_type}:${item.created_at}:${index}`}>
              <td>{formatCompanyDate(item.attendance_date)}</td>
              <td>{overtimeSegmentLabel(item.segment_type)}</td>
              <td>{item.holiday_name ? <>{item.holiday_name}<div className="muted">{holidayTypeLabel(item.holiday_type)}</div></> : "—"}</td>
              <td>{formatAttendanceMinutes(item.detected_minutes)}</td>
              <td>{formatAttendanceMinutes(item.approved_minutes)}</td>
              <td>{!item.is_active ? "Superseded" : overtimeApprovalStatusLabel(item.status)}</td>
              <td>{formatCompanyDateTime(item.approval_date)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="attendance-mobile-cards">
        {items.map((item, index) => (
          <article className="attendance-record-card" key={`${item.attendance_date}:${item.segment_type}:${item.created_at}:${index}`}>
            <div className="attendance-record-card-heading"><strong>{formatCompanyDate(item.attendance_date)}</strong><span className="badge info">{!item.is_active ? "Superseded" : overtimeApprovalStatusLabel(item.status)}</span></div>
            <dl>
              <div><dt>Segment</dt><dd>{overtimeSegmentLabel(item.segment_type)}</dd></div>
              <div><dt>Holiday</dt><dd>{item.holiday_name ?? "—"}</dd></div>
              <div><dt>Detected</dt><dd>{formatAttendanceMinutes(item.detected_minutes)}</dd></div>
              <div><dt>Approved</dt><dd>{formatAttendanceMinutes(item.approved_minutes)}</dd></div>
              <div><dt>Approval date</dt><dd>{formatCompanyDateTime(item.approval_date)}</dd></div>
            </dl>
          </article>
        ))}
      </div>
    </div>
  );
}
