import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { OvertimeRecalculationForm } from "@/components/overtime/overtime-recalculation-form";
import { requireAttendanceAdmin } from "@/features/attendance/auth";
import { getActiveAttendanceEmployees } from "@/features/attendance/queries";
import { companyDateAt } from "@/features/attendance/time";
import { recalculateOvertime } from "./actions";

export default async function RecalculateOvertimePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAttendanceAdmin();
  const query = await searchParams;
  const employees = await getActiveAttendanceEmployees();

  return (
    <>
      <PageHeader
        title="Recalculate overtime"
        description="Re-evaluate active finalized attendance against the current holiday calendar and overtime policy."
        action={<Link className="btn" href="/admin/overtime">Back to overtime</Link>}
      />
      {query.success === "completed" && (
        <p className="form-success">Overtime recalculation completed.</p>
      )}
      <OvertimeRecalculationForm
        action={recalculateOvertime}
        employees={employees}
        companyDate={companyDateAt()}
      />
    </>
  );
}
