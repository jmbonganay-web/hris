import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { LeaveTypeOption, LeaveTypeSummary, LeaveTypeVersion } from "../types";

interface LeaveTypeOptionRow {
  leave_type_id: string;
  leave_type_version_id: string;
  code: string;
  name: string;
  is_paid: boolean;
  is_balance_tracked: boolean;
  employee_note_required: boolean;
  document_required: boolean;
  document_required_min_units: string | number | null;
}

const versionSelect = `
  id,leave_type_id,revision_number,effective_from,name,description,is_active,
  is_paid,is_balance_tracked,default_annual_units,carryover_enabled,
  carryover_cap_units,employee_note_required,document_required,
  document_required_min_units,created_by,created_at,change_reason
`;

export async function getLeaveTypes(companyDate: string): Promise<LeaveTypeSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leave_types")
    .select(`id,code,versions:leave_type_versions(${versionSelect})`)
    .order("code");
  if (error) throw new Error("Unable to load leave types.");
  return (data ?? []).map((row) => {
    const versions = [...((row.versions ?? []) as LeaveTypeVersion[])].sort(
      (a, b) => b.effective_from.localeCompare(a.effective_from) || b.revision_number - a.revision_number,
    );
    return {
      id: row.id,
      code: row.code,
      current: versions.find((version) => version.effective_from <= companyDate) ?? null,
      upcoming: versions.filter((version) => version.effective_from > companyDate),
      history: versions.filter((version) => version.effective_from <= companyDate),
    };
  });
}

export async function getLeaveType(leaveTypeId: string, companyDate: string) {
  const rows = await getLeaveTypes(companyDate);
  return rows.find((row) => row.id === leaveTypeId) ?? null;
}

export async function getActiveLeaveTypeOptions(effectiveDate: string): Promise<LeaveTypeOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_active_leave_type_options", {
    p_effective_date: effectiveDate,
  });
  if (error) throw new Error("Unable to load available leave types.");
  return ((data ?? []) as LeaveTypeOptionRow[]).map((row) => ({
    leaveTypeId: String(row.leave_type_id),
    leaveTypeVersionId: String(row.leave_type_version_id),
    code: String(row.code),
    name: String(row.name),
    isPaid: Boolean(row.is_paid),
    isBalanceTracked: Boolean(row.is_balance_tracked),
    employeeNoteRequired: Boolean(row.employee_note_required),
    documentRequired: Boolean(row.document_required),
    documentRequiredMinUnits: row.document_required_min_units === null
      ? null
      : Number(row.document_required_min_units),
  }));
}
