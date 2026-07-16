import { formatReportDuration } from "../formatters";
import type { ReportMode, ReportSummaryMetrics } from "../types";

function Metric({ label, value }: { label: string; value: string | number }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong></article>;
}

export function SummaryCards({ mode, metrics }: { mode: ReportMode; metrics: ReportSummaryMetrics }) {
  return (
    <section className="report-summary-grid" aria-label="Attendance report summary">
      <Metric label="Employee-day records" value={metrics.employee_day_records} />
      <Metric label="Scheduled days" value={metrics.scheduled_days} />
      <Metric label="Present days" value={metrics.present_days} />
      <Metric label="Absent days" value={metrics.absent_days} />
      <Metric label="Holiday days" value={metrics.holiday_days} />
      <Metric label="Paid leave days" value={metrics.paid_leave_days} />
      <Metric label="Unpaid leave days" value={metrics.unpaid_leave_days} />
      <Metric label="Missing clock-outs" value={metrics.missing_clock_out_days} />
      <Metric label="Unscheduled attendance" value={metrics.unscheduled_attendance_days} />
      <Metric label="Worked" value={formatReportDuration(metrics.worked_minutes)} />
      <Metric label="Late" value={formatReportDuration(metrics.late_minutes)} />
      <Metric label="Undertime" value={formatReportDuration(metrics.undertime_minutes)} />
      <Metric label="Approved overtime" value={formatReportDuration(metrics.approved_overtime_minutes)} />
      {mode === "operational" && (
        <>
          <Metric label="Finalized employee-days" value={metrics.finalized_employee_day_records} />
          <Metric label="Provisional employee-days" value={metrics.provisional_employee_day_records} />
          <Metric label="Finalized worked" value={formatReportDuration(metrics.finalized_worked_minutes)} />
          <Metric label="Provisional worked" value={formatReportDuration(metrics.provisional_worked_minutes)} />
        </>
      )}
    </section>
  );
}
