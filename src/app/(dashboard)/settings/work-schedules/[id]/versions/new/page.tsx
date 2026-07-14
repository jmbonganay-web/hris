import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ScheduleVersionForm } from "@/components/schedules/schedule-version-form";
import { requireScheduleAdmin } from "@/features/schedules/auth";
import { getScheduleTemplateDetails } from "@/features/schedules/queries";
import { createScheduleVersion } from "../../../actions";

export default async function NewScheduleVersionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireScheduleAdmin();
  const { id } = await params;
  const details = await getScheduleTemplateDetails(id);
  if (!details) notFound();
  return <><PageHeader title={`New version · ${details.template.name}`} description="Create immutable rules that take effect on the selected date." action={<Link className="btn" href={`/settings/work-schedules/${id}`}>Back</Link>} /><ScheduleVersionForm action={createScheduleVersion.bind(null, id)} companyDate={details.companyDate} /></>;
}
