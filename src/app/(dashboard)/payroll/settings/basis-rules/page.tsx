import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { PayrollBasisRuleListView } from "@/components/payroll/payroll-basis-rule-list";
import { requirePayrollAdministrator } from "@/features/payroll/auth";
import { listPayrollBasisRules } from "@/features/payroll/calculation/queries";

export default async function PayrollBasisRulesPage() {
  const access = await requirePayrollAdministrator();
  const data = await listPayrollBasisRules();
  return <div className="payroll-layout"><PageHeader title="Payroll basis rules" description="Configure effective-dated monthly salary conversion rules. No preset activates without Super Admin approval." action={<Link className="btn" href="/payroll">Payroll overview</Link>} /><PayrollBasisRuleListView data={data} canApprove={access.role === "super_admin"}/></div>;
}
