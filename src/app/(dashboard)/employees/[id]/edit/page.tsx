import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { EmployeeForm } from "@/components/employees/employee-form";
import { requireHrAdmin } from "@/features/employees/auth";
import { getEmployee, getEmployeeOptions } from "@/features/employees/queries";
import { updateEmployee } from "../../actions";

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  await requireHrAdmin();
  const { id } = await params;
  const employee = await getEmployee(id);
  if (!employee) notFound();
  const options = await getEmployeeOptions({
    departmentId: employee.department_id,
    jobTitleId: employee.job_title_id,
  });
  const action = updateEmployee.bind(null, employee.id);
  return <><PageHeader title="Edit employee" description={`Update ${employee.first_name} ${employee.last_name}'s employee record.`} /><EmployeeForm action={action} departments={options.departments} jobTitles={options.jobTitles} employee={employee} /></>;
}
