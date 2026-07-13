import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { SensitiveDetailsForm } from "@/components/employees/profile/sensitive-details-form";
import { requireSensitiveEmployeeManager } from "@/features/employees/sensitive/auth";
import { getMaskedSensitiveDetails } from "@/features/employees/sensitive/queries";
import { getEmployee } from "@/features/employees/queries";
import { updateSensitiveDetails } from "../../sensitive-actions";

export default async function EditSensitiveEmployeeDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  await requireSensitiveEmployeeManager(id);
  const [employee, details] = await Promise.all([
    getEmployee(id),
    getMaskedSensitiveDetails(id),
  ]);
  if (!employee) notFound();

  return (
    <>
      <PageHeader
        title="Edit government & payroll details"
        description={`Update protected HR data for ${employee.first_name} ${employee.last_name}.`}
      />
      <SensitiveDetailsForm
        employeeId={id}
        details={details}
        action={updateSensitiveDetails.bind(null, id)}
      />
    </>
  );
}
