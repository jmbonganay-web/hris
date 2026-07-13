import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { EmploymentDetailsForm } from "@/components/employees/profile/employment-details-form";
import { requireEmployeeProfileManager } from "@/features/employees/auth";
import { getEmployee, getEmployeeOptions } from "@/features/employees/queries";
import { updateEmploymentDetails } from "../../profile-actions";

export default async function EditEmploymentDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireEmployeeProfileManager(id);
  const employee = await getEmployee(id);
  if (!employee) notFound();
  const options = await getEmployeeOptions({ departmentId: employee.department_id, jobTitleId: employee.job_title_id });
  return <><PageHeader title="Edit employment information" description={`Update ${employee.first_name} ${employee.last_name}'s company record.`} /><EmploymentDetailsForm employee={employee} departments={options.departments} jobTitles={options.jobTitles} action={updateEmploymentDetails.bind(null, id)} /></>;
}
