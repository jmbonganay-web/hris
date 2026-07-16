import { attendanceCalculationBaseStatuses } from "../attendance/calculations/types.ts";
import { leaveConflictTypes, leaveRequestStatuses } from "../leave/types.ts";
import { holidayTypes } from "../overtime/holidays/types.ts";
import { overtimeApprovalStatuses, overtimeSegmentTypes } from "../overtime/types.ts";
import {
  OPERATIONAL_MAX_DAYS,
  PAYROLL_MAX_DAYS,
  attendanceExceptionTypes,
  reportCalculationStates,
  reportModes,
  reportPageSizes,
  reportEmploymentStatuses,
  reportTabs,
} from "./constants.ts";
import type { ReportFilters } from "./types.ts";

type RawSearch = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function optionalUuid(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new Error("The selected report filter is invalid.");
  }
  return normalized;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function inclusiveDays(startDate: string, endDate: string): number {
  return Math.floor((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000) + 1;
}

function accepted<T extends readonly string[]>(value: string, allowed: T): T[number] | null {
  return allowed.includes(value as T[number]) ? (value as T[number]) : null;
}

function optionalAccepted<T extends readonly string[]>(value: string, allowed: T): T[number] | null {
  if (!value) return null;
  const result = accepted(value, allowed);
  if (!result) throw new Error("The selected report filter is invalid.");
  return result;
}

export function parseReportFilters(raw: RawSearch, today: string): ReportFilters {
  const defaultStart = `${today.slice(0, 7)}-01`;
  const mode = accepted(one(raw.mode), reportModes) ?? "payroll";
  const tab = accepted(one(raw.tab), reportTabs) ?? "summary";
  const startDate = one(raw.start_date) || defaultStart;
  const endDate = one(raw.end_date) || today;

  if (!isIsoDate(startDate) || !isIsoDate(endDate) || startDate > endDate) {
    throw new Error("The selected date range is invalid.");
  }
  if (endDate > today) throw new Error("Future report dates are not allowed.");
  const days = inclusiveDays(startDate, endDate);
  if (mode === "operational" && days > OPERATIONAL_MAX_DAYS) {
    throw new Error("Operational reports are limited to 31 days.");
  }
  if (mode === "payroll" && days > PAYROLL_MAX_DAYS) {
    throw new Error("Payroll reports are limited to 366 days.");
  }

  const requestedPageSize = Number(one(raw.page_size) || "25");
  const pageSize = reportPageSizes.includes(requestedPageSize as 25 | 50 | 100)
    ? (requestedPageSize as 25 | 50 | 100)
    : 25;

  return {
    mode,
    tab,
    startDate,
    endDate,
    departmentId: optionalUuid(one(raw.department)),
    employeeId: optionalUuid(one(raw.employee)),
    employmentStatus: accepted(one(raw.employment_status), reportEmploymentStatuses),
    activeOnly: one(raw.active_only) === "1",
    includeEmployeesWithoutRecords: one(raw.include_without_records) === "1",
    attendanceStatus: accepted(one(raw.attendance_status), attendanceCalculationBaseStatuses),
    calculationState: accepted(one(raw.calculation_state), reportCalculationStates),
    exceptionType: accepted(one(raw.exception_type), attendanceExceptionTypes),
    segmentType: accepted(one(raw.segment_type), overtimeSegmentTypes),
    approvalStatus: accepted(one(raw.approval_status), overtimeApprovalStatuses),
    holidayType: accepted(one(raw.holiday_type), holidayTypes),
    leaveTypeId: optionalUuid(one(raw.leave_type)),
    leaveStatus: optionalAccepted(one(raw.leave_status), leaveRequestStatuses),
    leavePaidState: optionalAccepted(one(raw.leave_paid_state), ["paid", "unpaid"] as const),
    leaveConflictType: optionalAccepted(one(raw.leave_conflict_type), leaveConflictTypes),
    leaveConflictStatus: optionalAccepted(one(raw.leave_conflict_status), ["open", "resolved", "superseded"] as const),
    page: Math.max(1, Number(one(raw.page) || "1") || 1),
    pageSize,
  };
}

export function serializeReportFilters(filters: ReportFilters): URLSearchParams {
  const params = new URLSearchParams({
    mode: filters.mode,
    tab: filters.tab,
    start_date: filters.startDate,
    end_date: filters.endDate,
  });
  if (filters.departmentId) params.set("department", filters.departmentId);
  if (filters.employeeId) params.set("employee", filters.employeeId);
  if (filters.employmentStatus) params.set("employment_status", filters.employmentStatus);
  if (filters.activeOnly) params.set("active_only", "1");
  if (filters.includeEmployeesWithoutRecords) params.set("include_without_records", "1");
  if (filters.attendanceStatus) params.set("attendance_status", filters.attendanceStatus);
  if (filters.calculationState) params.set("calculation_state", filters.calculationState);
  if (filters.exceptionType) params.set("exception_type", filters.exceptionType);
  if (filters.segmentType) params.set("segment_type", filters.segmentType);
  if (filters.approvalStatus) params.set("approval_status", filters.approvalStatus);
  if (filters.holidayType) params.set("holiday_type", filters.holidayType);
  if (filters.leaveTypeId) params.set("leave_type", filters.leaveTypeId);
  if (filters.leaveStatus) params.set("leave_status", filters.leaveStatus);
  if (filters.leavePaidState) params.set("leave_paid_state", filters.leavePaidState);
  if (filters.leaveConflictType) params.set("leave_conflict_type", filters.leaveConflictType);
  if (filters.leaveConflictStatus) params.set("leave_conflict_status", filters.leaveConflictStatus);
  params.set("page", String(filters.page));
  params.set("page_size", String(filters.pageSize));
  return params;
}
