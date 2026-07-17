import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { PayrollAuditTimeline } from "@/components/payroll/payroll-audit-timeline";
import { PayrollPeriodActions } from "@/components/payroll/payroll-period-actions";
import { PayrollPeriodDetailCard } from "@/components/payroll/payroll-period-detail";
import { requirePayrollAdministrator } from "@/features/payroll/auth";
import { getPayrollPeriodDetail } from "@/features/payroll/periods/queries";
export default async function PayrollPeriodPage({ params }: { params: Promise<{ periodId: string }> }) {
  const access = await requirePayrollAdministrator();
  const { periodId } = await params;
  let period;
  try { period = await getPayrollPeriodDetail(periodId); } catch { notFound(); }
  return <div className="payroll-layout"><PageHeader title={period.periodCode} description="Payroll period details, lifecycle controls, and immutable audit history." action={<Link className="btn" href="/payroll/periods">Back to periods</Link>} /><PayrollPeriodDetailCard period={period}/><PayrollPeriodActions period={period} canApprove={access.role === "super_admin"}/><PayrollAuditTimeline events={period.events}/></div>;
}
