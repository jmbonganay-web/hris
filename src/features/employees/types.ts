export type AppRole = "super_admin" | "hr_admin" | "employee";
export type EmploymentStatus = "active" | "probation" | "on_leave" | "inactive" | "terminated";
export type EmploymentType = "full_time" | "part_time" | "contract" | "intern";

export type DepartmentOption = {
  id: string;
  name: string;
  code?: string | null;
  is_active: boolean;
  archived_at: string | null;
};

export type JobTitleOption = {
  id: string;
  title: string;
  department_id: string | null;
  is_active: boolean;
  archived_at: string | null;
};

export type EmployeeRecord = {
  id: string;
  profile_id: string | null;
  employee_number: string;
  first_name: string;
  last_name: string;
  work_email: string;
  personal_email: string | null;
  phone: string | null;
  department_id: string | null;
  job_title_id: string | null;
  manager_id: string | null;
  employment_type: EmploymentType;
  employment_status: EmploymentStatus;
  hire_date: string;
  work_location: string | null;
  archived_at: string | null;
  created_at: string;
  department: DepartmentOption | null;
  job_title: JobTitleOption | null;
};

export type EmployeeActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};
