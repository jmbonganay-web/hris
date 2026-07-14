import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { RecalculateAttendanceForm } from "@/components/attendance/recalculate-attendance-form";
import { requireAttendanceAdmin } from "@/features/attendance/auth";
import { getActiveAttendanceEmployees } from "@/features/attendance/queries";
import { companyDateAt } from "@/features/attendance/time";
import { recalculateAttendance } from "./actions";

export default async function RecalculateAttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAttendanceAdmin();
  const query = await searchParams;
  const employees = await getActiveAttendanceEmployees();
  return (
    <>
      <PageHeader title="Recalculate attendance" description="Create new immutable calculation revisions from corrected source data." action={<Link className="btn" href="/admin/attendance">Back to attendance</Link>} />
      {query.success === "completed" && <p className="form-success">Attendance recalculation completed.</p>}
      <RecalculateAttendanceForm action={recalculateAttendance} employees={employees} companyDate={companyDateAt()} />
    </>
  );
}
