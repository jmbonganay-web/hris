import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { PayrollExceptionQueue } from "@/components/payroll/payroll-exception-queue";
import { requirePayrollAdministrator } from "@/features/payroll/auth";
import { listPayrollEntryExceptions } from "@/features/payroll/calculation/queries";

export default async function PayrollExceptionsPage({ params }: { params: Promise<{ periodId: string }> }) {
  const access = await requirePayrollAdministrator();
  const { periodId } = await params;
  const items = await listPayrollEntryExceptions(periodId);
  return <div className="payroll-layout"><PageHeader title="Payroll exceptions" description="Review calculation warnings and blockers without exposing payroll amounts." action={<Link className="btn" href={`/payroll/periods/${periodId}/workspace`}>Back to workspace</Link>} /><PayrollExceptionQueue periodId={periodId} items={items} canApprove={access.role === "super_admin"}/></div>;
}
