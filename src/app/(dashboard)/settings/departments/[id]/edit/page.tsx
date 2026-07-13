import { notFound, redirect } from "next/navigation";
import { DepartmentForm } from "@/components/organization/department-form";
import { PageHeader } from "@/components/page-header";
import { requireOrganizationAdmin } from "@/features/organization/auth";
import { getActiveEmployeeOptions, getDepartment } from "@/features/organization/queries";
import { updateDepartment } from "../../actions";

export default async function EditDepartmentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOrganizationAdmin();
  const { id } = await params;
  const [department, employees] = await Promise.all([getDepartment(id), getActiveEmployeeOptions()]);
  if (!department) notFound();
  if (department.archived_at) redirect(`/settings/departments/${id}`);
  const action = updateDepartment.bind(null, department.id);
  return <><PageHeader title="Edit department" description={`Update ${department.name}'s details and department head.`} /><DepartmentForm action={action} employees={employees} department={department} /></>;
}
