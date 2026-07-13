import Link from "next/link";
import { CorrectionRequestList } from "@/components/attendance/correction-request-list";
import { PageHeader } from "@/components/page-header";
import { requireAttendanceEmployee } from "@/features/attendance/auth";
import { getOwnCorrectionRequests } from "@/features/attendance/queries";
import { correctionRequestStatuses, type CorrectionRequestStatus } from "@/features/attendance/types";

function value(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] : input ?? "";
}

function href(status: string, page = 1) {
  const search = new URLSearchParams();
  if (status && status !== "all") search.set("status", status);
  if (page > 1) search.set("page", String(page));
  return `/attendance/corrections${search.size ? `?${search}` : ""}`;
}

export default async function AttendanceCorrectionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const requestedStatus = value(query.status);
  const status = correctionRequestStatuses.includes(requestedStatus as CorrectionRequestStatus)
    ? requestedStatus as CorrectionRequestStatus
    : "all";
  const page = Math.max(1, Number(value(query.page) || "1") || 1);
  const success = value(query.success);
  const error = value(query.error);
  const { employee } = await requireAttendanceEmployee();
  const result = await getOwnCorrectionRequests({ employeeId: employee.id, status, page });

  return (
    <>
      <PageHeader
        title="Correction requests"
        description="Track attendance changes you submitted for HR review."
        action={<Link className="btn primary" href="/attendance/corrections/new">New correction request</Link>}
      />
      {success === "requested" && <p className="form-success">Your correction request was submitted.</p>}
      {success === "cancelled" && <p className="form-success">The correction request was cancelled.</p>}
      {error === "cancel_failed" && <p className="form-error">The request could not be cancelled.</p>}

      <nav className="filter-tabs" aria-label="Correction request status">
        {["all", ...correctionRequestStatuses].map((item) => (
          <Link className={status === item ? "active" : ""} href={href(item)} key={item}>
            {item[0].toUpperCase() + item.slice(1)}
          </Link>
        ))}
      </nav>

      <CorrectionRequestList requests={result.requests} />
      <nav className="pagination" aria-label="Correction request pages">
        <Link aria-disabled={result.page <= 1} className={`btn${result.page <= 1 ? " disabled" : ""}`} href={href(status, Math.max(1, result.page - 1))}>Previous</Link>
        <span>Page {result.page} of {result.totalPages} · {result.total} requests</span>
        <Link aria-disabled={result.page >= result.totalPages} className={`btn${result.page >= result.totalPages ? " disabled" : ""}`} href={href(status, Math.min(result.totalPages, result.page + 1))}>Next</Link>
      </nav>
    </>
  );
}
