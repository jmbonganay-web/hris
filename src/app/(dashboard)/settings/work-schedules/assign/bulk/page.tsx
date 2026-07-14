import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { BulkAssignmentForm } from "@/components/schedules/bulk-assignment-form";
import { companyDateAt } from "@/features/attendance/time";
import { requireScheduleAdmin } from "@/features/schedules/auth";
import { getActiveScheduleOptions, getEligibleScheduleEmployees } from "@/features/schedules/queries";
import { bulkAssignSchedule } from "../../actions";

export default async function BulkAssignWorkSchedulePage() {
  await requireScheduleAdmin();
  const [employees, schedules] = await Promise.all([getEligibleScheduleEmployees(), getActiveScheduleOptions()]);
  return <><PageHeader title="Bulk schedule assignment" description="Apply one schedule to multiple employees in a single atomic operation." action={<Link className="btn" href="/settings/work-schedules/assign">Back</Link>} />{schedules.length === 0 ? <div className="empty"><h3>No active schedules</h3><p>Create or restore a schedule before assigning employees.</p></div> : <BulkAssignmentForm action={bulkAssignSchedule} employees={employees} schedules={schedules} companyDate={companyDateAt()} />}</>;
}
