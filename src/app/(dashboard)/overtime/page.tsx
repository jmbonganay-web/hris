import Link from "next/link";
import { EmployeeOvertimeHistory } from "@/components/overtime/employee-overtime-history";
import { PageHeader } from "@/components/page-header";
import { requireAttendanceEmployee } from "@/features/attendance/auth";
import { getOwnOvertimeHistory } from "@/features/overtime/queries";

function value(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] : input ?? "";
}
function pageHref(filters: Record<string, string>, page: number) {
  const search = new URLSearchParams();
  for (const [key, item] of Object.entries(filters)) if (item) search.set(key, item);
  if (page > 1) search.set("page", String(page));
  return `/overtime${search.size ? `?${search}` : ""}`;
}

export default async function OvertimePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAttendanceEmployee();
  const raw = await searchParams;
  const fromDate = value(raw.from);
  const toDate = value(raw.to);
  const page = Math.max(1, Number(value(raw.page) || "1") || 1);
  const result = await getOwnOvertimeHistory({ fromDate, toDate, page });
  const filters = { from: fromDate, to: toDate };

  return (
    <>
      <PageHeader
        title="My Overtime"
        description="Review detected, approved, rejected, and superseded overtime or holiday-work items."
        action={<Link className="btn" href="/attendance">View attendance</Link>}
      />
      <section className="card">
        <form className="toolbar" method="get">
          <input className="field" type="date" name="from" defaultValue={fromDate} aria-label="From date" />
          <input className="field" type="date" name="to" defaultValue={toDate} aria-label="To date" />
          <button className="btn" type="submit">Apply dates</button>
          {(fromDate || toDate) && <Link className="btn" href="/overtime">Clear</Link>}
        </form>
        <EmployeeOvertimeHistory items={result.items} />
        <nav className="pagination" aria-label="Overtime history pages">
          <Link aria-disabled={result.page <= 1} className={`btn${result.page <= 1 ? " disabled" : ""}`} href={pageHref(filters, Math.max(1, result.page - 1))}>Previous</Link>
          <span>Page {result.page} of {result.totalPages} · {result.total} items</span>
          <Link aria-disabled={result.page >= result.totalPages} className={`btn${result.page >= result.totalPages ? " disabled" : ""}`} href={pageHref(filters, Math.min(result.totalPages, result.page + 1))}>Next</Link>
        </nav>
      </section>
    </>
  );
}
