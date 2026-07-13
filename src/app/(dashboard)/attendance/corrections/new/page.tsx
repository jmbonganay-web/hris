import { notFound } from "next/navigation";
import { CorrectionRequestForm } from "@/components/attendance/correction-request-form";
import { PageHeader } from "@/components/page-header";
import { requireAttendanceEmployee } from "@/features/attendance/auth";
import { companyDateAt, effectiveAttendanceStatus } from "@/features/attendance/time";
import type { AttendanceRecord } from "@/features/attendance/types";

function value(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] : input ?? "";
}

export default async function NewAttendanceCorrectionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const recordId = value(query.record);
  const requestedDate = value(query.date);
  const { supabase, employee } = await requireAttendanceEmployee();
  const companyDate = companyDateAt();
  let initialRecord: AttendanceRecord | null = null;

  if (recordId) {
    const { data, error } = await supabase
      .from("attendance_records")
      .select("id,employee_id,attendance_date,clock_in_at,clock_out_at,clock_in_note,clock_out_note,status,is_corrected,last_corrected_at,last_corrected_by,last_correction_reason,created_by,created_at,updated_at")
      .eq("id", recordId)
      .eq("employee_id", employee.id)
      .maybeSingle();

    if (error || !data) notFound();
    initialRecord = {
      ...(data as unknown as Omit<AttendanceRecord, "effective_status">),
      effective_status: effectiveAttendanceStatus(data as unknown as Omit<AttendanceRecord, "effective_status">, companyDate),
    };
  }

  const initialDate = initialRecord?.attendance_date
    || (/^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : companyDate);

  return (
    <>
      <PageHeader
        title="Request attendance correction"
        description="Submit an attendance change for HR review. Times are interpreted in Asia/Manila."
      />
      <CorrectionRequestForm initialDate={initialDate} initialRecord={initialRecord} />
    </>
  );
}
