import Link from "next/link";
import { notFound } from "next/navigation";
import { CorrectionReviewForm } from "@/components/attendance/correction-review-form";
import { PageHeader } from "@/components/page-header";
import { requireAttendanceAdmin } from "@/features/attendance/auth";
import { getCorrectionRequest } from "@/features/attendance/queries";
import {
  formatCompanyDate,
  formatCompanyDateTime,
} from "@/features/attendance/time";
import { reviewCorrectionRequest } from "../../../../attendance/actions";

const typeLabels = {
  add_missing_clock_in: "Add missing clock-in",
  add_missing_clock_out: "Add missing clock-out",
  change_clock_in: "Change clock-in",
  change_clock_out: "Change clock-out",
} as const;

function reviewerName(request: NonNullable<Awaited<ReturnType<typeof getCorrectionRequest>>>) {
  const reviewer = request.reviewer;
  if (!reviewer) return "—";
  return reviewer.display_name || `${reviewer.first_name} ${reviewer.last_name}`.trim();
}

export default async function AdminCorrectionReviewPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { user } = await requireAttendanceAdmin();
  const { requestId } = await params;
  const request = await getCorrectionRequest(requestId);
  if (!request) notFound();

  const employee = request.employee;
  const current = request.attendance_record;
  const selfReview = request.requested_by === user.id;
  const reviewable = request.status === "pending" && !selfReview;

  return (
    <>
      <PageHeader
        title="Review correction request"
        description={`${employee ? `${employee.first_name} ${employee.last_name}` : "Unknown employee"} · ${formatCompanyDate(request.attendance_date)}`}
        action={<Link className="btn" href="/admin/attendance/corrections">Back to requests</Link>}
      />

      <section className="card">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">{typeLabels[request.request_type]}</p>
            <h2 className="card-title">Requested attendance change</h2>
          </div>
          <span className={`badge ${request.status === "approved" ? "success" : request.status === "rejected" ? "warning" : "info"}`}>
            {request.status[0].toUpperCase() + request.status.slice(1)}
          </span>
        </div>

        <div className="profile-overview-grid">
          <article className="card">
            <h3>Current official record</h3>
            <dl className="attendance-detail-grid">
              <div><dt>Clock in</dt><dd>{formatCompanyDateTime(current?.clock_in_at ?? null)}</dd></div>
              <div><dt>Clock out</dt><dd>{formatCompanyDateTime(current?.clock_out_at ?? null)}</dd></div>
            </dl>
          </article>
          <article className="card">
            <h3>Requested values</h3>
            <dl className="attendance-detail-grid">
              <div><dt>Clock in</dt><dd>{formatCompanyDateTime(request.requested_clock_in_at)}</dd></div>
              <div><dt>Clock out</dt><dd>{formatCompanyDateTime(request.requested_clock_out_at)}</dd></div>
            </dl>
          </article>
        </div>

        <div className="private-text-block"><strong>Employee reason</strong><p>{request.reason}</p></div>
        {request.employee_note && <div className="private-text-block"><strong>Employee note</strong><p>{request.employee_note}</p></div>}
      </section>

      {selfReview && request.status === "pending" && (
        <p className="form-error" role="alert">You submitted this request and cannot approve or reject it.</p>
      )}

      {reviewable ? (
        <CorrectionReviewForm action={reviewCorrectionRequest.bind(null, request.id)} />
      ) : request.status !== "pending" ? (
        <section className="card">
          <h2 className="card-title">Review outcome</h2>
          <dl className="attendance-detail-grid">
            <div><dt>Status</dt><dd>{request.status}</dd></div>
            <div><dt>Reviewed by</dt><dd>{reviewerName(request)}</dd></div>
            <div><dt>Reviewed at</dt><dd>{formatCompanyDateTime(request.reviewed_at)}</dd></div>
          </dl>
          {request.review_note && <div className="private-text-block"><strong>Review note</strong><p>{request.review_note}</p></div>}
        </section>
      ) : null}
    </>
  );
}
