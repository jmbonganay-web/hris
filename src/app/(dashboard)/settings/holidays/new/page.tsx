import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { HolidayForm } from "@/components/overtime/holiday-form";
import { requireAttendanceAdmin } from "@/features/attendance/auth";
import { companyDateAt } from "@/features/attendance/time";
import { createHoliday } from "../actions";

export default async function NewHolidayPage() {
  await requireAttendanceAdmin();
  return (
    <>
      <PageHeader
        title="Create holiday"
        description="Create the first immutable version for a holiday calendar entry."
        action={<Link className="btn" href="/settings/holidays">Back to holidays</Link>}
      />
      <HolidayForm action={createHoliday} companyDate={companyDateAt()} />
    </>
  );
}
