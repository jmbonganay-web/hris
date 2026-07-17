import Link from "next/link";
import type { PayrollPeriodSummary } from "@/features/payroll/types";
import { formatPayrollDate } from "@/features/payroll/presentation";
import { PayrollStatusBadge } from "./payroll-status-badge";
export function PayrollPeriodList({ periods }: { periods: PayrollPeriodSummary[] }) {
  if (!periods.length) return <div className="card empty">No payroll periods match the selected filters.</div>;
  return <div className="card table-wrap payroll-period-list"><table><thead><tr><th>Period</th><th>Schedule</th><th>Date range</th><th>Cutoff</th><th>Payment</th><th>Status</th><th>Flags</th></tr></thead><tbody>{periods.map((period) => <tr key={period.id}><td><Link className="table-link" href={`/payroll/periods/${period.id}`}>{period.periodCode}</Link></td><td>{period.scheduleName}<span className="table-subtext">{period.scheduleCode}</span></td><td>{formatPayrollDate(period.periodStart)} – {formatPayrollDate(period.periodEnd)}</td><td>{formatPayrollDate(period.cutoffDate)}</td><td>{formatPayrollDate(period.paymentDate)}</td><td><PayrollStatusBadge status={period.status}/></td><td>{period.requiresRecalculation ? <span className="badge warning">Recalculation</span> : <span className="muted">None</span>}</td></tr>)}</tbody></table></div>;
}
