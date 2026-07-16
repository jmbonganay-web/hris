import Link from "next/link";
import { notFound } from "next/navigation";
import {
  cancelApprovedLeaveRequest,
  deleteHrLeaveDraftAttachment,
  reviewLeaveRequest,
  submitHrLeaveRequest,
} from "@/app/(dashboard)/admin/leave/actions";
import { CancelApprovedLeaveForm } from "@/components/leave/cancel-approved-leave-form";
import { LeaveAttachmentUploader } from "@/components/leave/leave-attachment-uploader";
import { LeaveReviewForm } from "@/components/leave/leave-review-form";
import { PageHeader } from "@/components/page-header";
import { formatCompanyDate, formatCompanyDateTime } from "@/features/attendance/time";
import { requireLeaveAdmin } from "@/features/leave/auth";
import { formatLeaveUnits, leaveClassificationLabel, leaveDurationLabel, leaveStatusLabel } from "@/features/leave/presentation";
import { getLeaveRequestDetail } from "@/features/leave/requests/queries";
import { getLeaveAttachmentDownloadUrl } from "@/features/leave/requests/storage";

function actionLabel(value: string) { return value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" "); }

export default async function AdminLeaveDetailPage({ params, searchParams }: { params: Promise<{ requestGroupId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireLeaveAdmin();
  const { requestGroupId } = await params;
  const query = await searchParams;
  let detail;
  try { detail = await getLeaveRequestDetail(requestGroupId); } catch { notFound(); }
  const success = Array.isArray(query.success) ? query.success[0] : query.success;
  const error = Array.isArray(query.error) ? query.error[0] : query.error;

  return (
    <>
      <PageHeader title={`${detail.employeeName} · ${detail.leaveTypeName}`} description={`${formatCompanyDate(detail.startDate)}${detail.endDate !== detail.startDate ? ` – ${formatCompanyDate(detail.endDate)}` : ""}`} action={<Link className="btn" href="/admin/leave">Back to queue</Link>} />
      {success && <p className="form-success">Leave workflow updated successfully.</p>}{error && <p className="form-error">{error}</p>}
      <section className="card">
        <div className="split-row"><h2 className="card-title">Request summary</h2><span className={`badge status-${detail.status}`}>{leaveStatusLabel(detail.status)}</span></div>
        <dl className="compact-definition-list">
          <div><dt>Employee</dt><dd>{detail.employeeName}{detail.employeeNumber ? ` · ${detail.employeeNumber}` : ""}</dd></div><div><dt>Department</dt><dd>{detail.departmentName ?? "—"}</dd></div>
          <div><dt>Duration</dt><dd>{leaveDurationLabel(detail.durationMode)}</dd></div><div><dt>Requested</dt><dd>{formatLeaveUnits(detail.requestedUnits)}</dd></div>
          <div><dt>Chargeable</dt><dd>{formatLeaveUnits(detail.chargeableUnits)}</dd></div><div><dt>Other pending</dt><dd>{formatLeaveUnits(detail.otherPendingReservedUnits)}</dd></div>
          <div><dt>Submitted</dt><dd>{formatCompanyDateTime(detail.submittedAt)}</dd></div><div><dt>Available balance</dt><dd>{detail.balance?.availableUnits === null || detail.balance?.availableUnits === undefined ? "Balance exempt" : formatLeaveUnits(detail.balance.availableUnits)}</dd></div>
        </dl>
        {detail.employeeNote && <div className="private-note"><h3>Private employee note</h3><p>{detail.employeeNote}</p></div>}
      </section>
      <section className="card"><h2 className="card-title">Submitted date snapshots</h2><div className="table-wrap"><table><thead><tr><th>Date</th><th>Schedule</th><th>Classification</th><th>Units</th><th>Conflict</th></tr></thead><tbody>{detail.days.map((day) => <tr key={day.requestDayId}><td>{formatCompanyDate(day.leaveDate)}</td><td>{day.scheduleName ?? "No schedule"}</td><td>{leaveClassificationLabel(day.classification)}</td><td>{formatLeaveUnits(day.chargeableUnits)}</td><td>{day.conflictState ?? "—"}</td></tr>)}</tbody></table></div></section>
      <section className="card"><h2 className="card-title">Supporting documents</h2>{detail.attachments.length === 0 ? <p className="muted">No supporting documents.</p> : <ul className="attachment-list">{detail.attachments.map((attachment) => <li key={attachment.id}><a href={getLeaveAttachmentDownloadUrl(attachment.id)}>{attachment.originalFilename}</a></li>)}</ul>}</section>
      {detail.status === "draft" && <><LeaveAttachmentUploader requestGroupId={requestGroupId} expectedRevisionId={detail.activeRevisionId} attachments={detail.attachments} deleteAction={deleteHrLeaveDraftAttachment} /><form action={submitHrLeaveRequest.bind(null, requestGroupId, detail.activeRevisionId)} className="card form-card"><h2 className="card-title">Submit for HR review</h2><p className="muted">Submission freezes the request and places it in pending status. It is not approved automatically.</p><div className="form-actions"><button className="btn primary" type="submit">Submit pending request</button></div></form></>}
      {detail.status === "pending" && <LeaveReviewForm requestGroupId={requestGroupId} expectedRevisionId={detail.activeRevisionId} expectedStatus="pending" expectedChargeableUnits={detail.chargeableUnits} expectedDayFingerprint={detail.dayFingerprint} action={reviewLeaveRequest.bind(null, requestGroupId)} />}
      {detail.status === "approved" && <CancelApprovedLeaveForm requestGroupId={requestGroupId} action={cancelApprovedLeaveRequest.bind(null, requestGroupId, detail.activeRevisionId)} />}
      <section className="card"><h2 className="card-title">Lifecycle timeline</h2><ol className="timeline-list">{detail.actions.map((action) => <li key={action.id}><strong>{actionLabel(action.actionType)}</strong><span>{action.actorName ?? "System"} · {formatCompanyDateTime(action.createdAt)}</span>{action.privateText && <p>{action.privateText}</p>}</li>)}</ol></section>
    </>
  );
}
