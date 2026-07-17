import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { PayrollApprovalList } from "@/components/payroll/payroll-approval-list";
import { requirePayrollApprover } from "@/features/payroll/auth";
import { listPayrollApprovals } from "@/features/payroll/approvals/queries";
export default async function PayrollApprovalsPage() {
  await requirePayrollApprover();
  const queue = await listPayrollApprovals();
  return <div className="payroll-layout"><PageHeader title="Payroll approvals" description="Approve or reject compensation and payroll schedule changes with full audit controls." action={<Link className="btn" href="/payroll">Payroll overview</Link>} /><PayrollApprovalList queue={queue}/></div>;
}
