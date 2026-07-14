import Link from "next/link";
import { notFound } from "next/navigation";
import { AttendanceCalculationDetails } from "@/components/attendance/attendance-calculation-details";
import { PageHeader } from "@/components/page-header";
import { requireAttendanceAdmin } from "@/features/attendance/auth";
import {
  getActiveCalculationForEmployeeDate,
  getCalculationRevisionHistory,
} from "@/features/attendance/calculations/queries";
import { formatCompanyDate } from "@/features/attendance/time";
import { getEmployee } from "@/features/employees/queries";

export default async function AttendanceCalculationPage({
  params,
}: {
  params: Promise<{ employeeId: string; attendanceDate: string }>;
}) {
  await requireAttendanceAdmin();
  const { employeeId, attendanceDate } = await params;
  const [employee, active, history] = await Promise.all([
    getEmployee(employeeId),
    getActiveCalculationForEmployeeDate(employeeId, attendanceDate),
    getCalculationRevisionHistory(employeeId, attendanceDate),
  ]);
  if (!employee || !active) notFound();
  return (
    <>
      <PageHeader
        title={`${employee.first_name} ${employee.last_name} calculation`}
        description={`${formatCompanyDate(attendanceDate)} · Immutable attendance calculation history`}
        action={<Link className="btn" href={`/admin/attendance/${employeeId}`}>Back to attendance</Link>}
      />
      <AttendanceCalculationDetails active={active} history={history} />
    </>
  );
}
