import "server-only";
import { createClient } from "@/lib/supabase/server";
import { normalizePayrollPeriodDetail, normalizePayrollPeriodList } from "../normalize";
import type { PayrollPeriodDetail, PayrollPeriodFilters, PayrollPeriodListResult } from "../types";

export async function listPayrollPeriods(filters: PayrollPeriodFilters): Promise<PayrollPeriodListResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_payroll_periods", {
    p_schedule_id: filters.scheduleId ?? null,
    p_status: filters.status ?? null,
    p_year: filters.year ?? null,
    p_from: filters.from ?? null,
    p_to: filters.to ?? null,
    p_page: filters.page ?? 1,
    p_page_size: 25,
  });
  if (error) throw new Error("Unable to load payroll periods.");
  return normalizePayrollPeriodList(data);
}

export async function getPayrollPeriodDetail(id: string): Promise<PayrollPeriodDetail> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_payroll_period_detail", { p_period_id: id });
  if (error) throw new Error("Unable to load the payroll period.");
  return normalizePayrollPeriodDetail(data);
}
