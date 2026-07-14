import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminAttendanceForm } from "@/components/attendance/admin-attendance-form";
import { PageHeader } from "@/components/page-header";
import { requireAttendanceAdmin } from "@/features/attendance/auth";
import { getAttendanceRecord } from "@/features/attendance/queries";
import { getEmployee } from "@/features/employees/queries";
import { correctAttendanceByHr } from "../../../../../../attendance/actions";

export default async function EditAdminAttendancePage({
  params,
}: {
  params: Promise<{ employeeId: string; recordId: string }>;
}) {
  await requireAttendanceAdmin();
  const { employeeId, recordId } = await params;
  const [employee, record] = await Promise.all([
    getEmployee(employeeId),
    getAttendanceRecord(employeeId, recordId),
  ]);

  if (!employee || !record) notFound();

  return (
    <>
      <PageHeader
        title="Correct attendance"
        description={`Update ${employee.first_name} ${employee.last_name}'s official attendance record.`}
        action={<Link className="btn" href={`/admin/attendance/${employee.id}`}>Back to employee attendance</Link>}
      />
      <AdminAttendanceForm
        employeeId={employee.id}
        action={correctAttendanceByHr.bind(null, employee.id, record.id)}
        initialRecord={record}
        submitLabel="Save correction"
      />
    </>
  );
}
