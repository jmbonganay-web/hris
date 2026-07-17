import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { PayrollScheduleForm } from "@/components/payroll/payroll-schedule-form";
import { PayrollSchedulePreview } from "@/components/payroll/payroll-schedule-preview";
import { requirePayrollAdministrator } from "@/features/payroll/auth";
import { previewPayrollSchedule } from "@/features/payroll/schedules/queries";
import { validatePayrollScheduleInput } from "@/features/payroll/validation";
import type { PayrollPeriodPreview, PayrollScheduleInput } from "@/features/payroll/types";

export default async function NewPayrollSchedulePage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  await requirePayrollAdministrator();
  const params = await searchParams;
  let initialInput: PayrollScheduleInput | undefined;
  let periods: PayrollPeriodPreview[] = [];
  let previewError = "";
  if (params.preview === "1") {
    const checked = validatePayrollScheduleInput(params);
    if (checked.data) {
      initialInput = checked.data;
      try { periods = await previewPayrollSchedule(checked.data); } catch { previewError = "The schedule preview could not be generated."; }
    } else previewError = checked.state?.error ?? "Review the schedule fields.";
  }
  return <div className="payroll-layout"><PageHeader title="New payroll schedule" description="Create a reusable weekly, biweekly, semi-monthly, or monthly schedule." action={<Link className="btn" href="/payroll/schedules">Back to schedules</Link>} /><PayrollScheduleForm initialInput={initialInput}/>{previewError ? <p className="form-error">{previewError}</p> : null}<PayrollSchedulePreview periods={periods}/></div>;
}
