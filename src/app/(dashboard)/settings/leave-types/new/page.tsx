import Link from "next/link";
import { createLeaveType } from "@/app/(dashboard)/settings/leave-types/actions";
import { LeaveTypeForm } from "@/components/leave/leave-type-form";
import { PageHeader } from "@/components/page-header";
import { companyDateAt } from "@/features/attendance/time";
import { requireLeaveAdmin } from "@/features/leave/auth";
export default async function NewLeaveTypePage() { await requireLeaveAdmin(); const companyDate = companyDateAt(); return <><PageHeader title="Create Leave Type" description="Create a stable leave identity and its first immutable policy version." action={<Link className="btn" href="/settings/leave-types">Back to leave types</Link>} /><LeaveTypeForm mode="create" companyDate={companyDate} action={createLeaveType} /></>; }
