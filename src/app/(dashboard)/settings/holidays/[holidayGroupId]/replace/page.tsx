import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { HolidayReplacementForm } from "@/components/overtime/holiday-replacement-form";
import { requireAttendanceAdmin } from "@/features/attendance/auth";
import { getHolidayCalendarGroup } from "@/features/overtime/holidays/queries";
import { replaceHoliday } from "../../actions";

export default async function ReplaceHolidayPage({
  params,
}: {
  params: Promise<{ holidayGroupId: string }>;
}) {
  await requireAttendanceAdmin();
  const { holidayGroupId } = await params;
  const result = await getHolidayCalendarGroup(holidayGroupId);
  if (!result.group?.active_version) notFound();

  return (
    <>
      <PageHeader
        title="Replace holiday version"
        description="Create an immutable replacement or deactivation version."
        action={<Link className="btn" href={`/settings/holidays/${holidayGroupId}`}>Back to holiday</Link>}
      />
      <HolidayReplacementForm
        action={replaceHoliday.bind(null, holidayGroupId)}
        activeVersion={result.group.active_version}
      />
    </>
  );
}
