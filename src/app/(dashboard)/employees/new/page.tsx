import { PageHeader } from "@/components/page-header";
import { EmployeeForm } from "@/components/employees/employee-form";
import { requireHrAdmin } from "@/features/employees/auth";
import { getEmployeeOptions } from "@/features/employees/queries";
import { createEmployee } from "../actions";

export default async function NewEmployeePage() {
  await requireHrAdmin();
  const { departments, jobTitles } = await getEmployeeOptions();
  return <><PageHeader title="Add employee" description="Create a new employee record for your organization." /><EmployeeForm action={createEmployee} departments={departments} jobTitles={jobTitles} /></>;
}
