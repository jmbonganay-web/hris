import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { companyDateAt } from "@/features/attendance/time";
import { requireLeaveAdmin } from "@/features/leave/auth";
import { formatLeaveUnits } from "@/features/leave/presentation";
import { getLeaveTypes } from "@/features/leave/policy/queries";

export default async function LeaveTypesPage() {
  await requireLeaveAdmin();
  const companyDate = companyDateAt();
  const leaveTypes = await getLeaveTypes(companyDate);
  return <><PageHeader title="Leave Types" description="Manage stable leave identities through immutable effective-dated policy versions." action={<Link className="btn primary" href="/settings/leave-types/new">Create leave type</Link>} /><section className="settings-grid">{leaveTypes.map((leaveType) => { const current = leaveType.current; return <Link className="card settings-card" key={leaveType.id} href={`/settings/leave-types/${leaveType.id}`}><div><strong>{current?.name ?? leaveType.code}</strong><p className="muted">{leaveType.code}</p></div><div>{current ? <><span className={`badge ${current.is_active ? "success" : "warning"}`}>{current.is_active ? "Active" : "Archived"}</span><p className="muted">{current.is_balance_tracked ? formatLeaveUnits(current.default_annual_units) : "Balance exempt"}</p></> : <span className="badge warning">No active version</span>}</div></Link>; })}</section></>;
}
