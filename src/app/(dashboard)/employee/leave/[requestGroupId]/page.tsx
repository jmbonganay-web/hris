import Link from "next/link";
import { notFound } from "next/navigation";
import { WithdrawLeaveButton } from "@/components/leave/withdraw-leave-button";
import { PageHeader } from "@/components/page-header";
import {
  formatCompanyDate,
  formatCompanyDateTime,
} from "@/features/attendance/time";
import { requireLeaveEmployee } from "@/features/leave/auth";
import {
  formatLeaveUnits,
  leaveClassificationLabel,
  leaveDurationLabel,
  leaveStatusLabel,
} from "@/features/leave/presentation";
import { getLeaveAttachmentDownloadUrl } from "@/features/leave/requests/storage";
import { getLeaveRequestDetail } from "@/features/leave/requests/queries";

function actionLabel(value: string) {
  return value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

export default async function LeaveRequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ requestGroupId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireLeaveEmployee();
  const { requestGroupId } = await params;
  const query = await searchParams;
  let detail;
  try {
    detail = await getLeaveRequestDetail(requestGroupId);
  } catch {
    notFound();
  }
  const success = Array.isArray(query.success) ? query.success[0] : query.success;
  const error = Array.isArray(query.error) ? query.error[0] : query.error;

  return (
    <>
      <PageHeader
        title={detail.leaveTypeName}
        description={`${formatCompanyDate(detail.startDate)}${detail.endDate !== detail.startDate ? ` – ${formatCompanyDate(detail.endDate)}` : ""}`}
        action={(
          <div className="header-actions">
            {detail.status === "draft" && <Link className="btn primary" href={`/employee/leave/${requestGroupId}/edit`}>Edit draft</Link>}
            <Link className="btn" href="/employee/leave">Back to leave</Link>
          </div>
        )}
      />
      {success && <p className="form-success">Leave request updated successfully.</p>}
      {error && <p className="form-error">{error}</p>}

      <section className="card">
        <div className="split-row">
          <h2 className="card-title">Request summary</h2>
          <span className={`badge status-${detail.status}`}>{leaveStatusLabel(detail.status)}</span>
        </div>
        <dl className="compact-definition-list">
          <div><dt>Duration</dt><dd>{leaveDurationLabel(detail.durationMode)}</dd></div>
          <div><dt>Requested</dt><dd>{formatLeaveUnits(detail.requestedUnits)}</dd></div>
          <div><dt>Chargeable</dt><dd>{formatLeaveUnits(detail.chargeableUnits)}</dd></div>
          <div><dt>Paid status</dt><dd>{detail.isPaid ? "Paid" : "Unpaid"}</dd></div>
          <div><dt>Submitted</dt><dd>{formatCompanyDateTime(detail.submittedAt)}</dd></div>
          <div><dt>Reviewed</dt><dd>{formatCompanyDateTime(detail.reviewedAt)}</dd></div>
        </dl>
        {detail.employeeNote && (
          <div className="private-note">
            <h3>Private employee note</h3>
            <p>{detail.employeeNote}</p>
          </div>
        )}
        {detail.status === "pending" && (
          <div className="form-actions">
            <WithdrawLeaveButton requestGroupId={requestGroupId} expectedRevisionId={detail.activeRevisionId} />
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="card-title">Date calculation</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Schedule</th><th>Classification</th><th>Units</th><th>Conflict</th></tr></thead>
            <tbody>
              {detail.days.map((day) => (
                <tr key={day.requestDayId}>
                  <td>{formatCompanyDate(day.leaveDate)}</td>
                  <td>{day.scheduleName ?? "No schedule"}</td>
                  <td>{leaveClassificationLabel(day.classification)}</td>
                  <td>{formatLeaveUnits(day.chargeableUnits)}</td>
                  <td>{day.conflictState ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">Supporting documents</h2>
        {detail.attachments.length === 0 ? <p className="muted">No supporting documents.</p> : (
          <ul className="attachment-list">
            {detail.attachments.map((attachment) => (
              <li key={attachment.id}>
                <a href={getLeaveAttachmentDownloadUrl(attachment.id)}>{attachment.originalFilename}</a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="card-title">Request timeline</h2>
        {detail.actions.length === 0 ? <p className="muted">No request actions recorded.</p> : (
          <ol className="timeline-list">
            {detail.actions.map((action) => (
              <li key={action.id}>
                <strong>{actionLabel(action.actionType)}</strong>
                <span>{action.actorName ?? "System"} · {formatCompanyDateTime(action.createdAt)}</span>
                {action.privateText && <p>{action.privateText}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>

      {(detail.replacesRequestGroupId || detail.supersededByRequestGroupId) && (
        <section className="card">
          <h2 className="card-title">Related requests</h2>
          <div className="form-actions">
            {detail.replacesRequestGroupId && <Link className="btn" href={`/employee/leave/${detail.replacesRequestGroupId}`}>View replaced request</Link>}
            {detail.supersededByRequestGroupId && <Link className="btn" href={`/employee/leave/${detail.supersededByRequestGroupId}`}>View replacement request</Link>}
          </div>
        </section>
      )}
    </>
  );
}
