import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { ScheduleTemplateForm } from "@/components/schedules/schedule-template-form";
import { companyDateAt } from "@/features/attendance/time";
import { requireScheduleAdmin } from "@/features/schedules/auth";
import { createScheduleTemplate } from "../actions";

export default async function NewWorkSchedulePage() {
  await requireScheduleAdmin();
  return <><PageHeader title="Create work schedule" description="Create a reusable template and its initial effective-dated rules." action={<Link className="btn" href="/settings/work-schedules">Back</Link>} /><ScheduleTemplateForm action={createScheduleTemplate} includeInitialVersion companyDate={companyDateAt()} /></>;
}
