"use client";
import { useActionState } from "react";
import {
  approveCompensationAction,
  approveScheduleAssignmentAction,
  rejectCompensationAction,
  rejectScheduleAssignmentAction,
} from "@/app/(dashboard)/payroll/approvals/actions";
import type {
  PayrollActionState,
  PayrollApprovalAssignmentItem,
  PayrollApprovalCompensationItem,
} from "@/features/payroll/types";
import { compensationTypeLabel, formatPayrollDate, formatPayrollMoney, payrollScheduleTypeLabel } from "@/features/payroll/presentation";

const initial: PayrollActionState = {};

type Props = { item: PayrollApprovalCompensationItem | PayrollApprovalAssignmentItem };

function ActionMessages({ state }: { state: PayrollActionState }) {
  return <>{state.error ? <p className="form-error" role="alert">{state.error}</p> : null}{state.success ? <p className="form-success" role="status">{state.success}</p> : null}</>;
}

export function PayrollApprovalCard({ item }: Props) {
  const compensation = item.kind === "compensation";
  const [approveState, approveAction, approvePending] = useActionState(
    async (_: PayrollActionState, data: FormData) => compensation ? approveCompensationAction(data) : approveScheduleAssignmentAction(data),
    initial,
  );
  const [rejectState, rejectAction, rejectPending] = useActionState(
    async (_: PayrollActionState, data: FormData) => compensation ? rejectCompensationAction(data) : rejectScheduleAssignmentAction(data),
    initial,
  );

  const proposed = compensation ? item.proposedRecord : item.proposedAssignment;
  return <article className="card payroll-approval-card content-stack"><div className="card-header-row"><div><h3>{item.employee.fullName}</h3><p className="muted">{item.employee.employeeNumber}</p></div><span className="badge warning">Pending approval</span></div>{compensation ? <div className="payroll-approval-comparison"><div><span>Current</span><strong>{item.currentRecord ? formatPayrollMoney(item.currentRecord.monthlySalary ?? item.currentRecord.hourlyRate ?? 0, item.currentRecord.currencyCode) : "Not configured"}</strong>{item.currentRecord ? <small>{compensationTypeLabel(item.currentRecord.compensationType)}</small> : null}</div><div><span>Proposed</span><strong>{formatPayrollMoney(item.proposedRecord.monthlySalary ?? item.proposedRecord.hourlyRate ?? 0, item.proposedRecord.currencyCode)}</strong><small>{compensationTypeLabel(item.proposedRecord.compensationType)}</small></div></div> : <div className="payroll-approval-comparison"><div><span>Current</span><strong>{item.currentAssignment?.payrollScheduleName ?? "Not assigned"}</strong>{item.currentAssignment ? <small>{payrollScheduleTypeLabel(item.currentAssignment.payrollScheduleType)}</small> : null}</div><div><span>Proposed</span><strong>{item.proposedAssignment.payrollScheduleName}</strong><small>{payrollScheduleTypeLabel(item.proposedAssignment.payrollScheduleType)}</small></div></div>}<dl className="detail-list"><div><dt>Effective date</dt><dd>{formatPayrollDate(proposed.effectiveFrom)}</dd></div><div><dt>Affected periods</dt><dd>{item.affectedPeriodCount}</dd></div>{proposed.changeReason ? <div className="detail-span"><dt>Private HR reason</dt><dd>{proposed.changeReason}</dd></div> : null}{item.kind === "schedule_assignment" && item.proposedAssignment.overrideReason ? <div className="detail-span"><dt>Private override reason</dt><dd>{item.proposedAssignment.overrideReason}</dd></div> : null}</dl><form action={approveAction} className="content-stack"><input type="hidden" name="requestId" value={item.id}/><input type="hidden" name="expectedVersion" value={proposed.version}/><input type="hidden" name="employeeId" value={item.employee.id}/>{compensation ? <><input type="hidden" name="isBackdated" value={String(item.proposedRecord.isBackdated)}/>{item.proposedRecord.isBackdated ? <label className="checkbox-row"><input type="checkbox" name="confirmBackdated" value="yes" required/>Confirm backdated compensation approval</label> : null}</> : <><input type="hidden" name="midPeriodConflict" value={String(item.midPeriodConflict)}/>{item.midPeriodConflict ? <label className="checkbox-row"><input type="checkbox" name="confirmMidPeriod" value="yes" required/>Confirm mid-period schedule override</label> : null}</>}<button className="btn primary" disabled={approvePending}>{approvePending ? "Approving…" : "Approve"}</button><ActionMessages state={approveState}/></form><form action={rejectAction} className="form-grid one-column"><input type="hidden" name="requestId" value={item.id}/><input type="hidden" name="expectedVersion" value={proposed.version}/><input type="hidden" name="employeeId" value={item.employee.id}/><label>Rejection reason<textarea className="field" name="reason" required maxLength={1000}/></label><button className="btn danger-outline" disabled={rejectPending}>{rejectPending ? "Rejecting…" : "Reject request"}</button><ActionMessages state={rejectState}/></form></article>;
}
