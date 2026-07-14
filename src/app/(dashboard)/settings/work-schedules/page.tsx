import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { ScheduleTemplateList } from "@/components/schedules/schedule-template-list";
import { requireScheduleAdmin } from "@/features/schedules/auth";
import { getScheduleTemplates } from "@/features/schedules/queries";

function href(query: string, status: string, page: number) {
  const search = new URLSearchParams();
  if (query) search.set("query", query);
  if (status !== "active") search.set("status", status);
  search.set("page", String(page));
  return `/settings/work-schedules?${search}`;
}

export default async function WorkSchedulesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireScheduleAdmin();
  const raw = await searchParams;
  const query = typeof raw.query === "string" ? raw.query : "";
  const status = typeof raw.status === "string" ? raw.status : "active";
  const page = Math.max(1, Number(typeof raw.page === "string" ? raw.page : 1) || 1);
  const result = await getScheduleTemplates({ query, status, page });
  return <><PageHeader title="Work schedules" description="Manage reusable, effective-dated work schedule templates." action={<div className="header-actions"><Link className="btn" href="/settings">Back to settings</Link><Link className="btn primary" href="/settings/work-schedules/new">Create schedule</Link></div>} /><div className="card"><form className="toolbar" method="get"><input className="field employee-search" name="query" defaultValue={query} placeholder="Search code or name" /><select className="field" name="status" defaultValue={status}><option value="active">Active</option><option value="archived">Archived</option><option value="all">All</option></select><button className="btn">Apply filters</button>{(query || status !== "active") && <Link className="btn" href="/settings/work-schedules">Clear</Link>}</form></div><ScheduleTemplateList templates={result.templates} /><div className="pagination"><span className="muted">{result.total} schedule(s)</span><div className="pagination-actions"><Link className={`btn ${result.page <= 1 ? "disabled" : ""}`} href={result.page <= 1 ? "#" : href(query, status, result.page - 1)}>Previous</Link><span>Page {result.page} of {result.totalPages}</span><Link className={`btn ${result.page >= result.totalPages ? "disabled" : ""}`} href={result.page >= result.totalPages ? "#" : href(query, status, result.page + 1)}>Next</Link></div></div></>;
}
