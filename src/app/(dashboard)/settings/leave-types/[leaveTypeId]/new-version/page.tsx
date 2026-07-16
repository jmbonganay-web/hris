import Link from "next/link";
import { notFound } from "next/navigation";
import { createLeaveTypeVersion } from "@/app/(dashboard)/settings/leave-types/actions";
import { LeaveTypeForm } from "@/components/leave/leave-type-form";
import { PageHeader } from "@/components/page-header";
import { companyDateAt } from "@/features/attendance/time";
import { requireLeaveAdmin } from "@/features/leave/auth";
import { getLeaveType } from "@/features/leave/policy/queries";
export default async function NewLeaveTypeVersionPage({ params }: { params: Promise<{ leaveTypeId: string }> }) { await requireLeaveAdmin(); const { leaveTypeId } = await params; const companyDate = companyDateAt(); const leaveType = await getLeaveType(leaveTypeId, companyDate); if (!leaveType) notFound(); return <><PageHeader title="Add Leave Policy Version" description={`Create a new immutable version for ${leaveType.current?.name ?? leaveType.code}.`} action={<Link className="btn" href={`/settings/leave-types/${leaveTypeId}`}>Back to leave type</Link>} /><LeaveTypeForm mode="version" leaveTypeId={leaveTypeId} initial={leaveType.current} companyDate={companyDate} action={createLeaveTypeVersion.bind(null, leaveTypeId)} /></>; }
