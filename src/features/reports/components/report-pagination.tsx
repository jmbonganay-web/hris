import Link from "next/link";
import { serializeReportFilters } from "../filters";
import type { ReportFilters } from "../types";

export function ReportPagination({
  filters,
  page,
  totalPages,
  total,
}: {
  filters: ReportFilters;
  page: number;
  totalPages: number;
  total: number;
}) {
  const href = (nextPage: number) => `/reports?${serializeReportFilters({ ...filters, page: nextPage }).toString()}`;
  return (
    <nav className="report-pagination" aria-label="Report pages">
      <Link className={`btn${page <= 1 ? " disabled" : ""}`} aria-disabled={page <= 1} href={href(Math.max(1, page - 1))}>Previous</Link>
      <span>Page {page} of {totalPages} · {total} rows</span>
      <Link className={`btn${page >= totalPages ? " disabled" : ""}`} aria-disabled={page >= totalPages} href={href(Math.min(totalPages, page + 1))}>Next</Link>
    </nav>
  );
}
