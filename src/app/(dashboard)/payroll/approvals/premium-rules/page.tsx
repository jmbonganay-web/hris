import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { PremiumRuleApprovalList } from "@/components/payroll/premium-rule-approval-list";
import { requirePayrollApprover } from "@/features/payroll/auth";
import { listPremiumRuleApprovals } from "@/features/payroll/premiums/queries";
export default async function PremiumRuleApprovalsPage() {
  await requirePayrollApprover();
  const queue = await listPremiumRuleApprovals();
  return <div className="payroll-layout"><PageHeader title="Premium approvals" description="Approve or reject premium and attendance-deduction policies with effective-date and source controls." action={<Link className="btn" href="/payroll">Payroll overview</Link>}/><PremiumRuleApprovalList queue={queue}/></div>;
}
