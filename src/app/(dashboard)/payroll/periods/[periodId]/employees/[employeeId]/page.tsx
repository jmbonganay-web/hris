import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { PayrollEmployeeCalculationDetailView } from "@/components/payroll/payroll-employee-calculation-detail";
import { requirePayrollAdministrator } from "@/features/payroll/auth";
import { getPayrollEmployeeCalculationDetail } from "@/features/payroll/calculation/queries";

export default async function PayrollEmployeeCalculationPage({ params }: { params: Promise<{ periodId: string; employeeId: string }> }) {
  await requirePayrollAdministrator();
  const { periodId, employeeId } = await params;
  let detail;
  try { detail = await getPayrollEmployeeCalculationDetail(periodId, employeeId); } catch { notFound(); }
  return <div className="payroll-layout"><PageHeader title={detail.employee.fullName || "Employee payroll"} description="Versioned employee payroll calculation, daily breakdown, source snapshots, and exceptions." action={<Link className="btn" href={`/payroll/periods/${periodId}/workspace`}>Back to workspace</Link>} /><PayrollEmployeeCalculationDetailView periodId={periodId} detail={detail}/></div>;
}
