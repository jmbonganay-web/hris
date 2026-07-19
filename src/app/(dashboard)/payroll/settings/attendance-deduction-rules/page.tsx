import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { AttendanceDeductionRuleList } from "@/components/payroll/attendance-deduction-rule-list";
import { requirePayrollAdministrator } from "@/features/payroll/auth";
import { listAttendanceDeductionRules, listPremiumRuleSets } from "@/features/payroll/premiums/queries";
export default async function AttendanceDeductionRulesPage() {
  const access = await requirePayrollAdministrator();
  const [rules, options] = await Promise.all([listAttendanceDeductionRules(), listPremiumRuleSets()]);
  return <div className="payroll-layout"><PageHeader title="Attendance deduction rules" description="Configure effective-dated late and undertime grace and rounding policies." action={<Link className="btn" href="/payroll">Payroll overview</Link>}/><AttendanceDeductionRuleList rules={rules} options={options} canApprove={access.role === "super_admin"}/></div>;
}
