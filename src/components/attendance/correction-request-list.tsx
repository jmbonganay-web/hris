import { formatCompanyDate, formatCompanyDateTime } from "@/features/attendance/time";
import type { AttendanceCorrectionRequest } from "@/features/attendance/types";
import { CancelCorrectionRequestButton } from "./cancel-correction-request-button";

const typeLabels = {
  add_missing_clock_in: "Add missing clock-in",
  add_missing_clock_out: "Add missing clock-out",
  change_clock_in: "Change clock-in",
  change_clock_out: "Change clock-out",
} as const;

function reviewerName(request: AttendanceCorrectionRequest) {
  const reviewer = request.reviewer;
  if (!reviewer) return "—";
  return reviewer.display_name || `${reviewer.first_name} ${reviewer.last_name}`.trim();
}

export function CorrectionRequestList({
  requests,
}: {
  requests: AttendanceCorrectionRequest[];
}) {
  if (requests.length === 0) {
    return <div className="empty">No correction requests match this filter.</div>;
  }

  return (
    <div className="correction-request-list">
      {requests.map((request) => (
        <article className="card correction-request-card" key={request.id}>
          <div className="section-heading-row">
            <div>
              <p className="eyebrow">{typeLabels[request.request_type]}</p>
              <h2>{formatCompanyDate(request.attendance_date)}</h2>
            </div>
            <span className={`badge ${request.status === "approved" ? "success" : request.status === "rejected" ? "warning" : "info"}`}>
              {request.status[0].toUpperCase() + request.status.slice(1)}
            </span>
          </div>

          <dl className="attendance-detail-grid">
            <div><dt>Requested clock-in</dt><dd>{formatCompanyDateTime(request.requested_clock_in_at)}</dd></div>
            <div><dt>Requested clock-out</dt><dd>{formatCompanyDateTime(request.requested_clock_out_at)}</dd></div>
            <div><dt>Submitted</dt><dd>{formatCompanyDateTime(request.created_at)}</dd></div>
            <div><dt>Reviewer</dt><dd>{reviewerName(request)}</dd></div>
          </dl>

          <div className="private-text-block"><strong>Reason</strong><p>{request.reason}</p></div>
          {request.employee_note && <div className="private-text-block"><strong>Employee note</strong><p>{request.employee_note}</p></div>}
          {request.review_note && <div className="private-text-block"><strong>Review note</strong><p>{request.review_note}</p></div>}

          {request.status === "pending" && <CancelCorrectionRequestButton requestId={request.id} />}
        </article>
      ))}
    </div>
  );
}
