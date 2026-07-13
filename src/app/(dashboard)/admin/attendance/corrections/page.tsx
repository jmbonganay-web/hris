import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireAttendanceAdmin } from "@/features/attendance/auth";
import { getAdminCorrectionRequests } from "@/features/attendance/queries";
import {
  formatCompanyDate,
  formatCompanyDateTime,
} from "@/features/attendance/time";
import {
  correctionRequestStatuses,
  type CorrectionRequestStatus,
} from "@/features/attendance/types";

const typeLabels = {
  add_missing_clock_in: "Add missing clock-in",
  add_missing_clock_out: "Add missing clock-out",
  change_clock_in: "Change clock-in",
  change_clock_out: "Change clock-out",
} as const;

function value(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] : input ?? "";
}

function isStatus(value: string): value is CorrectionRequestStatus {
  return correctionRequestStatuses.includes(value as CorrectionRequestStatus);
}

function pageHref(status: string, page: number) {
  const search = new URLSearchParams();
  if (status && status !== "pending") search.set("status", status);
  if (page > 1) search.set("page", String(page));
  return `/admin/attendance/corrections${search.size ? `?${search}` : ""}`;
}

export default async function AdminCorrectionRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAttendanceAdmin();
  const raw = await searchParams;
  const requestedStatus = value(raw.status) || "pending";
  const status = requestedStatus === "all" || isStatus(requestedStatus)
    ? requestedStatus
    : "pending";
  const page = Math.max(1, Number(value(raw.page) || "1") || 1);
  const success = value(raw.success);
  const result = await getAdminCorrectionRequests({ status, page });

  return (
    <>
      <PageHeader
        title="Correction requests"
        description="Review employee attendance correction requests. Pending requests are oldest first."
        action={<Link className="btn" href="/admin/attendance">Back to attendance</Link>}
      />

      {success === "approved" && <p className="form-success">Correction request approved and attendance updated.</p>}
      {success === "rejected" && <p className="form-success">Correction request rejected.</p>}

      <section className="card">
        <nav className="hr-note-toolbar" aria-label="Correction request status filters">
          {["pending", "approved", "rejected", "cancelled", "all"].map((item) => (
            <Link
              className={`btn${status === item ? " primary" : ""}`}
              href={pageHref(item, 1)}
              key={item}
            >
              {item[0].toUpperCase() + item.slice(1)}
            </Link>
          ))}
        </nav>

        {result.requests.length === 0 ? (
          <div className="empty">No correction requests match this filter.</div>
        ) : (
          <div className="correction-request-list">
            {result.requests.map((request) => {
              const employee = request.employee;
              return (
                <article className="card correction-request-card" key={request.id}>
                  <div className="section-heading-row">
                    <div>
                      <p className="eyebrow">{typeLabels[request.request_type]}</p>
                      <h2>{employee ? `${employee.first_name} ${employee.last_name}` : "Unknown employee"}</h2>
                      <p className="muted">{employee?.employee_number ?? "—"}</p>
                    </div>
                    <span className={`badge ${request.status === "approved" ? "success" : request.status === "rejected" ? "warning" : "info"}`}>
                      {request.status[0].toUpperCase() + request.status.slice(1)}
                    </span>
                  </div>
                  <dl className="attendance-detail-grid">
                    <div><dt>Attendance date</dt><dd>{formatCompanyDate(request.attendance_date)}</dd></div>
                    <div><dt>Requested clock-in</dt><dd>{formatCompanyDateTime(request.requested_clock_in_at)}</dd></div>
                    <div><dt>Requested clock-out</dt><dd>{formatCompanyDateTime(request.requested_clock_out_at)}</dd></div>
                    <div><dt>Submitted</dt><dd>{formatCompanyDateTime(request.created_at)}</dd></div>
                  </dl>
                  <Link className="btn" href={`/admin/attendance/corrections/${request.id}`}>
                    {request.status === "pending" ? "Review request" : "View outcome"}
                  </Link>
                </article>
              );
            })}
          </div>
        )}

        <nav className="pagination" aria-label="Correction request pages">
          <Link
            aria-disabled={result.page <= 1}
            className={`btn${result.page <= 1 ? " disabled" : ""}`}
            href={pageHref(status, Math.max(1, result.page - 1))}
          >Previous</Link>
          <span>Page {result.page} of {result.totalPages} · {result.total} requests</span>
          <Link
            aria-disabled={result.page >= result.totalPages}
            className={`btn${result.page >= result.totalPages ? " disabled" : ""}`}
            href={pageHref(status, Math.min(result.totalPages, result.page + 1))}
          >Next</Link>
        </nav>
      </section>
    </>
  );
}
