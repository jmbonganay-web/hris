import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { PayrollMissingSetupList } from "@/components/payroll/payroll-missing-setup-list";
import { PayrollSummaryCards } from "@/components/payroll/payroll-summary-cards";
import { CompensationSummary } from "@/components/payroll/compensation-summary";
import { requirePayrollViewer } from "@/features/payroll/auth";
import { getPayrollOverview } from "@/features/payroll/queries";

export default async function PayrollPage() {
  const access = await requirePayrollViewer();
  const overview = await getPayrollOverview();

  if (!access.canAdminister) {
    return <div className="payroll-layout"><PageHeader title="Payroll" description="View your current compensation and payroll schedule." action={<Link className="btn primary" href="/me/compensation">My compensation</Link>} />{overview.ownCompensation ? <CompensationSummary detail={overview.ownCompensation} /> : <div className="card empty">Your current payroll setup is not available yet.</div>}</div>;
  }

  return <div className="payroll-layout"><PageHeader title="Payroll" description="Manage payroll schedules, periods, calculation rules, compensation setup, and approvals." action={<div className="header-actions"><Link className="btn" href="/payroll/schedules">Schedules</Link><Link className="btn" href="/payroll/periods">Periods</Link><Link className="btn" href="/payroll/settings/basis-rules">Basis rules</Link><Link className="btn" href="/payroll/settings/premium-rules">Premium rules</Link><Link className="btn" href="/payroll/settings/attendance-deduction-rules">Attendance deductions</Link>{access.canApprove ? <><Link className="btn" href="/payroll/approvals">Approvals</Link><Link className="btn primary" href="/payroll/approvals/premium-rules">Premium approvals</Link></> : null}</div>} /><div className="payroll-overview-grid"><PayrollSummaryCards overview={overview} /><PayrollMissingSetupList employees={overview.missingEmployees} /></div></div>;
}
