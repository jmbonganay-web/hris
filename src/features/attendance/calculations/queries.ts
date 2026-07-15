import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { AttendanceEmployeeSummary } from "../types";
import type {
  ActiveAttendanceCalculation,
  FinalizationRun,
  HrAttendanceCalculationRevision,
} from "./types";

const activeRevisionSelect = `
  id,calculation_group_id,revision_number,attendance_record_id,
  schedule_assignment_id,schedule_version_id,policy_version_id,
  holiday_version_id,holiday_name,holiday_type,is_holiday,
  base_status,is_provisional,scheduled_start_at,scheduled_end_at,
  scheduled_minutes,actual_clock_in_at,actual_clock_out_at,
  worked_minutes,late_minutes,undertime_minutes,is_late,is_undertime,
  is_corrected,is_recalculated,calculation_source,calculated_at,
  schedule_version:work_schedule_versions!attendance_calculation_revisions_schedule_version_id_fkey(
    template:work_schedule_templates!work_schedule_versions_schedule_template_id_fkey(code,name)
  )
`;

const historySelect = `
  id,calculation_group_id,revision_number,attendance_record_id,
  schedule_assignment_id,schedule_version_id,policy_version_id,
  holiday_version_id,holiday_name,holiday_type,is_holiday,
  base_status,is_provisional,scheduled_start_at,scheduled_end_at,
  scheduled_minutes,actual_clock_in_at,actual_clock_out_at,
  worked_minutes,late_minutes,undertime_minutes,is_late,is_undertime,
  is_corrected,is_recalculated,calculation_source,calculated_by,
  calculated_at,recalculation_reason,
  calculator:profiles!attendance_calculation_revisions_calculated_by_fkey(
    id,display_name,first_name,last_name
  )
`;

function mapSafeRow(row: Record<string, unknown>): ActiveAttendanceCalculation {
  return {
    id: String(row.revision_id ?? row.id),
    calculation_group_id: String(row.calculation_group_id),
    revision_number: Number(row.revision_number),
    employee_id: String(row.employee_id),
    attendance_date: String(row.attendance_date),
    attendance_record_id: row.attendance_record_id ? String(row.attendance_record_id) : null,
    schedule_assignment_id: row.schedule_assignment_id ? String(row.schedule_assignment_id) : null,
    schedule_version_id: row.schedule_version_id ? String(row.schedule_version_id) : null,
    policy_version_id: row.policy_version_id ? String(row.policy_version_id) : null,
    holiday_version_id: row.holiday_version_id ? String(row.holiday_version_id) : null,
    holiday_name: row.holiday_name ? String(row.holiday_name) : null,
    holiday_type: row.holiday_type
      ? (String(row.holiday_type) as ActiveAttendanceCalculation["holiday_type"])
      : null,
    is_holiday: Boolean(row.is_holiday),
    base_status: row.base_status as ActiveAttendanceCalculation["base_status"],
    is_provisional: Boolean(row.is_provisional),
    scheduled_start_at: row.scheduled_start_at ? String(row.scheduled_start_at) : null,
    scheduled_end_at: row.scheduled_end_at ? String(row.scheduled_end_at) : null,
    scheduled_minutes: row.scheduled_minutes == null ? null : Number(row.scheduled_minutes),
    actual_clock_in_at: row.actual_clock_in_at ? String(row.actual_clock_in_at) : null,
    actual_clock_out_at: row.actual_clock_out_at ? String(row.actual_clock_out_at) : null,
    worked_minutes: row.worked_minutes == null ? null : Number(row.worked_minutes),
    late_minutes: row.late_minutes == null ? null : Number(row.late_minutes),
    undertime_minutes: row.undertime_minutes == null ? null : Number(row.undertime_minutes),
    is_late: Boolean(row.is_late),
    is_undertime: Boolean(row.is_undertime),
    is_corrected: Boolean(row.is_corrected),
    is_recalculated: Boolean(row.is_recalculated),
    calculation_source: row.calculation_source as ActiveAttendanceCalculation["calculation_source"],
    calculated_at: String(row.calculated_at),
    schedule_code: row.schedule_code ? String(row.schedule_code) : null,
    schedule_name: row.schedule_name ? String(row.schedule_name) : null,
  };
}

function mapGroup(row: Record<string, unknown>): ActiveAttendanceCalculation | null {
  const revision = row.active_revision as Record<string, unknown> | null;
  if (!revision) return null;
  const scheduleVersion = revision.schedule_version as Record<string, unknown> | null;
  const template = scheduleVersion?.template as Record<string, unknown> | null;
  return mapSafeRow({
    ...revision,
    revision_id: revision.id,
    employee_id: row.employee_id,
    attendance_date: row.attendance_date,
    schedule_code: template?.code ?? null,
    schedule_name: template?.name ?? null,
  });
}

export async function getOwnActiveCalculations(params: {
  employeeId: string;
  fromDate?: string;
  toDate?: string;
}): Promise<Map<string, ActiveAttendanceCalculation>> {
  const supabase = await createClient();
  const fromDate = params.fromDate?.trim() || null;
  const toDate = params.toDate?.trim() || null;
  const { data, error } = await supabase.rpc("get_my_attendance_calculations", {
    p_from_date: fromDate,
    p_to_date: toDate,
  });
  if (error) {
    throw new Error("Unable to load attendance calculations.");
  }
  const result = new Map<string, ActiveAttendanceCalculation>();
  for (const row of data ?? []) {
    const calculation = mapSafeRow(row as Record<string, unknown>);
    if (calculation.employee_id === params.employeeId) {
      result.set(calculation.attendance_date, calculation);
    }
  }
  return result;
}

export async function getActiveCalculationsForRecords(
  records: Array<{ employee_id: string; attendance_date: string }>,
): Promise<Map<string, ActiveAttendanceCalculation>> {
  const result = new Map<string, ActiveAttendanceCalculation>();
  if (!records.length) return result;
  const supabase = await createClient();
  const employeeIds = [...new Set(records.map((row) => row.employee_id))];
  const dates = records.map((row) => row.attendance_date).sort();
  const { data, error } = await supabase
    .from("attendance_calculation_groups")
    .select(`
      id,employee_id,attendance_date,active_revision_id,
      active_revision:attendance_calculation_revisions!attendance_calculation_groups_active_revision_fkey(
        ${activeRevisionSelect}
      )
    `)
    .in("employee_id", employeeIds)
    .gte("attendance_date", dates[0])
    .lte("attendance_date", dates[dates.length - 1]);
  if (error) throw new Error("Unable to load active attendance calculations.");
  for (const row of data ?? []) {
    const calculation = mapGroup(row as unknown as Record<string, unknown>);
    if (calculation) result.set(`${calculation.employee_id}:${calculation.attendance_date}`, calculation);
  }
  return result;
}


export type AdminActiveCalculationRow = {
  calculation: ActiveAttendanceCalculation;
  employee: AttendanceEmployeeSummary | null;
};

export async function getAdminActiveCalculationRows(params: {
  employeeIds?: string[] | null;
  fromDate?: string;
  toDate?: string;
}): Promise<AdminActiveCalculationRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("attendance_calculation_groups")
    .select(`
      id,employee_id,attendance_date,active_revision_id,
      employee:employees!attendance_calculation_groups_employee_id_fkey(
        id,profile_id,employee_number,first_name,last_name,department_id,
        department:departments!employees_department_id_fkey(id,name)
      ),
      active_revision:attendance_calculation_revisions!attendance_calculation_groups_active_revision_fkey(
        ${activeRevisionSelect}
      )
    `)
    .order("attendance_date", { ascending: false })
    .limit(5000);

  if (params.employeeIds) {
    if (params.employeeIds.length === 0) return [];
    query = query.in("employee_id", params.employeeIds);
  }
  if (params.fromDate) query = query.gte("attendance_date", params.fromDate);
  if (params.toDate) query = query.lte("attendance_date", params.toDate);

  const { data, error } = await query;
  if (error) throw new Error("Unable to load calculated attendance days.");

  const rows: AdminActiveCalculationRow[] = [];
  for (const row of data ?? []) {
    const calculation = mapGroup(row as unknown as Record<string, unknown>);
    if (!calculation) continue;
    rows.push({
      calculation,
      employee: (row.employee ?? null) as unknown as AttendanceEmployeeSummary | null,
    });
  }
  return rows;
}

export async function getActiveCalculationForEmployeeDate(
  employeeId: string,
  attendanceDate: string,
): Promise<HrAttendanceCalculationRevision | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_calculation_groups")
    .select(`
      id,employee_id,attendance_date,active_revision_id,
      active_revision:attendance_calculation_revisions!attendance_calculation_groups_active_revision_fkey(
        ${historySelect}
      )
    `)
    .eq("employee_id", employeeId)
    .eq("attendance_date", attendanceDate)
    .maybeSingle();
  if (error) throw new Error("Unable to load the attendance calculation.");
  if (!data?.active_revision) return null;
  return {
    ...(data.active_revision as unknown as HrAttendanceCalculationRevision),
    employee_id: employeeId,
    attendance_date: attendanceDate,
  };
}

export async function getCalculationRevisionHistory(
  employeeId: string,
  attendanceDate: string,
): Promise<HrAttendanceCalculationRevision[]> {
  const supabase = await createClient();
  const { data: group, error: groupError } = await supabase
    .from("attendance_calculation_groups")
    .select("id")
    .eq("employee_id", employeeId)
    .eq("attendance_date", attendanceDate)
    .maybeSingle();
  if (groupError) throw new Error("Unable to load calculation history.");
  if (!group) return [];
  const { data, error } = await supabase
    .from("attendance_calculation_revisions")
    .select(historySelect)
    .eq("calculation_group_id", group.id)
    .order("revision_number", { ascending: false });
  if (error) throw new Error("Unable to load calculation history.");
  return (data ?? []).map((row) => ({
    ...(row as unknown as HrAttendanceCalculationRevision),
    employee_id: employeeId,
    attendance_date: attendanceDate,
  }));
}

export async function getFinalizationRuns(page = 1): Promise<{
  runs: FinalizationRun[];
  total: number;
  page: number;
  totalPages: number;
}> {
  const supabase = await createClient();
  const safePage = Math.max(1, page);
  const pageSize = 20;
  const from = (safePage - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, count, error } = await supabase
    .from("attendance_finalization_runs")
    .select("*", { count: "exact" })
    .order("target_date", { ascending: false })
    .order("started_at", { ascending: false })
    .range(from, to);
  if (error) throw new Error("Unable to load finalization runs.");
  const total = count ?? 0;
  return { runs: (data ?? []) as FinalizationRun[], total, page: safePage, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
