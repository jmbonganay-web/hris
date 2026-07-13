import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { EmergencyContactForm } from "@/components/employees/profile/emergency-contact-form";
import { requireEmployeeProfileManager } from "@/features/employees/auth";
import { getEmployee } from "@/features/employees/queries";
import { getEmergencyContact } from "@/features/employees/profile-queries";
import { updateEmergencyContact } from "../../../profile-actions";

export default async function EditEmergencyContactPage({ params }: { params: Promise<{ id: string; contactId: string }> }) {
  const { id, contactId } = await params;
  await requireEmployeeProfileManager(id);
  const [employee, contact] = await Promise.all([getEmployee(id), getEmergencyContact(id, contactId)]);
  if (!employee || !contact) notFound();
  return <><PageHeader title="Edit emergency contact" description={`Update ${contact.full_name}'s contact information.`} /><EmergencyContactForm employeeId={id} contact={contact} action={updateEmergencyContact.bind(null, id, contactId)} /></>;
}
