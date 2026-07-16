import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { LeaveBalanceSummary } from "../types";

export interface LeaveBalanceProjectionRow {
  employee_id: string;
  leave_type_id: string;
  leave_type_code: string;
  leave_type_name: string;
  leave_year: number;
  is_paid: boolean;
  is_balance_tracked: boolean;
  allocated_units: string | number;
  carryover_units: string | number;
  adjustment_units: string | number;
  approved_used_units: string | number;
  pending_reserved_units: string | number;
  available_units: string | number | null;
  expiring_units: string | number;
  expires_on: string | null;
}

export function mapLeaveBalance(row: LeaveBalanceProjectionRow): LeaveBalanceSummary {
  return {
    employeeId: row.employee_id,
    leaveTypeId: row.leave_type_id,
    leaveTypeCode: row.leave_type_code,
    leaveTypeName: row.leave_type_name,
    leaveYear: Number(row.leave_year),
    isPaid: row.is_paid,
    isBalanceTracked: row.is_balance_tracked,
    allocatedUnits: Number(row.allocated_units),
    carryoverUnits: Number(row.carryover_units),
    adjustmentUnits: Number(row.adjustment_units),
    usedUnits: Number(row.approved_used_units),
    pendingUnits: Number(row.pending_reserved_units),
    availableUnits: row.available_units === null ? null : Number(row.available_units),
    expiringUnits: Number(row.expiring_units),
    expiresOn: row.expires_on,
  };
}

export async function getMyLeaveBalances(leaveYear: number): Promise<LeaveBalanceSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_leave_balances", { p_leave_year: leaveYear });
  if (error) throw new Error("Unable to load leave balances.");
  return ((data ?? []) as LeaveBalanceProjectionRow[]).map(mapLeaveBalance);
}

export async function getAdminLeaveBalances(input: {
  leaveYear: number;
  employeeId?: string | null;
  leaveTypeId?: string | null;
}): Promise<LeaveBalanceSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_admin_leave_balances", {
    p_leave_year: input.leaveYear,
    p_employee_id: input.employeeId ?? null,
    p_leave_type_id: input.leaveTypeId ?? null,
  });
  if (error) throw new Error("Unable to load employee leave balances.");
  return ((data ?? []) as LeaveBalanceProjectionRow[]).map(mapLeaveBalance);
}

export async function previewLeaveYearOpening(leaveYear: number) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("preview_leave_year_opening", { p_leave_year: leaveYear });
  if (error) throw new Error("Unable to preview leave-year generation.");
  return data ?? [];
}
