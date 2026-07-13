import { createClient } from "@/lib/supabase/server";
import type {
  DepartmentRecord,
  EmployeeOption,
  JobTitleRecord,
  OrganizationStatusFilter,
} from "./types";

const departmentSelect = `
  id, name, code, description, department_head_id, is_active, archived_at, created_at, updated_at,
  department_head:employees!departments_department_head_id_fkey(
    id, first_name, last_name, employee_number, department_id
  )
`;

const jobTitleSelect = `
  id, title, description, department_id, is_active, archived_at, created_at, updated_at,
  department:departments!job_titles_department_id_fkey(id,name)
`;

function cleanSearch(value?: string) {
  return value?.trim().replace(/[,%()]/g, " ").replace(/\s+/g, " ") ?? "";
}

function normalizedStatus(value?: string): OrganizationStatusFilter {
  return value === "inactive" || value === "archived" || value === "all"
    ? value
    : "active";
}

function employeeCounts(
  rows: Array<{ department_id?: string | null; job_title_id?: string | null }>,
  key: "department_id" | "job_title_id",
) {
  return rows.reduce<Record<string, number>>((counts, row) => {
    const value = row[key];
    if (value) counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

export async function getActiveEmployeeOptions(): Promise<EmployeeOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select("id,first_name,last_name,employee_number,department_id")
    .is("archived_at", null)
    .in("employment_status", ["active", "probation", "on_leave"])
    .order("last_name")
    .order("first_name");

  if (error) throw new Error("Unable to load department-head options.");
  return (data ?? []) as EmployeeOption[];
}

export async function getActiveDepartmentOptions(currentDepartmentId?: string | null) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("departments")
    .select("id,name,code,is_active,archived_at")
    .eq("is_active", true)
    .is("archived_at", null)
    .order("name");

  if (error) throw new Error("Unable to load departments.");

  if (!currentDepartmentId || (data ?? []).some((item) => item.id === currentDepartmentId)) {
    return data ?? [];
  }

  const { data: current, error: currentError } = await supabase
    .from("departments")
    .select("id,name,code,is_active,archived_at")
    .eq("id", currentDepartmentId)
    .maybeSingle();

  if (currentError) throw new Error("Unable to load the current department.");
  return current ? [...(data ?? []), current] : data ?? [];
}

export async function getActiveJobTitleOptions() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_titles")
    .select("id,title,department_id,is_active,archived_at")
    .eq("is_active", true)
    .is("archived_at", null)
    .order("title");

  if (error) throw new Error("Unable to load job titles.");
  return data ?? [];
}

export async function getDepartments(params: {
  query?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  const supabase = await createClient();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = params.pageSize ?? 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const status = normalizedStatus(params.status);
  const search = cleanSearch(params.query);

  let request = supabase
    .from("departments")
    .select(departmentSelect, { count: "exact" })
    .order("name")
    .range(from, to);

  if (status === "active") request = request.eq("is_active", true).is("archived_at", null);
  if (status === "inactive") request = request.eq("is_active", false).is("archived_at", null);
  if (status === "archived") request = request.not("archived_at", "is", null);
  if (search) request = request.or(`name.ilike.%${search}%,code.ilike.%${search}%`);

  const { data, error, count } = await request;
  if (error) throw new Error("Unable to load departments.");

  const ids = (data ?? []).map((item) => item.id);
  const { data: employees, error: employeeError } = ids.length
    ? await supabase
        .from("employees")
        .select("department_id")
        .in("department_id", ids)
        .is("archived_at", null)
        .in("employment_status", ["active", "probation", "on_leave"])
    : { data: [], error: null };

  if (employeeError) throw new Error("Unable to load department employee counts.");
  const counts = employeeCounts(employees ?? [], "department_id");

  return {
    departments: (data ?? []).map((item) => ({
      ...item,
      employee_count: counts[item.id] ?? 0,
    })) as unknown as DepartmentRecord[],
    count: count ?? 0,
    page,
    pageSize,
    status,
    totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
  };
}

export async function getDepartment(id: string): Promise<DepartmentRecord | null> {
  const supabase = await createClient();
  const [{ data, error }, { count, error: countError }] = await Promise.all([
    supabase.from("departments").select(departmentSelect).eq("id", id).maybeSingle(),
    supabase
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("department_id", id)
      .is("archived_at", null)
      .in("employment_status", ["active", "probation", "on_leave"]),
  ]);

  if (error || countError) throw new Error("Unable to load department.");
  return data ? ({ ...data, employee_count: count ?? 0 } as unknown as DepartmentRecord) : null;
}

export async function getJobTitles(params: {
  query?: string;
  department?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  const supabase = await createClient();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = params.pageSize ?? 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const status = normalizedStatus(params.status);
  const search = cleanSearch(params.query);

  let request = supabase
    .from("job_titles")
    .select(jobTitleSelect, { count: "exact" })
    .order("title")
    .range(from, to);

  if (status === "active") request = request.eq("is_active", true).is("archived_at", null);
  if (status === "inactive") request = request.eq("is_active", false).is("archived_at", null);
  if (status === "archived") request = request.not("archived_at", "is", null);
  if (params.department) request = request.eq("department_id", params.department);
  if (search) request = request.ilike("title", `%${search}%`);

  const { data, error, count } = await request;
  if (error) throw new Error("Unable to load job titles.");

  const ids = (data ?? []).map((item) => item.id);
  const { data: employees, error: employeeError } = ids.length
    ? await supabase
        .from("employees")
        .select("job_title_id")
        .in("job_title_id", ids)
        .is("archived_at", null)
        .in("employment_status", ["active", "probation", "on_leave"])
    : { data: [], error: null };

  if (employeeError) throw new Error("Unable to load job-title employee counts.");
  const counts = employeeCounts(employees ?? [], "job_title_id");

  return {
    jobTitles: (data ?? []).map((item) => ({
      ...item,
      employee_count: counts[item.id] ?? 0,
    })) as unknown as JobTitleRecord[],
    count: count ?? 0,
    page,
    pageSize,
    status,
    totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
  };
}

export async function getJobTitle(id: string): Promise<JobTitleRecord | null> {
  const supabase = await createClient();
  const [{ data, error }, { count, error: countError }] = await Promise.all([
    supabase.from("job_titles").select(jobTitleSelect).eq("id", id).maybeSingle(),
    supabase
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("job_title_id", id)
      .is("archived_at", null)
      .in("employment_status", ["active", "probation", "on_leave"]),
  ]);

  if (error || countError) throw new Error("Unable to load job title.");
  return data ? ({ ...data, employee_count: count ?? 0 } as unknown as JobTitleRecord) : null;
}
