import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { formatAttendanceMinutes } from "@/features/attendance/calculations/presentation";
import { formatCompanyDate, formatCompanyTime } from "@/features/attendance/time";
import {
  holidayTypeLabel,
  overtimeApprovalStatusLabel,
  overtimeSegmentLabel,
} from "@/features/overtime/presentation";
import type { OvertimeApprovalQueueRow } from "@/features/overtime/types";

function employeeName(item: OvertimeApprovalQueueRow) {
  return `${item.employee.first_name} ${item.employee.last_name}`.trim();
}

export function OvertimeApprovalTable({
  items,
}: {
  items: OvertimeApprovalQueueRow[];
}) {
  if (items.length === 0) {
    return <div className="empty">No overtime approval items match these filters.</div>;
  }

  return (
    <div>
      <div className="table-wrap organization-table-desktop">
        <table>
          <thead>
            <tr>
              <th>Employee</th><th>Date</th><th>Segment</th><th>Holiday</th>
              <th>Detected</th><th>Approved</th><th>Status</th><th><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td><strong>{employeeName(item)}</strong><div className="muted">{item.employee.employee_number}</div></td>
                <td>{formatCompanyDate(item.attendance_date)}</td>
                <td>
                  <strong>{overtimeSegmentLabel(item.segment_type)}</strong>
                  {(item.detected_start_at || item.detected_end_at) && (
                    <div className="muted">
                      {formatCompanyTime(item.detected_start_at)}–{formatCompanyTime(item.detected_end_at)}
                    </div>
                  )}
                </td>
                <td>{item.holiday_name ? <><strong>{item.holiday_name}</strong><div className="muted">{holidayTypeLabel(item.holiday_type)}</div></> : "—"}</td>
                <td>{formatAttendanceMinutes(item.detected_minutes)}</td>
                <td>{formatAttendanceMinutes(item.approved_minutes)}</td>
                <td><StatusBadge value={overtimeApprovalStatusLabel(item.status)} /></td>
                <td><Link className="table-link" href={`/admin/overtime/${item.id}`}>View</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="organization-card-list">
        {items.map((item) => (
          <article className="organization-list-card" key={item.id}>
            <div><strong>{employeeName(item)}</strong><span className="muted">{item.employee.employee_number}</span></div>
            <StatusBadge value={overtimeApprovalStatusLabel(item.status)} />
            <dl>
              <div><dt>Date</dt><dd>{formatCompanyDate(item.attendance_date)}</dd></div>
              <div><dt>Segment</dt><dd>{overtimeSegmentLabel(item.segment_type)}</dd></div>
              <div><dt>Holiday</dt><dd>{item.holiday_name ?? "—"}</dd></div>
              <div><dt>Detected</dt><dd>{formatAttendanceMinutes(item.detected_minutes)}</dd></div>
              <div><dt>Approved</dt><dd>{formatAttendanceMinutes(item.approved_minutes)}</dd></div>
            </dl>
            <Link className="btn" href={`/admin/overtime/${item.id}`}>View item</Link>
          </article>
        ))}
      </div>
    </div>
  );
}
