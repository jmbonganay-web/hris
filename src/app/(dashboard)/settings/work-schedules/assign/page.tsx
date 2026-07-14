import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { IndividualAssignmentForm } from "@/components/schedules/individual-assignment-form";
import { companyDateAt } from "@/features/attendance/time";
import { requireScheduleAdmin } from "@/features/schedules/auth";
import { getActiveScheduleOptions, getEligibleScheduleEmployees } from "@/features/schedules/queries";
import { assignScheduleToEmployee } from "../actions";

export default async function AssignWorkSchedulePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireScheduleAdmin();
  const raw = await searchParams;
  const defaultEmployeeId = typeof raw.employee === "string" ? raw.employee : "";
  const [employees, schedules] = await Promise.all([getEligibleScheduleEmployees(), getActiveScheduleOptions()]);
  return <><PageHeader title="Assign work schedule" description="Assign an effective-dated schedule to one employee." action={<div className="header-actions"><Link className="btn" href="/settings/work-schedules">Back</Link><Link className="btn" href="/settings/work-schedules/assign/bulk">Bulk assignment</Link></div>} />{schedules.length === 0 ? <div className="empty"><h3>No active schedules</h3><p>Create or restore a schedule before assigning employees.</p></div> : <IndividualAssignmentForm action={assignScheduleToEmployee} employees={employees} schedules={schedules} defaultEmployeeId={defaultEmployeeId} companyDate={companyDateAt()} />}</>;
}
