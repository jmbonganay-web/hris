import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  normalizePayrollBasisRuleList,
  normalizePayrollCalculationWorkspace,
  normalizePayrollEmployeeCalculationDetail,
  normalizePayrollExceptionList,
} from "../normalize.ts";
import type {
  PayrollBasisRuleList,
  PayrollCalculationRun,
  PayrollCalculationWorkspace,
  PayrollEmployeeCalculationDetail,
  PayrollEntryException,
} from "../types.ts";

export async function listPayrollBasisRules(): Promise<PayrollBasisRuleList> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_payroll_basis_rules");
  if (error) throw new Error("Unable to load payroll basis rules.");
  return normalizePayrollBasisRuleList(data);
}

export async function getPayrollCalculationWorkspace(
  payrollPeriodId: string,
): Promise<PayrollCalculationWorkspace> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_payroll_calculation_workspace", {
    p_payroll_period_id: payrollPeriodId,
  });
  if (error) throw new Error("Unable to load payroll calculation workspace.");
  return normalizePayrollCalculationWorkspace(data);
}

export async function getPayrollEmployeeCalculationDetail(
  payrollPeriodId: string,
  employeeId: string,
): Promise<PayrollEmployeeCalculationDetail> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_payroll_employee_calculation_detail", {
    p_payroll_period_id: payrollPeriodId,
    p_employee_id: employeeId,
  });
  if (error) throw new Error("Unable to load the employee payroll calculation.");
  return normalizePayrollEmployeeCalculationDetail(data);
}

export async function listPayrollEntryExceptions(
  payrollPeriodId: string,
): Promise<PayrollEntryException[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_payroll_entry_exceptions", {
    p_payroll_period_id: payrollPeriodId,
  });
  if (error) throw new Error("Unable to load payroll calculation exceptions.");
  return normalizePayrollExceptionList(data);
}

export async function listPayrollCalculationRuns(
  payrollPeriodId: string,
): Promise<PayrollCalculationRun[]> {
  const workspace = await getPayrollCalculationWorkspace(payrollPeriodId);
  return workspace.runs;
}
