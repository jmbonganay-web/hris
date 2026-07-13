import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { EmergencyContactForm } from "@/components/employees/profile/emergency-contact-form";
import { requireEmployeeProfileManager } from "@/features/employees/auth";
import { getEmployee } from "@/features/employees/queries";
import { createEmergencyContact } from "../../profile-actions";

export default async function NewEmergencyContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireEmployeeProfileManager(id);
  const employee = await getEmployee(id);
  if (!employee) notFound();
  return <><PageHeader title="Add emergency contact" description={`Add a contact for ${employee.first_name} ${employee.last_name}.`} /><EmergencyContactForm employeeId={id} action={createEmergencyContact.bind(null, id)} /></>;
}
