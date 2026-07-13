import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ManagerForm } from "@/components/employees/profile/manager-form";
import { requireEmployeeProfileManager } from "@/features/employees/auth";
import { getEmployee } from "@/features/employees/queries";
import { getManagerOptions } from "@/features/employees/profile-queries";
import { updateManager } from "../../profile-actions";

export default async function EditManagerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireEmployeeProfileManager(id);
  const employee = await getEmployee(id);
  if (!employee) notFound();
  const managers = await getManagerOptions(id, employee.manager_id);
  return <><PageHeader title="Assign manager" description={`Manage the reporting relationship for ${employee.first_name} ${employee.last_name}.`} /><ManagerForm employee={employee} managers={managers} action={updateManager.bind(null, id)} /></>;
}
