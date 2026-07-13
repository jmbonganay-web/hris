import Link from "next/link";
import { formatCompanyDate, formatCompanyTime } from "@/features/attendance/time";
import type { AttendanceRecord } from "@/features/attendance/types";
import { AttendanceStatus } from "./attendance-status";

export function AttendanceHistory({ records }: { records: AttendanceRecord[] }) {
  if (records.length === 0) {
    return <div className="empty">No attendance records match these filters.</div>;
  }

  return (
    <div className="attendance-responsive-list">
      <div className="table-wrap attendance-desktop-table">
        <table>
          <thead><tr><th>Date</th><th>Clock in</th><th>Clock out</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id}>
                <td>{formatCompanyDate(record.attendance_date)}</td>
                <td>{formatCompanyTime(record.clock_in_at)}</td>
                <td>{formatCompanyTime(record.clock_out_at)}</td>
                <td><AttendanceStatus status={record.effective_status} corrected={record.is_corrected} /></td>
                <td>
                  <Link className="table-link" href={`/attendance/corrections/new?record=${record.id}`}>
                    Request correction
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="attendance-mobile-cards">
        {records.map((record) => (
          <article className="attendance-record-card" key={record.id}>
            <div className="attendance-record-card-heading">
              <strong>{formatCompanyDate(record.attendance_date)}</strong>
              <AttendanceStatus status={record.effective_status} corrected={record.is_corrected} />
            </div>
            <dl>
              <div><dt>Clock in</dt><dd>{formatCompanyTime(record.clock_in_at)}</dd></div>
              <div><dt>Clock out</dt><dd>{formatCompanyTime(record.clock_out_at)}</dd></div>
            </dl>
            <Link className="btn" href={`/attendance/corrections/new?record=${record.id}`}>
              Request correction
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
