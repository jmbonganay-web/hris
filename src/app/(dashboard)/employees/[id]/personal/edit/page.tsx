import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { PersonalDetailsForm } from "@/components/employees/profile/personal-details-form";
import { requireEmployeeProfileManager } from "@/features/employees/auth";
import { getEmployee } from "@/features/employees/queries";
import { getEmployeePersonalDetails } from "@/features/employees/profile-queries";
import { updatePersonalDetails } from "../../profile-actions";

export default async function EditPersonalDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireEmployeeProfileManager(id);
  const [employee, details] = await Promise.all([getEmployee(id), getEmployeePersonalDetails(id)]);
  if (!employee) notFound();
  return <><PageHeader title="Edit personal information" description={`Update private personal details for ${employee.first_name} ${employee.last_name}.`} /><PersonalDetailsForm employeeId={id} details={details} action={updatePersonalDetails.bind(null, id)} /></>;
}
