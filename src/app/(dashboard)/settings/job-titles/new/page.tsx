import { PageHeader } from "@/components/page-header";
import { JobTitleForm } from "@/components/organization/job-title-form";
import { requireOrganizationAdmin } from "@/features/organization/auth";
import { getActiveDepartmentOptions } from "@/features/organization/queries";
import { createJobTitle } from "../actions";

export default async function NewJobTitlePage() {
  await requireOrganizationAdmin();
  const departments = await getActiveDepartmentOptions();
  return <><PageHeader title="Add job title" description="Create a role and optionally scope it to one active department." /><JobTitleForm action={createJobTitle} departments={departments} /></>;
}
