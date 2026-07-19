import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { PremiumRuleDetail } from "@/components/payroll/premium-rule-detail";
import { PremiumRuleForm } from "@/components/payroll/premium-rule-form";
import { requirePayrollAdministrator } from "@/features/payroll/auth";
import { getPremiumRuleSetDetail, previewPremiumRuleCoverage, listPremiumRuleSets } from "@/features/payroll/premiums/queries";
export default async function PremiumRuleDetailPage({ params }: { params: Promise<{ ruleSetId: string }> }) {
  const access = await requirePayrollAdministrator();
  const { ruleSetId } = await params;
  const [rule, coverage, options] = await Promise.all([getPremiumRuleSetDetail(ruleSetId), previewPremiumRuleCoverage(ruleSetId), listPremiumRuleSets()]);
  if (!rule) notFound();
  return <div className="payroll-layout"><PageHeader title="Premium rule detail" description="Review the exact effective-dated calculation matrix and its audit state." action={<Link className="btn" href="/payroll/settings/premium-rules">Premium rules</Link>}/>{rule.status === "draft" ? <PremiumRuleForm data={options} initialRule={rule}/> : null}<PremiumRuleDetail rule={rule} coverage={coverage} canApprove={access.role === "super_admin"}/></div>;
}
