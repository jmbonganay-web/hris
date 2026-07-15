import Link from "next/link";
import { notFound } from "next/navigation";
import { OvertimeReviewForm } from "@/components/overtime/overtime-review-form";
import { PageHeader } from "@/components/page-header";
import { formatAttendanceMinutes } from "@/features/attendance/calculations/presentation";
import { requireAttendanceAdmin } from "@/features/attendance/auth";
import { formatCompanyDate, formatCompanyDateTime } from "@/features/attendance/time";
import {
  holidayTypeLabel,
  overtimeApprovalStatusLabel,
  overtimeSegmentLabel,
} from "@/features/overtime/presentation";
import { getOvertimeApprovalDetail } from "@/features/overtime/queries";
import { reviewOvertimeApproval } from "../actions";

function reviewerName(
  reviewer: NonNullable<Awaited<ReturnType<typeof getOvertimeApprovalDetail>>>["reviewer"],
) {
  if (!reviewer) return "—";
  return reviewer.display_name || `${reviewer.first_name} ${reviewer.last_name}`.trim();
}

export default async function OvertimeApprovalDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ approvalItemId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAttendanceAdmin();
  const { approvalItemId } = await params;
  const query = await searchParams;
  const item = await getOvertimeApprovalDetail(approvalItemId);
  if (!item) notFound();
  const reviewable =
    item.status === "pending" &&
    item.detection_is_active &&
    !item.superseded_at;

  return (
    <>
      <PageHeader
        title="Overtime approval detail"
        description={`${item.employee.first_name} ${item.employee.last_name} · ${formatCompanyDate(item.attendance_date)}`}
        action={<Link className="btn" href="/admin/overtime">Back to approvals</Link>}
      />
      {query.success === "reviewed" && <p className="form-success">Overtime review saved.</p>}

      <section className="card">
        <dl className="attendance-detail-grid overtime-detail-grid">
          <div><dt>Employee</dt><dd>{item.employee.first_name} {item.employee.last_name} · {item.employee.employee_number}</dd></div>
          <div><dt>Attendance date</dt><dd>{formatCompanyDate(item.attendance_date)}</dd></div>
          <div><dt>Segment type</dt><dd>{overtimeSegmentLabel(item.segment_type)}</dd></div>
          <div><dt>Holiday</dt><dd>{item.holiday_name ? `${item.holiday_name} · ${holidayTypeLabel(item.holiday_type)}` : "—"}</dd></div>
          <div><dt>Detected start</dt><dd>{formatCompanyDateTime(item.detected_start_at)}</dd></div>
          <div><dt>Detected end</dt><dd>{formatCompanyDateTime(item.detected_end_at)}</dd></div>
          <div><dt>Detected minutes</dt><dd>{formatAttendanceMinutes(item.detected_minutes)}</dd></div>
          <div><dt>Approved minutes</dt><dd>{formatAttendanceMinutes(item.approved_minutes)}</dd></div>
          <div><dt>Approval status</dt><dd>{overtimeApprovalStatusLabel(item.status)}</dd></div>
          <div><dt>Created at</dt><dd>{formatCompanyDateTime(item.created_at)}</dd></div>
          <div><dt>Reviewed by</dt><dd>{reviewerName(item.reviewer)}</dd></div>
          <div><dt>Reviewed at</dt><dd>{formatCompanyDateTime(item.reviewed_at)}</dd></div>
          <div><dt>Attendance calculation revision</dt><dd><code>{item.attendance_calculation_revision_id}</code></dd></div>
          <div><dt>Schedule assignment</dt><dd><code>{item.schedule_assignment_id ?? "—"}</code></dd></div>
          <div><dt>Schedule version</dt><dd><code>{item.schedule_version_id ?? "—"}</code></dd></div>
          <div><dt>Overtime policy version</dt><dd><code>{item.overtime_policy_version_id ?? "Implicit default (30m)"}</code></dd></div>
          <div><dt>Holiday version</dt><dd><code>{item.holiday_version_id ?? "—"}</code></dd></div>
        </dl>
        {item.approval_note && <div className="private-text-block"><strong>Approval note</strong><p>{item.approval_note}</p></div>}
        {item.rejection_reason && <div className="private-text-block"><strong>Rejection reason</strong><p>{item.rejection_reason}</p></div>}
      </section>

      {reviewable && (
        <OvertimeReviewForm approvalItemId={item.id} action={reviewOvertimeApproval} />
      )}

      <section className="card">
        <h2 className="card-title">Prior superseded items</h2>
        {item.priorItems.length === 0 ? (
          <p className="empty">No prior approval items exist for this segment.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Revision</th><th>Status</th><th>Detected</th><th>Approved</th><th>Created</th><th>Action</th></tr></thead>
              <tbody>{item.priorItems.map((prior) => (
                <tr key={prior.id}>
                  <td>{prior.detection_revision_number}</td>
                  <td>{overtimeApprovalStatusLabel(prior.status)}</td>
                  <td>{formatAttendanceMinutes(prior.detected_minutes)}</td>
                  <td>{formatAttendanceMinutes(prior.approved_minutes)}</td>
                  <td>{formatCompanyDateTime(prior.created_at)}</td>
                  <td><Link className="table-link" href={`/admin/overtime/${prior.id}`}>View</Link></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
