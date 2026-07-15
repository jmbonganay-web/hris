import Link from "next/link";
import { AttendanceOvertimeSummary } from "@/components/overtime/attendance-overtime-summary";
import { formatAttendanceMinutes } from "@/features/attendance/calculations/presentation";
import { formatCompanyDate, formatCompanyTime } from "@/features/attendance/time";
import { holidayTypeLabel } from "@/features/overtime/presentation";
import type { AttendanceRecord } from "@/features/attendance/types";
import { AttendanceStatus } from "./attendance-status";
import { CalculationStatus } from "./calculation-status";

function metric(value: number | null | undefined) {
  return value === undefined ? "Calculation unavailable" : formatAttendanceMinutes(value);
}

export function AttendanceHistory({ records }: { records: AttendanceRecord[] }) {
  if (records.length === 0) {
    return <div className="empty">No attendance records match these filters.</div>;
  }

  return (
    <div className="attendance-responsive-list">
      <div className="table-wrap attendance-desktop-table">
        <table>
          <thead><tr><th>Date</th><th>Schedule</th><th>Clock in</th><th>Clock out</th><th>Worked</th><th>Late</th><th>Undertime</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id}>
                <td>{formatCompanyDate(record.attendance_date)}</td>
                <td>{record.calculation?.schedule_name ?? (record.calculation ? "Unassigned" : "—")}</td>
                <td>{formatCompanyTime(record.clock_in_at)}</td>
                <td>{formatCompanyTime(record.clock_out_at)}</td>
                <td>{metric(record.calculation?.worked_minutes)}</td>
                <td>{metric(record.calculation?.late_minutes)}</td>
                <td>{metric(record.calculation?.undertime_minutes)}</td>
                <td><div className="attendance-status-stack">{record.calculation ? <CalculationStatus calculation={record.calculation} compact /> : <AttendanceStatus status={record.effective_status} corrected={record.is_corrected} />}<AttendanceOvertimeSummary items={record.overtime ?? []} compact />{record.calculation?.base_status === "holiday" && <div className="muted">Worked: 0 · No approval required</div>}{record.calculation?.is_holiday && record.calculation.actual_clock_out_at && <div className="muted">{holidayTypeLabel(record.calculation.holiday_type)} · Holiday work</div>}</div></td>
                <td><Link className="table-link" href={record.is_calculation_only ? `/attendance/corrections/new?date=${record.attendance_date}` : `/attendance/corrections/new?record=${record.id}`}>Request correction</Link></td>
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
              {record.calculation ? <CalculationStatus calculation={record.calculation} compact /> : <AttendanceStatus status={record.effective_status} corrected={record.is_corrected} />}
            </div>
            <AttendanceOvertimeSummary items={record.overtime ?? []} compact />
            {record.calculation?.base_status === "holiday" && <div className="muted">Worked: 0 · No approval required</div>}
            {record.calculation?.is_holiday && record.calculation.actual_clock_out_at && <div className="muted">{holidayTypeLabel(record.calculation.holiday_type)} · Holiday work</div>}
            <dl>
              <div><dt>Schedule</dt><dd>{record.calculation?.schedule_name ?? (record.calculation ? "Unassigned" : "—")}</dd></div>
              <div><dt>Clock in</dt><dd>{formatCompanyTime(record.clock_in_at)}</dd></div>
              <div><dt>Clock out</dt><dd>{formatCompanyTime(record.clock_out_at)}</dd></div>
              <div><dt>Worked</dt><dd>{metric(record.calculation?.worked_minutes)}</dd></div>
              <div><dt>Late</dt><dd>{metric(record.calculation?.late_minutes)}</dd></div>
              <div><dt>Undertime</dt><dd>{metric(record.calculation?.undertime_minutes)}</dd></div>
            </dl>
            <Link className="btn" href={record.is_calculation_only ? `/attendance/corrections/new?date=${record.attendance_date}` : `/attendance/corrections/new?record=${record.id}`}>Request correction</Link>
          </article>
        ))}
      </div>
    </div>
  );
}
