import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { HolidayType } from "./holidays/types";
import type {
  AttendanceOvertimeSummary,
  OvertimeApprovalDetail,
  OvertimeApprovalQueueRow,
  OvertimeApprovalStatus,
  OvertimeQueueMetrics,
  OvertimeSegmentType,
  PaginatedEmployeeOvertime,
  PaginatedOvertimeQueue,
  SafeEmployeeOvertimeItem,
} from "./types";


type OwnOvertimeHistoryParams = {
  fromDate?: string;
  toDate?: string;
  page?: number;
};

const adminApprovalSelect = `
  id,status,detected_minutes,approved_minutes,reviewed_by,reviewed_at,
  approval_note,rejection_reason,created_at,superseded_at,superseded_by_item_id,
  reviewer:profiles!overtime_approval_items_reviewed_by_fkey(
    id,display_name,first_name,last_name
  ),
  detection_revision:overtime_detection_revisions!inner(
    id,detection_group_id,revision_number,attendance_calculation_revision_id,
    attendance_record_id,schedule_assignment_id,schedule_version_id,
    overtime_policy_version_id,holiday_version_id,segment_type,
    detected_start_at,detected_end_at,detected_minutes,meets_threshold,
    is_active,calculation_source,calculated_at,
    holiday:holiday_calendar_versions!overtime_detection_revisions_holiday_version_id_fkey(
      holiday_name,holiday_type
    ),
    detection_group:overtime_detection_groups!overtime_detection_revisions_detection_group_id_fkey!inner(
      id,employee_id,attendance_date,active_revision_id,
      employee:employees!inner(
        id,employee_number,first_name,last_name,department_id,
        department:departments!employees_department_id_fkey(id,name)
      )
    )
  )
`;

function mapSafeEmployeeItem(row: Record<string, unknown>): SafeEmployeeOvertimeItem {
  return {
    attendance_date: String(row.attendance_date),
    segment_type: row.segment_type as SafeEmployeeOvertimeItem["segment_type"],
    detected_minutes: Number(row.detected_minutes),
    approved_minutes: Number(row.approved_minutes),
    status: row.status as SafeEmployeeOvertimeItem["status"],
    approval_date: row.approval_date ? String(row.approval_date) : null,
    holiday_name: row.holiday_name ? String(row.holiday_name) : null,
    holiday_type: row.holiday_type
      ? (String(row.holiday_type) as SafeEmployeeOvertimeItem["holiday_type"])
      : null,
    is_active: Boolean(row.is_active),
    created_at: String(row.created_at),
  };
}

function mapAdminApproval(row: Record<string, unknown>): OvertimeApprovalQueueRow {
  const revision = row.detection_revision as Record<string, unknown>;
  const group = revision.detection_group as Record<string, unknown>;
  const employee = group.employee as OvertimeApprovalQueueRow["employee"];
  const holiday = revision.holiday as Record<string, unknown> | null;

  return {
    id: String(row.id),
    status: row.status as OvertimeApprovalStatus,
    detected_minutes: Number(row.detected_minutes),
    approved_minutes: Number(row.approved_minutes),
    reviewed_at: row.reviewed_at ? String(row.reviewed_at) : null,
    created_at: String(row.created_at),
    superseded_at: row.superseded_at ? String(row.superseded_at) : null,
    employee,
    attendance_date: String(group.attendance_date),
    segment_type: revision.segment_type as OvertimeSegmentType,
    detected_start_at: revision.detected_start_at
      ? String(revision.detected_start_at)
      : null,
    detected_end_at: revision.detected_end_at
      ? String(revision.detected_end_at)
      : null,
    detection_revision_id: String(revision.id),
    detection_revision_number: Number(revision.revision_number),
    detection_is_active: Boolean(revision.is_active),
    holiday_name: holiday?.holiday_name ? String(holiday.holiday_name) : null,
    holiday_type: holiday?.holiday_type
      ? (String(holiday.holiday_type) as HolidayType)
      : null,
  };
}

function applyAdminFilters(
  query: any,
  params: {
    dateFrom?: string;
    dateTo?: string;
    employeeId?: string;
    departmentId?: string;
    segmentType?: OvertimeSegmentType;
    holidayType?: HolidayType;
    status?: OvertimeApprovalStatus;
  },
) {
  let filtered = query;
  if (params.dateFrom) {
    filtered = filtered.gte(
      "detection_revision.detection_group.attendance_date",
      params.dateFrom,
    );
  }
  if (params.dateTo) {
    filtered = filtered.lte(
      "detection_revision.detection_group.attendance_date",
      params.dateTo,
    );
  }
  if (params.employeeId) {
    filtered = filtered.eq(
      "detection_revision.detection_group.employee_id",
      params.employeeId,
    );
  }
  if (params.departmentId) {
    filtered = filtered.eq(
      "detection_revision.detection_group.employee.department_id",
      params.departmentId,
    );
  }
  if (params.segmentType) {
    filtered = filtered.eq("detection_revision.segment_type", params.segmentType);
  }
  if (params.holidayType) {
    filtered = filtered.eq("detection_revision.holiday.holiday_type", params.holidayType);
  }
  if (params.status) filtered = filtered.eq("status", params.status);
  return filtered;
}

async function loadAllAdminApprovalRows(params: {
  dateFrom?: string;
  dateTo?: string;
  employeeId?: string;
  departmentId?: string;
  segmentType?: OvertimeSegmentType;
  holidayType?: HolidayType;
  status?: OvertimeApprovalStatus;
}): Promise<OvertimeApprovalQueueRow[]> {
  const supabase = await createClient();
  const rows: OvertimeApprovalQueueRow[] = [];
  const batchSize = 1000;
  let from = 0;

  while (true) {
    const query = applyAdminFilters(
      supabase
        .from("overtime_approval_items")
        .select(adminApprovalSelect)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false }),
      params,
    ).range(from, from + batchSize - 1);
    const { data, error } = await query;
    if (error) throw new Error("Unable to load overtime approvals.");
    const batch = (data ?? []).map((row: unknown) =>
      mapAdminApproval(row as Record<string, unknown>),
    );
    rows.push(...batch);
    if (batch.length < batchSize) break;
    from += batchSize;
  }

  return rows;
}

export async function getOwnOvertimeHistory(
  params: OwnOvertimeHistoryParams,
): Promise<PaginatedEmployeeOvertime> {
  const supabase = await createClient();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = 20;
  const { data, error } = await supabase.rpc("get_my_overtime_items", {
    p_from_date: params.fromDate?.trim() || null,
    p_to_date: params.toDate?.trim() || null,
  });
  if (error) throw new Error("Unable to load overtime history.");
  const items = (data ?? []).map((row: unknown) =>
    mapSafeEmployeeItem(row as Record<string, unknown>),
  );
  const total = items.length;
  const from = (page - 1) * pageSize;
  return {
    items: items.slice(from, from + pageSize),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getOwnActiveOvertimeSummaryMap(params: {
  fromDate?: string;
  toDate?: string;
}): Promise<Map<string, AttendanceOvertimeSummary[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_overtime_items", {
    p_from_date: params.fromDate?.trim() || null,
    p_to_date: params.toDate?.trim() || null,
  });
  if (error) throw new Error("Unable to load overtime summaries.");
  const map = new Map<string, AttendanceOvertimeSummary[]>();
  for (const row of (data ?? []).map((item: unknown) =>
    mapSafeEmployeeItem(item as Record<string, unknown>),
  )) {
    if (!row.is_active) continue;
    const current = map.get(row.attendance_date) ?? [];
    current.push(row);
    map.set(row.attendance_date, current);
  }
  return map;
}

export async function getAdminOvertimeApprovalQueue(params: {
  dateFrom?: string;
  dateTo?: string;
  employeeId?: string;
  departmentId?: string;
  segmentType?: OvertimeSegmentType;
  holidayType?: HolidayType;
  status?: OvertimeApprovalStatus;
  page?: number;
}): Promise<PaginatedOvertimeQueue> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = 20;
  const rows = await loadAllAdminApprovalRows(params);
  const metrics: OvertimeQueueMetrics = {
    pendingItems: rows.filter((row) => row.status === "pending").length,
    approvedItems: rows.filter((row) => row.status === "approved").length,
    rejectedItems: rows.filter((row) => row.status === "rejected").length,
    supersededItems: rows.filter((row) => row.status === "superseded").length,
    totalDetectedMinutes: rows.reduce(
      (sum, row) => sum + row.detected_minutes,
      0,
    ),
    totalActiveApprovedMinutes: rows
      .filter((row) => row.status === "approved" && row.detection_is_active)
      .reduce((sum, row) => sum + row.approved_minutes, 0),
  };
  const total = rows.length;
  const from = (page - 1) * pageSize;
  return {
    items: rows.slice(from, from + pageSize),
    metrics,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getAdminActiveOvertimeSummaryMap(params: {
  employeeIds: string[];
  fromDate?: string;
  toDate?: string;
}): Promise<Map<string, AttendanceOvertimeSummary[]>> {
  const map = new Map<string, AttendanceOvertimeSummary[]>();
  if (params.employeeIds.length === 0) return map;
  const rows = await loadAllAdminApprovalRows({
    dateFrom: params.fromDate,
    dateTo: params.toDate,
  });
  const employeeSet = new Set(params.employeeIds);
  for (const row of rows) {
    if (!row.detection_is_active || !employeeSet.has(row.employee.id)) continue;
    const key = `${row.employee.id}:${row.attendance_date}`;
    const current = map.get(key) ?? [];
    current.push({
      attendance_date: row.attendance_date,
      segment_type: row.segment_type,
      detected_minutes: row.detected_minutes,
      approved_minutes: row.approved_minutes,
      status: row.status,
      holiday_name: row.holiday_name,
      holiday_type: row.holiday_type,
      is_active: row.detection_is_active,
    });
    map.set(key, current);
  }
  return map;
}

export async function getOvertimeApprovalDetail(
  approvalItemId: string,
): Promise<OvertimeApprovalDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("overtime_approval_items")
    .select(adminApprovalSelect)
    .eq("id", approvalItemId)
    .maybeSingle();
  if (error) throw new Error("Unable to load the overtime approval item.");
  if (!data) return null;

  const row = data as unknown as Record<string, unknown>;
  const mapped = mapAdminApproval(row);
  const revision = row.detection_revision as Record<string, unknown>;
  const groupId = String(revision.detection_group_id);
  const { data: revisionRows, error: revisionError } = await supabase
    .from("overtime_detection_revisions")
    .select("id")
    .eq("detection_group_id", groupId);
  if (revisionError) throw new Error("Unable to load overtime history.");
  const revisionIds = (revisionRows ?? []).map((item) => item.id);
  let priorItems: OvertimeApprovalQueueRow[] = [];
  if (revisionIds.length > 0) {
    const { data: priorRows, error: priorError } = await supabase
      .from("overtime_approval_items")
      .select(adminApprovalSelect)
      .in("detection_revision_id", revisionIds)
      .neq("id", approvalItemId)
      .eq("status", "superseded")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (priorError) throw new Error("Unable to load overtime history.");
    priorItems = (priorRows ?? []).map((item: unknown) =>
      mapAdminApproval(item as Record<string, unknown>),
    );
  }

  return {
    ...mapped,
    attendance_calculation_revision_id: String(
      revision.attendance_calculation_revision_id,
    ),
    attendance_record_id: revision.attendance_record_id
      ? String(revision.attendance_record_id)
      : null,
    schedule_assignment_id: revision.schedule_assignment_id
      ? String(revision.schedule_assignment_id)
      : null,
    schedule_version_id: revision.schedule_version_id
      ? String(revision.schedule_version_id)
      : null,
    overtime_policy_version_id: revision.overtime_policy_version_id
      ? String(revision.overtime_policy_version_id)
      : null,
    holiday_version_id: revision.holiday_version_id
      ? String(revision.holiday_version_id)
      : null,
    calculation_source: revision.calculation_source as OvertimeApprovalDetail["calculation_source"],
    calculated_at: String(revision.calculated_at),
    reviewer: (row.reviewer ?? null) as OvertimeApprovalDetail["reviewer"],
    approval_note: row.approval_note ? String(row.approval_note) : null,
    rejection_reason: row.rejection_reason ? String(row.rejection_reason) : null,
    priorItems: priorItems.sort((left, right) =>
      right.detection_revision_number - left.detection_revision_number
    ),
  };
}
