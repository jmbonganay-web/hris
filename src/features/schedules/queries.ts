import "server-only";

import { createClient } from "@/lib/supabase/server";
import { companyDateAt } from "@/features/attendance/time";
import type {
  EmployeeScheduleAssignment,
  EmployeeScheduleAssignmentSummary,
  ResolvedEmployeeSchedule,
  ScheduleEmployeeOption,
  ScheduleTemplateRecord,
  ResolvedScheduleVersion,
  ScheduleVersionRecord,
} from "./types";
import { resolveScheduleState, weekdayForCompanyDate } from "./resolution";

const versionSelect = `
  id,schedule_template_id,effective_date,working_days,start_time,end_time,
  break_minutes,change_reason,created_by,created_at,
  creator:profiles!work_schedule_versions_created_by_fkey(
    id,display_name,first_name,last_name
  )
`;

const assignmentSelect = `
  id,employee_id,schedule_template_id,effective_start_date,effective_end_date,
  assignment_reason,is_superseded,superseded_at,superseded_by_assignment_id,
  created_by,created_at,updated_by,updated_at,
  template:work_schedule_templates!employee_schedule_assignments_schedule_template_id_fkey(
    id,code,name,description,is_archived,created_by,created_at,updated_by,updated_at,
    archived_by,archived_at
  ),
  employee:employees!employee_schedule_assignments_employee_id_fkey(
    id,employee_number,first_name,last_name,department_id,
    department:departments!employees_department_id_fkey(id,name)
  ),
  creator:profiles!employee_schedule_assignments_created_by_fkey(
    id,display_name,first_name,last_name
  )
`;

function cleanSearch(value?: string) {
  return value?.trim().replace(/[,%()]/g, " ").replace(/\s+/g, " ") ?? "";
}

export async function getScheduleTemplates(params: {
  query?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  const supabase = await createClient();
  const companyDate = companyDateAt();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = params.pageSize ?? 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const status = params.status === "archived" || params.status === "all"
    ? params.status
    : "active";
  const search = cleanSearch(params.query);

  let request = supabase
    .from("work_schedule_templates")
    .select("id,code,name,description,is_archived,created_by,created_at,updated_by,updated_at,archived_by,archived_at", { count: "exact" })
    .order("name")
    .range(from, to);
  if (status === "active") request = request.eq("is_archived", false);
  if (status === "archived") request = request.eq("is_archived", true);
  if (search) request = request.or(`code.ilike.%${search}%,name.ilike.%${search}%`);

  const { data, count, error } = await request;
  if (error) throw new Error("Unable to load work schedules.");

  const templates = (data ?? []) as ScheduleTemplateRecord[];
  const ids = templates.map((item) => item.id);
  if (ids.length === 0) {
    return { templates, page, pageSize, total: 0, totalPages: 1 };
  }

  const [versionsResult, assignmentsResult] = await Promise.all([
    supabase
      .from("work_schedule_versions")
      .select(versionSelect)
      .in("schedule_template_id", ids)
      .order("effective_date", { ascending: false }),
    supabase
      .from("employee_schedule_assignments")
      .select("schedule_template_id,employee_id")
      .in("schedule_template_id", ids)
      .eq("is_superseded", false)
      .lte("effective_start_date", companyDate)
      .or(`effective_end_date.is.null,effective_end_date.gte.${companyDate}`),
  ]);
  if (versionsResult.error || assignmentsResult.error) {
    throw new Error("Unable to load schedule summaries.");
  }

  const versions = (versionsResult.data ?? []) as unknown as ScheduleVersionRecord[];
  const counts = (assignmentsResult.data ?? []).reduce<Record<string, number>>((result, item) => {
    result[item.schedule_template_id] = (result[item.schedule_template_id] ?? 0) + 1;
    return result;
  }, {});

  const mapped = templates.map((template) => ({
    ...template,
    current_version: versions.find(
      (version) => version.schedule_template_id === template.id
        && version.effective_date <= companyDate,
    ) ?? null,
    upcoming_versions: versions.filter(
      (version) => version.schedule_template_id === template.id
        && version.effective_date > companyDate,
    ),
    assigned_employee_count: counts[template.id] ?? 0,
  }));

  const total = count ?? 0;
  return {
    templates: mapped,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getScheduleTemplateDetails(templateId: string) {
  const supabase = await createClient();
  const companyDate = companyDateAt();
  const [templateResult, versionsResult, assignmentsResult] = await Promise.all([
    supabase
      .from("work_schedule_templates")
      .select("id,code,name,description,is_archived,created_by,created_at,updated_by,updated_at,archived_by,archived_at")
      .eq("id", templateId)
      .maybeSingle(),
    supabase
      .from("work_schedule_versions")
      .select(versionSelect)
      .eq("schedule_template_id", templateId)
      .order("effective_date", { ascending: false }),
    supabase
      .from("employee_schedule_assignments")
      .select(assignmentSelect)
      .eq("schedule_template_id", templateId)
      .eq("is_superseded", false)
      .order("effective_start_date", { ascending: false }),
  ]);
  if (templateResult.error || versionsResult.error || assignmentsResult.error) {
    throw new Error("Unable to load the work schedule.");
  }
  if (!templateResult.data) return null;

  const versions = (versionsResult.data ?? []) as unknown as ScheduleVersionRecord[];
  return {
    template: {
      ...(templateResult.data as ScheduleTemplateRecord),
      current_version: versions.find((version) => version.effective_date <= companyDate) ?? null,
      upcoming_versions: versions.filter((version) => version.effective_date > companyDate),
      version_history: versions,
    },
    assignments: (assignmentsResult.data ?? []) as unknown as EmployeeScheduleAssignment[],
    companyDate,
  };
}

export async function getActiveScheduleOptions() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_schedule_templates")
    .select("id,code,name,is_archived")
    .eq("is_archived", false)
    .order("name");
  if (error) throw new Error("Unable to load schedule options.");
  return data ?? [];
}

export async function getEligibleScheduleEmployees() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select(`
      id,employee_number,first_name,last_name,department_id,
      department:departments!employees_department_id_fkey(id,name)
    `)
    .is("archived_at", null)
    .in("employment_status", ["active", "probation", "on_leave"])
    .order("last_name")
    .order("first_name");
  if (error) throw new Error("Unable to load eligible employees.");
  return (data ?? []) as unknown as ScheduleEmployeeOption[];
}

export { assignmentSelect, versionSelect };


export async function getEmployeeScheduleAssignments(employeeId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_schedule_assignments")
    .select(assignmentSelect)
    .eq("employee_id", employeeId)
    .order("effective_start_date", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw new Error("Unable to load employee schedule history.");
  return (data ?? []) as unknown as EmployeeScheduleAssignment[];
}

export async function getAssignmentPreview(employeeId: string, startDate: string) {
  const assignments = await getEmployeeScheduleAssignments(employeeId);
  return {
    current: assignments.find((item) =>
      !item.is_superseded
      && item.effective_start_date < startDate
      && (!item.effective_end_date || item.effective_end_date >= startDate)
    ) ?? null,
    future: assignments.filter((item) =>
      !item.is_superseded && item.effective_start_date >= startDate
    ),
  };
}

export async function getBulkAssignmentPreview(employeeIds: string[], startDate: string) {
  const supabase = await createClient();
  if (employeeIds.length === 0) return { ending: 0, superseding: 0, unassigned: 0 };
  const { data, error } = await supabase
    .from("employee_schedule_assignments")
    .select("employee_id,effective_start_date,effective_end_date,is_superseded")
    .in("employee_id", employeeIds)
    .eq("is_superseded", false);
  if (error) throw new Error("Unable to preview schedule assignments.");
  const rows = data ?? [];
  const endingEmployees = new Set(rows.filter((item) =>
    item.effective_start_date < startDate
      && (!item.effective_end_date || item.effective_end_date >= startDate)
  ).map((item) => item.employee_id));
  const superseding = rows.filter((item) => item.effective_start_date >= startDate).length;
  return {
    ending: endingEmployees.size,
    superseding,
    unassigned: employeeIds.filter((id) => !rows.some((item) => item.employee_id === id)).length,
  };
}


export async function getResolvedEmployeeSchedule(
  _employeeId: string,
  companyDate = companyDateAt(),
): Promise<ResolvedEmployeeSchedule> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_schedule", {
    p_company_date: companyDate,
  });
  if (error) throw new Error("Unable to load the employee schedule.");

  const payload = (data ?? {}) as Record<string, unknown>;
  const assignment = (payload.assignment ?? null) as EmployeeScheduleAssignmentSummary | null;
  const version = (payload.version ?? null) as ResolvedScheduleVersion | null;
  const upcomingAssignment = (payload.upcomingAssignment ?? null) as EmployeeScheduleAssignmentSummary | null;

  return {
    companyDate,
    state: resolveScheduleState(companyDate, assignment, version),
    assignment,
    template: assignment?.template ?? null,
    version,
    weekday: weekdayForCompanyDate(companyDate),
    upcomingAssignment,
  };
}
