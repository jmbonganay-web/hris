import Link from "next/link";
import { notFound } from "next/navigation";
import { archiveLeaveType } from "@/app/(dashboard)/settings/leave-types/actions";
import { ArchiveLeaveTypeForm } from "@/components/leave/archive-leave-type-form";
import { LeaveTypeVersionList } from "@/components/leave/leave-type-version-list";
import { PageHeader } from "@/components/page-header";
import { companyDateAt } from "@/features/attendance/time";
import { requireLeaveAdmin } from "@/features/leave/auth";
import { getLeaveType } from "@/features/leave/policy/queries";

export default async function LeaveTypeDetailPage({ params }: { params: Promise<{ leaveTypeId: string }> }) {
  await requireLeaveAdmin(); const { leaveTypeId } = await params; const companyDate = companyDateAt(); const leaveType = await getLeaveType(leaveTypeId, companyDate); if (!leaveType) notFound();
  const versions = [...leaveType.upcoming, ...leaveType.history].filter((version) => version.id !== leaveType.current?.id);
  return <><PageHeader title={leaveType.current?.name ?? leaveType.code} description={`Stable leave code: ${leaveType.code}. Historical versions are read-only.`} action={<div className="header-actions"><Link className="btn primary" href={`/settings/leave-types/${leaveTypeId}/new-version`}>Add policy version</Link><Link className="btn" href={`/admin/leave/balances?leave_type=${leaveTypeId}`}>Employee exclusions and overrides</Link><Link className="btn" href="/settings/leave-types">Back</Link></div>} /><section className="card"><h2 className="card-title">Current policy</h2>{leaveType.current ? <LeaveTypeVersionList versions={[leaveType.current]} /> : <p className="muted">No policy is effective on {companyDate}.</p>}</section><section><h2>Immutable version history</h2><LeaveTypeVersionList versions={versions} /></section>{leaveType.current?.is_active && <ArchiveLeaveTypeForm companyDate={companyDate} action={archiveLeaveType.bind(null, leaveTypeId)} />}</>;
}
