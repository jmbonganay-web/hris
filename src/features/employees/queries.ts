import { createClient } from "@/lib/supabase/server";
import type { DepartmentOption, EmployeeRecord, JobTitleOption } from "./types";

const employeeSelect = `
  id, profile_id, employee_number, first_name, last_name, work_email, personal_email, phone,
  department_id, job_title_id, manager_id, employment_type, employment_status,
  hire_date, work_location, archived_at, created_at,
  department:departments!employees_department_id_fkey(id,name,code,is_active,archived_at),
  job_title:job_titles!employees_job_title_id_fkey(id,title,department_id,is_active,archived_at)
`;

function appendUnique<T extends { id: string }>(items: T[], item: T | null) {
  if (!item || items.some((existing) => existing.id === item.id)) return items;
  return [...items, item];
}

export async function getEmployeeOptions(current?: {
  departmentId?: string | null;
  jobTitleId?: string | null;
}) {
  const supabase = await createClient();
  const [{ data: activeDepartments, error: departmentError }, { data: activeJobTitles, error: jobTitleError }] = await Promise.all([
    supabase
      .from("departments")
      .select("id,name,code,is_active,archived_at")
      .eq("is_active", true)
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("job_titles")
      .select("id,title,department_id,is_active,archived_at")
      .eq("is_active", true)
      .is("archived_at", null)
      .order("title"),
  ]);

  if (departmentError || jobTitleError) throw new Error("Unable to load employee organization options.");

  const [currentDepartmentResult, currentJobTitleResult] = await Promise.all([
    current?.departmentId && !(activeDepartments ?? []).some((item) => item.id === current.departmentId)
      ? supabase
          .from("departments")
          .select("id,name,code,is_active,archived_at")
          .eq("id", current.departmentId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    current?.jobTitleId && !(activeJobTitles ?? []).some((item) => item.id === current.jobTitleId)
      ? supabase
          .from("job_titles")
          .select("id,title,department_id,is_active,archived_at")
          .eq("id", current.jobTitleId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (currentDepartmentResult.error || currentJobTitleResult.error) {
    throw new Error("Unable to load the employee's current organization assignments.");
  }

  return {
    departments: appendUnique(
      (activeDepartments ?? []) as DepartmentOption[],
      currentDepartmentResult.data as DepartmentOption | null,
    ),
    jobTitles: appendUnique(
      (activeJobTitles ?? []) as JobTitleOption[],
      currentJobTitleResult.data as JobTitleOption | null,
    ),
  };
}

export async function getEmployee(id: string): Promise<EmployeeRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("employees").select(employeeSelect).eq("id", id).maybeSingle();
  if (error) {
    console.error("Supabase getEmployee error:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error("Unable to load employee.");
  }
  return data as unknown as EmployeeRecord | null;
}

export async function getEmployees(params: {
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

  let request = supabase
    .from("employees")
    .select(employeeSelect, { count: "exact" })
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .range(from, to);

  const q = params.query?.trim();
  if (q) request = request.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,work_email.ilike.%${q}%,employee_number.ilike.%${q}%`);
  if (params.department) request = request.eq("department_id", params.department);
  if (params.status) request = request.eq("employment_status", params.status);

  const { data, error, count } = await request;
  if (error) {
    console.error("Supabase getEmployees error:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error("Unable to load employees.");
  }
  return {
    employees: (data ?? []) as unknown as EmployeeRecord[],
    count: count ?? 0,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
  };
}
