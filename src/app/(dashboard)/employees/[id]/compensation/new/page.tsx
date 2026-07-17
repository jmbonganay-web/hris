import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { CompensationForm } from "@/components/payroll/compensation-form";
import { requireEmployeeProfileManager } from "@/features/employees/auth";
import { getEmployeeCompensationAdmin } from "@/features/payroll/compensation/queries";
export default async function NewCompensationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireEmployeeProfileManager(id);
  let detail;
  try { detail = await getEmployeeCompensationAdmin(id); } catch { notFound(); }
  return <div className="payroll-layout"><PageHeader title={`New compensation · ${detail.employee.fullName}`} description="Create a draft for HR review and Super Admin approval." action={<Link className="btn" href={`/employees/${id}/compensation`}>Back to compensation</Link>} /><CompensationForm employeeId={id} currencyCode={detail.currencyCode} companyDate={detail.companyDate} suggestedEffectiveDate={detail.suggestedNextEffectiveDate}/></div>;
}
