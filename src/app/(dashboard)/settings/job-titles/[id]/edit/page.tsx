import { notFound, redirect } from "next/navigation";
import { JobTitleForm } from "@/components/organization/job-title-form";
import { PageHeader } from "@/components/page-header";
import { requireOrganizationAdmin } from "@/features/organization/auth";
import { getActiveDepartmentOptions, getJobTitle } from "@/features/organization/queries";
import { updateJobTitle } from "../../actions";

export default async function EditJobTitlePage({ params }: { params: Promise<{ id: string }> }) {
  await requireOrganizationAdmin();
  const { id } = await params;
  const jobTitle = await getJobTitle(id);
  if (!jobTitle) notFound();
  const departments = await getActiveDepartmentOptions(jobTitle.department_id);
  if (jobTitle.archived_at) redirect(`/settings/job-titles/${id}`);
  const action = updateJobTitle.bind(null, jobTitle.id);
  return <><PageHeader title="Edit job title" description={`Update ${jobTitle.title}'s department, description, and availability.`} /><JobTitleForm action={action} departments={departments} jobTitle={jobTitle} /></>;
}
