import Link from "next/link";
import { formatAttendanceMinutes } from "@/features/attendance/calculations/presentation";
import { formatCompanyDate, formatCompanyTime } from "@/features/attendance/time";
import type { AttendanceRecord } from "@/features/attendance/types";
import { AttendanceStatus } from "./attendance-status";
import { CalculationStatus } from "./calculation-status";

function employeeName(record: AttendanceRecord) {
  const employee = record.employee;
  return employee ? `${employee.first_name} ${employee.last_name}`.trim() : "Unknown employee";
}

export function AdminAttendanceTable({ records }: { records: AttendanceRecord[] }) {
  if (records.length === 0) return <div className="empty">No attendance records match these filters.</div>;
  return (
    <div>
      <div className="table-wrap organization-table-desktop">
        <table>
          <thead><tr><th>Employee</th><th>Date</th><th>Clock in</th><th>Clock out</th><th>Worked</th><th>Late</th><th>Undertime</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{records.map((record) => <tr key={record.id}>
            <td><strong>{employeeName(record)}</strong><div className="muted">{record.employee?.employee_number ?? "—"}</div></td>
            <td>{formatCompanyDate(record.attendance_date)}</td>
            <td>{formatCompanyTime(record.clock_in_at)}</td><td>{formatCompanyTime(record.clock_out_at)}</td>
            <td>{formatAttendanceMinutes(record.calculation?.worked_minutes ?? null)}</td>
            <td>{formatAttendanceMinutes(record.calculation?.late_minutes ?? null)}</td>
            <td>{formatAttendanceMinutes(record.calculation?.undertime_minutes ?? null)}</td>
            <td>{record.calculation ? <CalculationStatus calculation={record.calculation} compact /> : <AttendanceStatus status={record.effective_status} corrected={record.is_corrected} />}</td>
            <td><div className="header-actions"><Link className="table-link" href={`/admin/attendance/${record.employee_id}`}>View</Link><Link className="table-link" href={`/admin/attendance/${record.employee_id}/${record.attendance_date}/calculation`}>View calculation</Link>{!record.is_calculation_only && <Link className="table-link" href={`/admin/attendance/${record.employee_id}/records/${record.id}/edit`}>Edit</Link>}</div></td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="organization-card-list">{records.map((record) => <article className="organization-list-card" key={record.id}>
        <div><strong>{employeeName(record)}</strong><span className="muted">{record.employee?.employee_number ?? "—"}</span></div>
        {record.calculation ? <CalculationStatus calculation={record.calculation} /> : <AttendanceStatus status={record.effective_status} corrected={record.is_corrected} />}
        <dl><div><dt>Date</dt><dd>{formatCompanyDate(record.attendance_date)}</dd></div><div><dt>Clock in</dt><dd>{formatCompanyTime(record.clock_in_at)}</dd></div><div><dt>Clock out</dt><dd>{formatCompanyTime(record.clock_out_at)}</dd></div><div><dt>Worked</dt><dd>{formatAttendanceMinutes(record.calculation?.worked_minutes ?? null)}</dd></div><div><dt>Late</dt><dd>{formatAttendanceMinutes(record.calculation?.late_minutes ?? null)}</dd></div><div><dt>Undertime</dt><dd>{formatAttendanceMinutes(record.calculation?.undertime_minutes ?? null)}</dd></div></dl>
        <div className="header-actions"><Link className="btn" href={`/admin/attendance/${record.employee_id}`}>View</Link><Link className="btn" href={`/admin/attendance/${record.employee_id}/${record.attendance_date}/calculation`}>Calculation</Link>{!record.is_calculation_only && <Link className="btn" href={`/admin/attendance/${record.employee_id}/records/${record.id}/edit`}>Edit</Link>}</div>
      </article>)}</div>
    </div>
  );
}
