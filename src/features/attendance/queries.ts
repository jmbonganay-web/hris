import "server-only";

import { createClient } from "@/lib/supabase/server";
import { companyDateAt, effectiveAttendanceStatus } from "./time";
import { getResolvedEmployeeSchedule } from "@/features/schedules/queries";
import {
  getAdminActiveCalculationRows,
  getOwnActiveCalculations,
} from "./calculations/queries";
import { filterAttendanceDays, mergeAttendanceDays } from "./calculations/attendance-days";
import type {
  AttendanceCorrectionRequest,
  AttendanceEmployeeSummary,
  AttendanceRecord,
  CorrectionRequestStatus,
  PaginatedAttendance,
  PaginatedCorrectionRequests,
  TodayAttendanceContext,
} from "./types";

const attendanceSelect = `
  id,
  employee_id,
  attendance_date,
  clock_in_at,
  clock_out_at,
  clock_in_note,
  clock_out_note,
  status,
  is_corrected,
  last_corrected_at,
  last_corrected_by,
  last_correction_reason,
  created_by,
  created_at,
  updated_at,
  employee:employees!attendance_records_employee_id_fkey(
    id,profile_id,employee_number,first_name,last_name,department_id,
    department:departments!employees_department_id_fkey(id,name)
  )
`;

const correctionSelect = `
  id,
  employee_id,
  attendance_record_id,
  attendance_date,
  request_type,
  requested_clock_in_at,
  requested_clock_out_at,
  reason,
  employee_note,
  status,
  requested_by,
  reviewed_by,
  reviewed_at,
  review_note,
  created_at,
  updated_at,
  employee:employees!attendance_correction_requests_employee_id_fkey(
    id,profile_id,employee_number,first_name,last_name,department_id,
    department:departments!employees_department_id_fkey(id,name)
  ),
  attendance_record:attendance_records!attendance_correction_requests_attendance_record_id_fkey(
    id,employee_id,attendance_date,clock_in_at,clock_out_at,status,is_corrected,
    last_corrected_at,last_corrected_by,last_correction_reason,created_by,created_at,updated_at,
    clock_in_note,clock_out_note
  ),
  reviewer:profiles!attendance_correction_requests_reviewed_by_fkey(
    id,display_name,first_name,last_name
  )
`;

function mapAttendance(
  row: Record<string, unknown>,
  companyDate: string,
): AttendanceRecord {
  const record = row as unknown as Omit<AttendanceRecord, "effective_status">;
  return {
    ...record,
    effective_status: effectiveAttendanceStatus(record, companyDate),
  };
}

function mapCorrection(
  row: Record<string, unknown>,
  companyDate: string,
): AttendanceCorrectionRequest {
  const request = row as unknown as AttendanceCorrectionRequest;
  return {
    ...request,
    attendance_record: request.attendance_record
      ? mapAttendance(
          request.attendance_record as unknown as Record<string, unknown>,
          companyDate,
        )
      : null,
  };
}

export async function getTodayAttendanceContext(
  employee: TodayAttendanceContext["employee"],
): Promise<TodayAttendanceContext> {
  const supabase = await createClient();
  const companyDate = companyDateAt();
  const [todayResult, previousResult, schedule, calculations] = await Promise.all([
    supabase
      .from("attendance_records")
      .select(attendanceSelect)
      .eq("employee_id", employee.id)
      .eq("attendance_date", companyDate)
      .maybeSingle(),
    supabase
      .from("attendance_records")
      .select(attendanceSelect)
      .eq("employee_id", employee.id)
      .lt("attendance_date", companyDate)
      .is("clock_out_at", null)
      .order("attendance_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getResolvedEmployeeSchedule(employee.id, companyDate),
    getOwnActiveCalculations({ employeeId: employee.id, fromDate: companyDate, toDate: companyDate }),
  ]);

  if (todayResult.error || previousResult.error) {
    throw new Error("Unable to load today’s attendance.");
  }

  return {
    companyDate,
    employee,
    todayRecord: todayResult.data
      ? {
          ...mapAttendance(todayResult.data as unknown as Record<string, unknown>, companyDate),
          calculation: calculations.get(companyDate) ?? null,
        }
      : null,
    previousOpenRecord: previousResult.data
      ? mapAttendance(previousResult.data as unknown as Record<string, unknown>, companyDate)
      : null,
    schedule: schedule,
  };
}

export async function getOwnAttendanceHistory(params: {
  employeeId: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
}): Promise<PaginatedAttendance> {
  const supabase = await createClient();
  const companyDate = companyDateAt();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("attendance_records")
    .select(attendanceSelect)
    .eq("employee_id", params.employeeId)
    .order("attendance_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(5000);

  if (params.fromDate) query = query.gte("attendance_date", params.fromDate);
  if (params.toDate) query = query.lte("attendance_date", params.toDate);

  const [attendanceResult, calculationMap] = await Promise.all([
    query,
    getOwnActiveCalculations({
      employeeId: params.employeeId,
      fromDate: params.fromDate,
      toDate: params.toDate,
    }),
  ]);
  if (attendanceResult.error) throw new Error("Unable to load attendance history.");

  const records = (attendanceResult.data ?? []).map((row) =>
    mapAttendance(row as unknown as Record<string, unknown>, companyDate),
  );
  const merged = filterAttendanceDays(
    mergeAttendanceDays(records, [...calculationMap.values()]),
    params.status,
  );
  const total = merged.length;

  return {
    records: merged.slice(from, to + 1),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getOwnCorrectionRequests(params: {
  employeeId: string;
  status?: CorrectionRequestStatus | "all";
  page?: number;
}): Promise<PaginatedCorrectionRequests> {
  const supabase = await createClient();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("attendance_correction_requests")
    .select(correctionSelect, { count: "exact" })
    .eq("employee_id", params.employeeId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  if (params.status && params.status !== "all") query = query.eq("status", params.status);
  const { data, count, error } = await query;
  if (error) throw new Error("Unable to load correction requests.");
  const total = count ?? 0;
  const companyDate = companyDateAt();
  return {
    requests: (data ?? []).map((row) =>
      mapCorrection(row as unknown as Record<string, unknown>, companyDate),
    ),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getAdminAttendance(params: {
  query?: string;
  department?: string;
  status?: string;
  date?: string;
  page?: number;
  calculationBaseStatus?: string;
  isLate?: boolean;
  isUndertime?: boolean;
  isProvisional?: boolean;
  isCorrectedCalculation?: boolean;
  isRecalculated?: boolean;
}): Promise<PaginatedAttendance> {
  const supabase = await createClient();
  const companyDate = companyDateAt();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const q = params.query?.trim().replace(/[(),]/g, " ");
  let filteredEmployeeIds: string[] | null = null;

  if (q || params.department) {
    let employees = supabase
      .from("employees")
      .select("id")
      .is("archived_at", null);

    if (params.department) employees = employees.eq("department_id", params.department);
    if (q) {
      employees = employees.or(
        `first_name.ilike.%${q}%,last_name.ilike.%${q}%,employee_number.ilike.%${q}%,work_email.ilike.%${q}%`,
      );
    }

    const { data: employeeRows, error: employeeError } = await employees;
    if (employeeError) throw new Error("Unable to filter attendance employees.");
    filteredEmployeeIds = (employeeRows ?? []).map((employee) => employee.id);
    if (filteredEmployeeIds.length === 0) {
      return { records: [], page, pageSize, total: 0, totalPages: 1 };
    }
  }

  let attendanceRequest = supabase
    .from("attendance_records")
    .select(attendanceSelect)
    .order("attendance_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(5000);
  if (filteredEmployeeIds) attendanceRequest = attendanceRequest.in("employee_id", filteredEmployeeIds);
  if (params.date) attendanceRequest = attendanceRequest.eq("attendance_date", params.date);

  const [attendanceResult, calculationRows] = await Promise.all([
    attendanceRequest,
    getAdminActiveCalculationRows({
      employeeIds: filteredEmployeeIds,
      fromDate: params.date || undefined,
      toDate: params.date || undefined,
    }),
  ]);
  if (attendanceResult.error) throw new Error("Unable to load attendance records.");

  const records = (attendanceResult.data ?? []).map((row) =>
    mapAttendance(row as unknown as Record<string, unknown>, companyDate),
  );
  const employees = new Map<string, AttendanceEmployeeSummary>();
  for (const record of records) {
    if (record.employee) employees.set(record.employee_id, record.employee);
  }
  for (const row of calculationRows) {
    if (row.employee) employees.set(row.calculation.employee_id, row.employee);
  }

  let merged = mergeAttendanceDays(
    records,
    calculationRows.map((row) => row.calculation),
    employees,
  );
  merged = filterAttendanceDays(merged, params.status);
  merged = merged.filter((record) => {
    const calculation = record.calculation;
    const needsCalculation = Boolean(
      params.calculationBaseStatus
        || params.isLate !== undefined
        || params.isUndertime !== undefined
        || params.isProvisional !== undefined
        || params.isCorrectedCalculation !== undefined
        || params.isRecalculated !== undefined,
    );
    if (needsCalculation && !calculation) return false;
    if (params.calculationBaseStatus && calculation?.base_status !== params.calculationBaseStatus) return false;
    if (params.isLate !== undefined && calculation?.is_late !== params.isLate) return false;
    if (params.isUndertime !== undefined && calculation?.is_undertime !== params.isUndertime) return false;
    if (params.isProvisional !== undefined && calculation?.is_provisional !== params.isProvisional) return false;
    if (params.isCorrectedCalculation !== undefined && calculation?.is_corrected !== params.isCorrectedCalculation) return false;
    if (params.isRecalculated !== undefined && calculation?.is_recalculated !== params.isRecalculated) return false;
    return true;
  });

  const total = merged.length;
  return {
    records: merged.slice(from, to + 1),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getAdminCorrectionRequests(params: {
  status?: CorrectionRequestStatus | "all";
  page?: number;
}): Promise<PaginatedCorrectionRequests> {
  const supabase = await createClient();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let request = supabase
    .from("attendance_correction_requests")
    .select(correctionSelect, { count: "exact" })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(from, to);

  if (params.status && params.status !== "all") {
    request = request.eq("status", params.status);
  }

  const { data, count, error } = await request;
  if (error) throw new Error("Unable to load correction requests.");
  const total = count ?? 0;
  const companyDate = companyDateAt();
  return {
    requests: (data ?? []).map((row) =>
      mapCorrection(row as unknown as Record<string, unknown>, companyDate),
    ),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getActiveAttendanceEmployees() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select(`
      id,profile_id,employee_number,first_name,last_name,department_id,
      department:departments!employees_department_id_fkey(id,name)
    `)
    .is("archived_at", null)
    .in("employment_status", ["active", "probation", "on_leave"])
    .order("last_name")
    .order("first_name");

  if (error) throw new Error("Unable to load active employees.");
  return (data ?? []) as unknown as AttendanceEmployeeSummary[];
}

export async function getAttendanceRecord(
  employeeId: string,
  recordId: string,
): Promise<AttendanceRecord | null> {
  const supabase = await createClient();
  const companyDate = companyDateAt();
  const { data, error } = await supabase
    .from("attendance_records")
    .select(attendanceSelect)
    .eq("employee_id", employeeId)
    .eq("id", recordId)
    .maybeSingle();

  if (error) throw new Error("Unable to load attendance record.");
  return data
    ? mapAttendance(data as unknown as Record<string, unknown>, companyDate)
    : null;
}

export async function getEmployeeAttendanceHistory(params: {
  employeeId: string;
  page?: number;
}): Promise<PaginatedAttendance> {
  const supabase = await createClient();
  const companyDate = companyDateAt();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const [attendanceResult, calculationRows] = await Promise.all([
    supabase
      .from("attendance_records")
      .select(attendanceSelect)
      .eq("employee_id", params.employeeId)
      .order("attendance_date", { ascending: false })
      .order("id", { ascending: false })
      .limit(5000),
    getAdminActiveCalculationRows({ employeeIds: [params.employeeId] }),
  ]);
  if (attendanceResult.error) throw new Error("Unable to load employee attendance history.");

  const records = (attendanceResult.data ?? []).map((row) =>
    mapAttendance(row as unknown as Record<string, unknown>, companyDate),
  );
  const employees = new Map<string, AttendanceEmployeeSummary>();
  for (const record of records) {
    if (record.employee) employees.set(record.employee_id, record.employee);
  }
  for (const row of calculationRows) {
    if (row.employee) employees.set(row.calculation.employee_id, row.employee);
  }
  const merged = mergeAttendanceDays(
    records,
    calculationRows.map((row) => row.calculation),
    employees,
  );
  const total = merged.length;

  return {
    records: merged.slice(from, to + 1),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getCorrectionRequest(
  requestId: string,
): Promise<AttendanceCorrectionRequest | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_correction_requests")
    .select(correctionSelect)
    .eq("id", requestId)
    .maybeSingle();

  if (error) throw new Error("Unable to load correction request.");
  return data
    ? mapCorrection(
        data as unknown as Record<string, unknown>,
        companyDateAt(),
      )
    : null;
}

export async function getAdminAttendanceSummary() {
  const supabase = await createClient();
  const companyDate = companyDateAt();
  const [today, open, pending] = await Promise.all([
    supabase
      .from("attendance_records")
      .select("id", { count: "exact", head: true })
      .eq("attendance_date", companyDate),
    supabase
      .from("attendance_records")
      .select("id", { count: "exact", head: true })
      .lt("attendance_date", companyDate)
      .is("clock_out_at", null),
    supabase
      .from("attendance_correction_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  if (today.error || open.error || pending.error) {
    throw new Error("Unable to load attendance dashboard summary.");
  }

  return {
    companyDate,
    presentToday: today.count ?? 0,
    missingClockOut: open.count ?? 0,
    pendingCorrections: pending.count ?? 0,
  };
}
