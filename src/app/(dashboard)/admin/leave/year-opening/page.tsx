import Link from "next/link";
import { generateIndividualLeaveAllocation, generateLeaveYearOpening, previewLeaveYearOpening } from "@/app/(dashboard)/admin/leave/actions";
import { IndividualLeaveAllocationForm } from "@/components/leave/individual-leave-allocation-form";
import { LeaveYearOpeningForm } from "@/components/leave/leave-year-opening-form";
import { PageHeader } from "@/components/page-header";
import { companyDateAt } from "@/features/attendance/time";
import { requireLeaveAdmin } from "@/features/leave/auth";
import { getActiveLeaveTypeOptions } from "@/features/leave/policy/queries";
import { getActiveEmployeeOptions } from "@/features/organization/queries";

export default async function LeaveYearOpeningPage() {
  await requireLeaveAdmin();
  const today = companyDateAt();
  const currentYear = Number(today.slice(0, 4));
  const [employees, leaveTypes] = await Promise.all([getActiveEmployeeOptions(), getActiveLeaveTypeOptions(today)]);
  return <><PageHeader title="Leave Year Opening" description="Preview and generate annual allocations and eligible carryover without duplicate ledger entries." action={<Link className="btn" href="/admin/leave">Back to leave</Link>} /><LeaveYearOpeningForm defaultYear={currentYear} previewAction={previewLeaveYearOpening} generateAction={generateLeaveYearOpening} /><IndividualLeaveAllocationForm employees={employees} leaveTypes={leaveTypes} defaultYear={currentYear} action={generateIndividualLeaveAllocation} /></>;
}
