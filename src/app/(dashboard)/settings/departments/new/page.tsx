import { PageHeader } from "@/components/page-header";
import { DepartmentForm } from "@/components/organization/department-form";
import { requireOrganizationAdmin } from "@/features/organization/auth";
import { getActiveEmployeeOptions } from "@/features/organization/queries";
import { createDepartment } from "../actions";

export default async function NewDepartmentPage() {
  await requireOrganizationAdmin();
  const employees = await getActiveEmployeeOptions();
  return <><PageHeader title="Add department" description="Create a department and optionally assign an active employee as its head." /><DepartmentForm action={createDepartment} employees={employees} /></>;
}
