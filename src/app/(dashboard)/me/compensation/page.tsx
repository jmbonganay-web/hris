import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { CompensationSummary } from "@/components/payroll/compensation-summary";
import { requirePayrollViewer } from "@/features/payroll/auth";
import { getOwnCompensation } from "@/features/payroll/compensation/queries";
export default async function MyCompensationPage() {
  await requirePayrollViewer();
  const detail = await getOwnCompensation();
  return <div className="payroll-layout"><PageHeader title="My compensation" description="View only your currently effective approved compensation and payroll schedule." action={<Link className="btn" href="/payroll">Payroll overview</Link>} /><CompensationSummary detail={detail}/><div className="card"><p className="muted">Only your current approved payroll information is displayed on this page.</p></div></div>;
}
