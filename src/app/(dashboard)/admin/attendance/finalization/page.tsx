import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { FinalizationRunList } from "@/components/attendance/finalization-run-list";
import { requireAttendanceAdmin } from "@/features/attendance/auth";
import { getFinalizationRuns } from "@/features/attendance/calculations/queries";
import { companyDateAt } from "@/features/attendance/time";
import { runAttendanceFinalization } from "./actions";
import { ManualFinalizationForm } from "./manual-finalization-form";

function previousDate(date: string) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

export default async function AttendanceFinalizationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAttendanceAdmin();
  const query = await searchParams;
  const page = Math.max(1, Number(Array.isArray(query.page) ? query.page[0] : query.page ?? 1) || 1);
  const result = await getFinalizationRuns(page);
  return <><PageHeader title="Attendance finalization" description="Monitor scheduled runs and manually finalize a past Manila attendance date." action={<Link className="btn" href="/admin/attendance">Back to attendance</Link>} />{query.success === "completed" && <p className="form-success">Attendance finalization completed.</p>}<ManualFinalizationForm action={runAttendanceFinalization} defaultDate={previousDate(companyDateAt())} /><section className="card"><h2 className="card-title">Finalization runs</h2><FinalizationRunList runs={result.runs} /><nav className="pagination"><Link className={`btn${page <= 1 ? " disabled" : ""}`} href={page <= 1 ? "#" : `/admin/attendance/finalization?page=${page - 1}`}>Previous</Link><span>Page {page} of {result.totalPages}</span><Link className={`btn${page >= result.totalPages ? " disabled" : ""}`} href={page >= result.totalPages ? "#" : `/admin/attendance/finalization?page=${page + 1}`}>Next</Link></nav></section></>;
}
