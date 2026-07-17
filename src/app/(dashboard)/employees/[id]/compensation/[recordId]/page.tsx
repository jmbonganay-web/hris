import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { CompensationForm } from "@/components/payroll/compensation-form";
import { requireEmployeeProfileManager } from "@/features/employees/auth";
import { getEmployeeCompensationAdmin } from "@/features/payroll/compensation/queries";
export default async function EditCompensationPage({ params }: { params: Promise<{ id: string; recordId: string }> }) {
  const { id, recordId } = await params;
  await requireEmployeeProfileManager(id);
  const detail = await getEmployeeCompensationAdmin(id);
  const record = detail.requests.find((item) => item.id === recordId && (item.status === "draft" || item.status === "rejected"));
  if (!record) notFound();
  return <div className="payroll-layout"><PageHeader title={`Edit compensation · ${detail.employee.fullName}`} description="Revise this draft or rejected request before submitting it for approval." action={<Link className="btn" href={`/employees/${id}/compensation`}>Back to compensation</Link>} /><CompensationForm employeeId={id} currencyCode={detail.currencyCode} companyDate={detail.companyDate} suggestedEffectiveDate={detail.suggestedNextEffectiveDate} record={record}/></div>;
}
