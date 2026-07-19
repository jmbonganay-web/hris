import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { PremiumRuleForm } from "@/components/payroll/premium-rule-form";
import { requirePayrollAdministrator } from "@/features/payroll/auth";
import { listPremiumRuleSets } from "@/features/payroll/premiums/queries";
export default async function NewPremiumRulePage({ searchParams }: { searchParams: Promise<{ preset?: string }> }) {
  await requirePayrollAdministrator();
  const [data, params] = await Promise.all([listPremiumRuleSets(), searchParams]);
  return <div className="payroll-layout"><PageHeader title="Create premium rule" description="Review every multiplier, time window, rounding rule, scope, effective date, and legal source before submission." action={<Link className="btn" href="/payroll/settings/premium-rules">Back to premium rules</Link>}/><PremiumRuleForm data={data} presetCode={params.preset}/></div>;
}
