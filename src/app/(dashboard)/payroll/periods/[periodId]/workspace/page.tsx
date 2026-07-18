import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { PayrollCalculationWorkspaceView } from "@/components/payroll/payroll-calculation-workspace";
import { requirePayrollAdministrator } from "@/features/payroll/auth";
import { getPayrollCalculationWorkspace } from "@/features/payroll/calculation/queries";

export default async function PayrollCalculationWorkspacePage({ params }: { params: Promise<{ periodId: string }> }) {
  await requirePayrollAdministrator();
  const { periodId } = await params;
  let workspace;
  try { workspace = await getPayrollCalculationWorkspace(periodId); } catch { notFound(); }
  return <div className="payroll-layout"><PageHeader title={`${workspace.period.periodCode} workspace`} description={`${workspace.period.scheduleName} · ${workspace.period.currencyCode} · Calculate, review exceptions, and prepare the period for review.`} action={<div className="header-actions"><Link className="btn" href={`/payroll/periods/${periodId}`}>Period details</Link><Link className="btn" href="/payroll/periods">All periods</Link></div>} /><PayrollCalculationWorkspaceView workspace={workspace}/></div>;
}
