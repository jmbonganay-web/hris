import Link from "next/link";
import type { PayrollScheduleSummary } from "@/features/payroll/types";
import { formatPayrollDate, payrollScheduleTypeLabel } from "@/features/payroll/presentation";
export function PayrollScheduleList({ schedules }: { schedules: PayrollScheduleSummary[] }) {
  if (!schedules.length) return <div className="card empty">No payroll schedules have been created.</div>;
  return <div className="card table-wrap"><table><thead><tr><th>Name</th><th>Frequency</th><th>Currency</th><th>Next period</th><th>Assigned</th><th>Status</th></tr></thead><tbody>{schedules.map((schedule) => <tr key={schedule.id}><td><Link className="table-link" href={`/payroll/schedules/${schedule.id}`}>{schedule.name}</Link><span className="table-subtext">{schedule.code}</span></td><td>{payrollScheduleTypeLabel(schedule.scheduleType)}</td><td>{schedule.currencyCode}</td><td>{schedule.nextPeriod ? `${formatPayrollDate(schedule.nextPeriod.periodStart)} – ${formatPayrollDate(schedule.nextPeriod.periodEnd)}` : "Not generated"}</td><td>{schedule.assignedEmployeeCount}</td><td><span className={`badge ${schedule.isActive ? "success" : "info"}`}>{schedule.isActive ? "Active" : "Inactive"}</span></td></tr>)}</tbody></table></div>;
}
