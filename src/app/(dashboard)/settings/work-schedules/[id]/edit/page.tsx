import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ScheduleTemplateForm } from "@/components/schedules/schedule-template-form";
import { requireScheduleAdmin } from "@/features/schedules/auth";
import { getScheduleTemplateDetails } from "@/features/schedules/queries";
import { updateScheduleTemplate } from "../../actions";

export default async function EditWorkSchedulePage({ params }: { params: Promise<{ id: string }> }) {
  await requireScheduleAdmin();
  const { id } = await params;
  const details = await getScheduleTemplateDetails(id);
  if (!details) notFound();
  return <><PageHeader title="Edit schedule information" description="Rule changes require a new effective-dated version." action={<Link className="btn" href={`/settings/work-schedules/${id}`}>Back</Link>} /><ScheduleTemplateForm action={updateScheduleTemplate.bind(null, id)} template={details.template} companyDate={details.companyDate} /></>;
}
