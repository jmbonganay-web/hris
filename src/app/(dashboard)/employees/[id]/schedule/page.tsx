import Link from "next/link";
import { notFound } from "next/navigation";
import { AssignmentHistory } from "@/components/schedules/assignment-history";
import { ProfileTabs } from "@/components/employees/profile/profile-tabs";
import { PageHeader } from "@/components/page-header";
import { companyDateAt } from "@/features/attendance/time";
import { requireEmployeeProfileManager } from "@/features/employees/auth";
import { getEmployee } from "@/features/employees/queries";
import { getEmployeeScheduleAssignments } from "@/features/schedules/queries";

export default async function EmployeeSchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireEmployeeProfileManager(id);
  const [employee, assignments] = await Promise.all([
    getEmployee(id),
    getEmployeeScheduleAssignments(id),
  ]);
  if (!employee) notFound();
  return <><PageHeader title={`${employee.first_name} ${employee.last_name} · Schedule`} description="Current, upcoming, previous, and superseded schedule assignments." action={<Link className="btn primary" href={`/settings/work-schedules/assign?employee=${id}`}>Assign new schedule</Link>} /><ProfileTabs employeeId={id} active="schedule" canManage /><AssignmentHistory assignments={assignments} companyDate={companyDateAt()} showReasons /></>;
}
