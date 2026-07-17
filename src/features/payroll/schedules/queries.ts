import "server-only";
import { createClient } from "@/lib/supabase/server";
import { normalizePayrollPeriodPreview, normalizePayrollScheduleDetail, normalizePayrollScheduleSummary } from "../normalize";
import type { PayrollPeriodPreview, PayrollScheduleDetail, PayrollScheduleInput, PayrollScheduleSummary } from "../types";

export async function listPayrollSchedules(): Promise<PayrollScheduleSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_payroll_schedules");
  if (error) throw new Error("Unable to load payroll schedules.");
  return (Array.isArray(data) ? data : []).map(normalizePayrollScheduleSummary);
}

export async function getPayrollScheduleDetail(id: string): Promise<PayrollScheduleDetail> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_payroll_schedule_detail", { p_schedule_id: id });
  if (error) throw new Error("Unable to load the payroll schedule.");
  return normalizePayrollScheduleDetail(data);
}

export async function previewPayrollSchedule(input: PayrollScheduleInput): Promise<PayrollPeriodPreview[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("preview_payroll_schedule_periods", {
    p_schedule_type: input.scheduleType,
    p_anchor_date: input.anchorDate,
    p_first_period_end_day: input.firstPeriodEndDay,
    p_cutoff_offset_days: input.cutoffOffsetDays,
    p_payment_offset_days: input.paymentOffsetDays,
    p_from: new Date().toISOString().slice(0, 10),
    p_count: 8,
  });
  if (error) throw new Error("Unable to preview payroll periods.");
  return (Array.isArray(data) ? data : []).map(normalizePayrollPeriodPreview);
}
