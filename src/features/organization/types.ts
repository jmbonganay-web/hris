export type OrganizationActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

export type OrganizationStatusFilter = "active" | "inactive" | "archived" | "all";

export type EmployeeOption = {
  id: string;
  first_name: string;
  last_name: string;
  employee_number: string;
  department_id: string | null;
};

export type DepartmentRecord = {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  department_head_id: string | null;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  department_head: EmployeeOption | null;
  employee_count: number;
};

export type JobTitleRecord = {
  id: string;
  title: string;
  description: string | null;
  department_id: string | null;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  department: { id: string; name: string } | null;
  employee_count: number;
};

export type DepartmentInput = {
  name: string;
  code: string;
  description: string | null;
  department_head_id: string | null;
  is_active: boolean;
};

export type JobTitleInput = {
  title: string;
  description: string | null;
  department_id: string | null;
  is_active: boolean;
};
