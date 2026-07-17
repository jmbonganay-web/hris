import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { PayrollScheduleForm } from "@/components/payroll/payroll-schedule-form";
import { PayrollSchedulePreview } from "@/components/payroll/payroll-schedule-preview";
import { ScheduleActiveForm } from "@/components/payroll/schedule-active-form";
import { requirePayrollAdministrator } from "@/features/payroll/auth";
import { getPayrollScheduleDetail } from "@/features/payroll/schedules/queries";

export default async function PayrollScheduleDetailPage({ params }: { params: Promise<{ scheduleId: string }> }) {
  await requirePayrollAdministrator();
  const { scheduleId } = await params;
  let schedule;
  try { schedule = await getPayrollScheduleDetail(scheduleId); } catch { notFound(); }
  return <div className="payroll-layout"><PageHeader title={schedule.name} description={`${schedule.code} · ${schedule.currencyCode} · ${schedule.timezone}`} action={<Link className="btn" href="/payroll/schedules">Back to schedules</Link>} /><PayrollScheduleForm schedule={schedule}/><ScheduleActiveForm schedule={schedule}/><PayrollSchedulePreview periods={schedule.upcomingPeriods}/></div>;
}
