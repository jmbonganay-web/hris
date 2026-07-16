import "server-only";

import { createClient } from "@/lib/supabase/server";
import { mapLeaveBalance, type LeaveBalanceProjectionRow } from "../balances/queries";
import type {
  LeaveClassification,
  LeaveDurationMode,
  LeavePreviewResult,
  LeaveRequestDetail,
  LeaveRequestListItem,
  LeaveRequestStatus,
  LeaveUnit,
} from "../types";

export class LeaveRequestNotFoundError extends Error {
  constructor() {
    super("Leave request not found.");
    this.name = "LeaveRequestNotFoundError";
  }
}

interface RequestListRow {
  request_group_id: string;
  active_revision_id: string;
  employee_id: string;
  employee_name: string;
  employee_number: string | null;
  department_name: string | null;
  leave_type_name: string;
  is_paid: boolean;
  is_balance_tracked: boolean;
  start_date: string;
  end_date: string;
  duration_mode: LeaveDurationMode;
  status: LeaveRequestStatus;
  requested_units: string | number;
  chargeable_units: string | number;
  submitted_at: string | null;
  reviewed_at: string | null;
  replaces_request_group_id: string | null;
  superseded_by_request_group_id: string | null;
  total_count: string | number;
}

function mapRequestListRow(row: RequestListRow): LeaveRequestListItem {
  return {
    requestGroupId: row.request_group_id,
    activeRevisionId: row.active_revision_id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    employeeNumber: row.employee_number,
    departmentName: row.department_name,
    leaveTypeName: row.leave_type_name,
    isPaid: row.is_paid,
    isBalanceTracked: row.is_balance_tracked,
    startDate: row.start_date,
    endDate: row.end_date,
    durationMode: row.duration_mode,
    status: row.status,
    requestedUnits: Number(row.requested_units),
    chargeableUnits: Number(row.chargeable_units),
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    replacesRequestGroupId: row.replaces_request_group_id,
    supersededByRequestGroupId: row.superseded_by_request_group_id,
  };
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined || value === "" ? null : String(value);
}

export function mapLeaveRequestDetail(row: Record<string, unknown>): LeaveRequestDetail {
  const summary = (row.summary ?? {}) as Record<string, unknown>;

  return {
    requestGroupId: String(summary.request_group_id),
    activeRevisionId: String(summary.active_revision_id),
    employeeId: String(summary.employee_id),
    employeeName: String(summary.employee_name),
    employeeNumber: nullableString(summary.employee_number),
    departmentName: nullableString(summary.department_name),
    leaveTypeId: String(summary.leave_type_id),
    leaveTypeVersionId: String(summary.leave_type_version_id),
    leaveTypeName: String(summary.leave_type_name),
    isPaid: Boolean(summary.is_paid),
    isBalanceTracked: Boolean(summary.is_balance_tracked),
    leaveYear: Number(summary.leave_year),
    startDate: String(summary.start_date),
    endDate: String(summary.end_date),
    durationMode: summary.duration_mode as LeaveDurationMode,
    status: summary.status as LeaveRequestStatus,
    employeeNote: nullableString(summary.employee_note),
    requestedUnits: Number(summary.requested_units),
    chargeableUnits: Number(row.current_chargeable_units),
    submittedAt: nullableString(summary.submitted_at),
    reviewedAt: nullableString(summary.reviewed_at),
    otherPendingReservedUnits: Number(row.other_pending_reserved_units),
    dayFingerprint: String(row.day_fingerprint ?? ""),
    days: ((row.days ?? []) as Record<string, unknown>[]).map((day) => ({
      requestDayId: String(day.request_day_id),
      activeDayRevisionId: String(day.active_day_revision_id),
      leaveDate: String(day.leave_date),
      scheduleName: nullableString(day.schedule_name),
      classification: day.leave_classification as LeaveClassification,
      chargeableUnits: Number(day.chargeable_units) as LeaveUnit,
      isHoliday: Boolean(day.is_holiday),
      isRestDay: Boolean(day.is_rest_day),
      conflictState: nullableString(day.conflict_state),
    })),
    actions: ((row.actions ?? []) as Record<string, unknown>[]).map((action) => ({
      id: String(action.id),
      actionType: String(action.action_type),
      fromStatus: action.from_status
        ? (action.from_status as LeaveRequestStatus)
        : null,
      toStatus: action.to_status as LeaveRequestStatus,
      actorName: nullableString(action.actor_name),
      createdAt: String(action.created_at),
      privateText: nullableString(action.private_text),
    })),
    attachments: ((row.attachments ?? []) as Record<string, unknown>[]).map((attachment) => ({
      id: String(attachment.id),
      requestGroupId: String(attachment.request_group_id),
      requestRevisionId: String(attachment.request_revision_id),
      originalFilename: String(attachment.original_filename),
      mimeType: String(attachment.mime_type),
      sizeBytes: Number(attachment.size_bytes),
      uploadedAt: String(attachment.uploaded_at),
      frozenAt: nullableString(attachment.frozen_at),
    })),
    balance: row.balance
      ? mapLeaveBalance(row.balance as LeaveBalanceProjectionRow)
      : null,
    replacesRequestGroupId: nullableString(summary.replaces_request_group_id),
    supersededByRequestGroupId: nullableString(summary.superseded_by_request_group_id),
  };
}

export async function getMyLeaveRequests(input: {
  leaveYear: number;
  status?: string | null;
  page?: number;
  pageSize?: number;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_leave_requests", {
    p_leave_year: input.leaveYear,
    p_status: input.status ?? null,
    p_page: input.page ?? 1,
    p_page_size: input.pageSize ?? 25,
  });
  if (error) throw new Error("Unable to load leave requests.");
  const rows = (data ?? []) as RequestListRow[];
  const total = Number(rows[0]?.total_count ?? 0);
  return { items: rows.map(mapRequestListRow), total };
}

export async function getAdminLeaveRequests(input: {
  leaveYear: number;
  status?: string | null;
  employeeId?: string | null;
  departmentId?: string | null;
  leaveTypeId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  page?: number;
  pageSize?: number;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_admin_leave_requests", {
    p_leave_year: input.leaveYear,
    p_status: input.status ?? null,
    p_employee_id: input.employeeId ?? null,
    p_department_id: input.departmentId ?? null,
    p_leave_type_id: input.leaveTypeId ?? null,
    p_start_date: input.startDate ?? null,
    p_end_date: input.endDate ?? null,
    p_page: input.page ?? 1,
    p_page_size: input.pageSize ?? 25,
  });
  if (error) throw new Error("Unable to load organization leave requests.");
  const rows = (data ?? []) as RequestListRow[];
  const total = Number(rows[0]?.total_count ?? 0);
  return { items: rows.map(mapRequestListRow), total };
}

export async function getLeaveRequestDetail(requestGroupId: string): Promise<LeaveRequestDetail> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_leave_request_detail", {
    p_request_group_id: requestGroupId,
  });
  if (error) {
    if (error.message.includes("LEAVE_REQUEST_NOT_FOUND")) {
      throw new LeaveRequestNotFoundError();
    }
    throw new Error("Unable to load leave request details.", { cause: error });
  }
  if (!data) throw new LeaveRequestNotFoundError();
  return mapLeaveRequestDetail(data as Record<string, unknown>);
}

export async function previewLeaveRequest(input: {
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  durationMode: LeaveDurationMode;
  excludeRequestGroupId?: string | null;
}): Promise<LeavePreviewResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("preview_leave_request", {
    p_employee_id: input.employeeId,
    p_leave_type_id: input.leaveTypeId,
    p_start_date: input.startDate,
    p_end_date: input.endDate,
    p_duration_mode: input.durationMode,
    p_exclude_request_group_id: input.excludeRequestGroupId ?? null,
  });
  if (error || !data) throw new Error(error?.message ?? "Unable to preview leave dates.");
  const row = data as Record<string, unknown>;
  return {
    days: ((row.days ?? []) as Record<string, unknown>[]).map((day) => ({
      leaveDate: String(day.leave_date),
      scheduleName: nullableString(day.schedule_name),
      classification: day.leave_classification as LeaveClassification,
      chargeableUnits: Number(day.chargeable_units) as LeaveUnit,
      isHoliday: Boolean(day.is_holiday),
      isRestDay: Boolean(day.is_rest_day),
      halfDayBoundaryAt: nullableString(day.half_day_boundary_at),
    })),
    requestedUnits: Number(row.requested_units),
    chargeableUnits: Number(row.chargeable_units),
    ledgerBalance: row.ledger_balance === null ? null : Number(row.ledger_balance),
    pendingReservedUnits: Number(row.pending_reserved_units),
    availableUnits: row.available_units === null ? null : Number(row.available_units),
    requiresDocument: Boolean(row.requires_document),
  };
}
