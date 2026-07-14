import type { ResolvedEmployeeSchedule } from "@/features/schedules/types";
import type { ActiveAttendanceCalculation } from "@/features/attendance/calculations/types";

export const COMPANY_TIME_ZONE = "Asia/Manila" as const;

export const attendanceStoredStatuses = ["clocked_in", "completed"] as const;
export type AttendanceStoredStatus = typeof attendanceStoredStatuses[number];

export const attendanceEffectiveStatuses = [
  "clocked_in",
  "completed",
  "missing_clock_out",
] as const;
export type AttendanceEffectiveStatus = typeof attendanceEffectiveStatuses[number];

export const correctionRequestTypes = [
  "add_missing_clock_in",
  "add_missing_clock_out",
  "change_clock_in",
  "change_clock_out",
] as const;
export type CorrectionRequestType = typeof correctionRequestTypes[number];

export const correctionRequestStatuses = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
] as const;
export type CorrectionRequestStatus = typeof correctionRequestStatuses[number];

export type AttendanceActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

export type AttendanceEmployeeSummary = {
  id: string;
  profile_id: string | null;
  employee_number: string;
  first_name: string;
  last_name: string;
  department_id: string | null;
  department: { id: string; name: string } | null;
};

export type AttendanceRecord = {
  id: string;
  employee_id: string;
  attendance_date: string;
  clock_in_at: string | null;
  clock_out_at: string | null;
  clock_in_note: string | null;
  clock_out_note: string | null;
  status: AttendanceStoredStatus;
  effective_status: AttendanceEffectiveStatus;
  is_corrected: boolean;
  last_corrected_at: string | null;
  last_corrected_by: string | null;
  last_correction_reason: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  employee?: AttendanceEmployeeSummary | null;
  calculation?: ActiveAttendanceCalculation | null;
  is_calculation_only?: boolean;
};

export type AttendanceCorrectionRequest = {
  id: string;
  employee_id: string;
  attendance_record_id: string | null;
  attendance_date: string;
  request_type: CorrectionRequestType;
  requested_clock_in_at: string | null;
  requested_clock_out_at: string | null;
  reason: string;
  employee_note: string | null;
  status: CorrectionRequestStatus;
  requested_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
  employee?: AttendanceEmployeeSummary | null;
  attendance_record?: AttendanceRecord | null;
  reviewer?: {
    id: string;
    display_name: string | null;
    first_name: string;
    last_name: string;
  } | null;
};

export type PaginatedAttendance = {
  records: AttendanceRecord[];
  page: number;
  pageSize: 20;
  total: number;
  totalPages: number;
};

export type PaginatedCorrectionRequests = {
  requests: AttendanceCorrectionRequest[];
  page: number;
  pageSize: 20;
  total: number;
  totalPages: number;
};

export type TodayAttendanceContext = {
  companyDate: string;
  employee: AttendanceEmployeeSummary;
  todayRecord: AttendanceRecord | null;
  previousOpenRecord: AttendanceRecord | null;
  schedule: ResolvedEmployeeSchedule;
};
