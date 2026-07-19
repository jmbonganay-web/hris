import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { PremiumRuleList } from "@/components/payroll/premium-rule-list";
import { requirePayrollAdministrator } from "@/features/payroll/auth";
import { listPremiumRuleSets } from "@/features/payroll/premiums/queries";
export default async function PremiumRulesPage() {
  await requirePayrollAdministrator();
  const data = await listPremiumRuleSets();
  return <div className="payroll-layout"><PageHeader title="Premium rules" description="Manage effective-dated overtime, rest-day, holiday, combined-day, and night-differential policies." action={<Link className="btn" href="/payroll">Payroll overview</Link>}/><PremiumRuleList data={data}/></div>;
}
