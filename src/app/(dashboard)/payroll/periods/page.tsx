import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { PayrollPeriodFilterForm } from "@/components/payroll/payroll-period-filter-form";
import { PayrollPeriodList } from "@/components/payroll/payroll-period-list";
import { requirePayrollAdministrator } from "@/features/payroll/auth";
import { listPayrollPeriods } from "@/features/payroll/periods/queries";
import { listPayrollSchedules } from "@/features/payroll/schedules/queries";
import { validatePayrollPeriodFilters } from "@/features/payroll/validation";
export default async function PayrollPeriodsPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  await requirePayrollAdministrator();
  const filters = validatePayrollPeriodFilters(await searchParams);
  const [result, schedules] = await Promise.all([listPayrollPeriods(filters), listPayrollSchedules()]);
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  const pageHref = (page: number) => { const q = new URLSearchParams(); if (filters.scheduleId) q.set("scheduleId", filters.scheduleId); if (filters.status) q.set("status", filters.status); if (filters.year) q.set("year", String(filters.year)); if (filters.from) q.set("from", filters.from); if (filters.to) q.set("to", filters.to); q.set("page", String(page)); return `/payroll/periods?${q}`; };
  return <div className="payroll-layout"><PageHeader title="Payroll periods" description="Review generated date ranges, cutoff dates, payment dates, and lifecycle status." action={<div className="header-actions"><Link className="btn" href="/payroll">Payroll overview</Link><Link className="btn" href="/payroll/schedules">Schedules</Link></div>} /><PayrollPeriodFilterForm filters={filters} schedules={schedules}/><PayrollPeriodList periods={result.items}/><nav className="pagination"><span className="muted">Page {result.page} of {pageCount} · {result.total} periods</span><div className="pagination-actions">{result.page > 1 ? <Link className="btn" href={pageHref(result.page - 1)}>Previous</Link> : null}{result.page < pageCount ? <Link className="btn" href={pageHref(result.page + 1)}>Next</Link> : null}</div></nav></div>;
}
