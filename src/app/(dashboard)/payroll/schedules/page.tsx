import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { PayrollScheduleList } from "@/components/payroll/payroll-schedule-list";
import { requirePayrollAdministrator } from "@/features/payroll/auth";
import { listPayrollSchedules } from "@/features/payroll/schedules/queries";

export default async function PayrollSchedulesPage() {
  await requirePayrollAdministrator();
  const schedules = await listPayrollSchedules();
  return <div className="payroll-layout"><PageHeader title="Payroll schedules" description="Configure payroll frequency, cutoff timing, payment dates, and rolling generation." action={<div className="header-actions"><Link className="btn" href="/payroll">Payroll overview</Link><Link className="btn primary" href="/payroll/schedules/new">New schedule</Link></div>} /><PayrollScheduleList schedules={schedules}/></div>;
}
