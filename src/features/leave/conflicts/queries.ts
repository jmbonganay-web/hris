import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeaveAttendanceConflict, LeaveConflictType } from "../types";

interface LeaveConflictProjectionRow {
  conflict_id: string;
  conflict_type: LeaveConflictType;
  conflict_status: LeaveAttendanceConflict["status"];
  employee_id: string;
  employee_name: string;
  employee_number: string | null;
  leave_type_name: string;
  leave_date: string;
  duration_mode: LeaveAttendanceConflict["durationMode"];
  chargeable_units: string | number;
  attendance_base_status: string | null;
  automatic_balance_action: string | null;
  created_at: string;
  total_count: string | number;
}

export async function getLeaveAttendanceConflicts(
  client: SupabaseClient,
  filters: {
    status?: "open" | "resolved" | "superseded";
    conflictType?: LeaveConflictType;
    employeeId?: string;
    page: number;
    pageSize: number;
  },
): Promise<{ rows: LeaveAttendanceConflict[]; total: number }> {
  const page = Math.max(1, Math.floor(filters.page));
  const pageSize = Math.min(100, Math.max(1, Math.floor(filters.pageSize)));
  const { data, error } = await client.rpc("get_leave_attendance_conflicts", {
    p_status: filters.status ?? "open",
    p_conflict_type: filters.conflictType ?? null,
    p_employee_id: filters.employeeId ?? null,
    p_offset: (page - 1) * pageSize,
    p_limit: pageSize,
  });
  if (error) throw new Error("Unable to load leave-attendance conflicts.");

  const projectionRows = (data ?? []) as LeaveConflictProjectionRow[];
  return {
    rows: projectionRows.map((row) => ({
      conflictId: row.conflict_id,
      conflictType: row.conflict_type,
      status: row.conflict_status,
      employeeId: row.employee_id,
      employeeName: row.employee_name,
      employeeNumber: row.employee_number,
      leaveTypeName: row.leave_type_name,
      leaveDate: row.leave_date,
      durationMode: row.duration_mode,
      chargeableUnits: Number(row.chargeable_units),
      attendanceBaseStatus: row.attendance_base_status,
      automaticBalanceAction: row.automatic_balance_action,
      createdAt: row.created_at,
    })),
    total: Number(projectionRows[0]?.total_count ?? 0),
  };
}
