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

export type ManagerSummary = {
  id: string;
  first_name: string;
  last_name: string;
  employee_number: string;
  employment_status: EmploymentStatus;
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
  probation_end_date: string | null;
  regularization_date: string | null;
  work_location: string | null;
  work_schedule: string | null;
  avatar_path: string | null;
  archived_at: string | null;
  created_at: string;
  department: DepartmentOption | null;
  job_title: JobTitleOption | null;
  manager?: ManagerSummary | null;
};

export type EmployeePersonalDetails = {
  employee_id: string;
  middle_name: string | null;
  preferred_name: string | null;
  date_of_birth: string | null;
  gender: string | null;
  civil_status: string | null;
  nationality: string | null;
  personal_email: string | null;
  phone: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state_province: string | null;
  postal_code: string | null;
  country: string | null;
  created_at: string;
  updated_at: string;
};

export type EmployeeEmergencyContact = {
  id: string;
  employee_id: string;
  full_name: string;
  relationship: string;
  phone: string;
  email: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
};

export type ManagerOption = ManagerSummary & {
  manager_id: string | null;
  job_title: { title: string } | null;
};

export type ExpandedEmployeeProfile = {
  employee: EmployeeRecord;
  personal: EmployeePersonalDetails | null;
  emergencyContacts: EmployeeEmergencyContact[];
  avatarUrl: string | null;
};

export type EmployeeActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
};
