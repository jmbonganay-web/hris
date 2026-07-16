import Link from "next/link";
import { createHrLeaveDraft, previewHrLeaveDraft } from "@/app/(dashboard)/admin/leave/actions";
import { LeaveRequestForm } from "@/components/leave/leave-request-form";
import { PageHeader } from "@/components/page-header";
import { companyDateAt } from "@/features/attendance/time";
import { requireLeaveAdmin } from "@/features/leave/auth";
import { getActiveLeaveTypeOptions } from "@/features/leave/policy/queries";
import { getActiveEmployeeOptions } from "@/features/organization/queries";

export default async function NewAdminLeavePage() {
  await requireLeaveAdmin();
  const today = companyDateAt();
  const [employees, leaveTypes] = await Promise.all([getActiveEmployeeOptions(), getActiveLeaveTypeOptions(today)]);
  return (
    <>
      <PageHeader title="Create Employee Leave" description="Create a request on behalf of an employee. It will still enter the pending review queue." action={<Link className="btn" href="/admin/leave">Back to leave</Link>} />
      <LeaveRequestForm mode="create" employeeId={employees[0]?.id ?? ""} employeeOptions={employees} leaveTypes={leaveTypes} action={createHrLeaveDraft} previewAction={previewHrLeaveDraft} />
    </>
  );
}
