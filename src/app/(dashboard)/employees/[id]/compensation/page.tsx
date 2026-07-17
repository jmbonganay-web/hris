import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { CompensationHistory } from "@/components/payroll/compensation-history";
import { PayrollAuditTimeline } from "@/components/payroll/payroll-audit-timeline";
import { ScheduleAssignmentForm } from "@/components/payroll/schedule-assignment-form";
import { ScheduleAssignmentHistory } from "@/components/payroll/schedule-assignment-history";
import { PayrollStatusBadge } from "@/components/payroll/payroll-status-badge";
import { requireEmployeeProfileManager } from "@/features/employees/auth";
import { getEmployeeCompensationAdmin } from "@/features/payroll/compensation/queries";
import { compensationTypeLabel, formatPayrollDate, formatPayrollMoney, payrollScheduleTypeLabel } from "@/features/payroll/presentation";

export default async function EmployeeCompensationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireEmployeeProfileManager(id);
  let detail;
  try { detail = await getEmployeeCompensationAdmin(id); } catch { notFound(); }
  const current = detail.currentCompensation;
  const assignment = detail.currentAssignment;
  return <div className="payroll-layout"><PageHeader title={`${detail.employee.fullName} · Compensation`} description={`${detail.employee.employeeNumber} · Effective-dated compensation and payroll schedule setup.`} action={<div className="header-actions"><Link className="btn" href={`/employees/${id}`}>Employee profile</Link><Link className="btn primary" href={`/employees/${id}/compensation/new`}>New compensation</Link></div>} /><div className="payroll-summary-grid"><section className="card content-stack"><div className="card-header-row"><div><h2>Current approved compensation</h2><p className="muted">Effective on {formatPayrollDate(detail.companyDate)}</p></div>{current ? <PayrollStatusBadge status={current.status}/> : null}</div>{current ? <dl className="detail-list"><div><dt>Type</dt><dd>{compensationTypeLabel(current.compensationType)}</dd></div><div><dt>Rate</dt><dd>{formatPayrollMoney(current.monthlySalary ?? current.hourlyRate ?? 0, current.currencyCode)}</dd></div><div><dt>Standard day</dt><dd>{current.standardHoursPerDay} hours</dd></div><div><dt>Standard week</dt><dd>{current.standardHoursPerWeek} hours</dd></div><div><dt>Effective from</dt><dd>{formatPayrollDate(current.effectiveFrom)}</dd></div></dl> : <div className="empty">No current approved compensation.</div>}</section><section className="card content-stack"><div className="card-header-row"><div><h2>Current payroll schedule</h2><p className="muted">Current effective assignment</p></div>{assignment ? <PayrollStatusBadge status={assignment.status}/> : null}</div>{assignment ? <dl className="detail-list"><div><dt>Schedule</dt><dd>{assignment.payrollScheduleName}</dd></div><div><dt>Frequency</dt><dd>{payrollScheduleTypeLabel(assignment.payrollScheduleType)}</dd></div><div><dt>Effective from</dt><dd>{formatPayrollDate(assignment.effectiveFrom)}</dd></div></dl> : <div className="empty">No current payroll schedule assignment.</div>}</section></div><ScheduleAssignmentForm employeeId={id} schedules={detail.activeSchedules} suggestedEffectiveDate={detail.suggestedNextEffectiveDate}/><CompensationHistory employeeId={id} title="Future approved changes" records={detail.futureCompensation}/><CompensationHistory employeeId={id} title="Draft and pending compensation requests" records={detail.requests} editable/><CompensationHistory employeeId={id} title="Approved compensation history" records={detail.compensationHistory}/><ScheduleAssignmentHistory employeeId={id} title="Schedule assignment requests" assignments={detail.assignmentRequests} editable/><ScheduleAssignmentHistory employeeId={id} title="Schedule assignment history" assignments={detail.assignmentHistory}/><PayrollAuditTimeline events={detail.auditEvents}/></div>;
}
