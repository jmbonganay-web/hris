import Link from "next/link";
import { createLeaveDraft, previewLeaveDraft } from "@/app/(dashboard)/employee/leave/actions";
import { LeaveRequestForm } from "@/components/leave/leave-request-form";
import { PageHeader } from "@/components/page-header";
import { companyDateAt } from "@/features/attendance/time";
import { requireLeaveEmployee } from "@/features/leave/auth";
import { getActiveLeaveTypeOptions } from "@/features/leave/policy/queries";

export default async function NewLeaveRequestPage() {
  const { employee } = await requireLeaveEmployee();
  const leaveTypes = await getActiveLeaveTypeOptions(companyDateAt());

  return (
    <>
      <PageHeader
        title="Request Leave"
        description="Save a private draft, confirm the date calculation, then submit it for HR review."
        action={<Link className="btn" href="/employee/leave">Back to leave</Link>}
      />
      <LeaveRequestForm
        mode="create"
        employeeId={employee.id}
        leaveTypes={leaveTypes}
        action={createLeaveDraft}
        previewAction={previewLeaveDraft}
      />
    </>
  );
}
