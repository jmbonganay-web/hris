import type { EmployeeActionState, EmploymentStatus, EmploymentType } from "./types";

const statuses: EmploymentStatus[] = ["active", "probation", "on_leave", "inactive", "terminated"];
const types: EmploymentType[] = ["full_time", "part_time", "contract", "intern"];

export type EmployeeInput = {
  employee_number: string;
  first_name: string;
  last_name: string;
  work_email: string;
  personal_email: string | null;
  phone: string | null;
  department_id: string | null;
  job_title_id: string | null;
  employment_type: EmploymentType;
  employment_status: EmploymentStatus;
  hire_date: string;
  work_location: string | null;
};

export function validateEmployee(formData: FormData): { data?: EmployeeInput; state?: EmployeeActionState } {
  const get = (name: string) => String(formData.get(name) ?? "").trim();
  const employee_number = get("employee_number");
  const first_name = get("first_name");
  const last_name = get("last_name");
  const work_email = get("work_email").toLowerCase();
  const personal_email = get("personal_email").toLowerCase() || null;
  const phone = get("phone") || null;
  const department_id = get("department_id") || null;
  const job_title_id = get("job_title_id") || null;
  const employment_type = get("employment_type") as EmploymentType;
  const employment_status = get("employment_status") as EmploymentStatus;
  const hire_date = get("hire_date");
  const work_location = get("work_location") || null;

  const fieldErrors: Record<string, string> = {};
  if (!employee_number) fieldErrors.employee_number = "Employee ID is required.";
  if (!first_name) fieldErrors.first_name = "First name is required.";
  if (!last_name) fieldErrors.last_name = "Last name is required.";
  if (!/^\S+@\S+\.\S+$/.test(work_email)) fieldErrors.work_email = "Enter a valid work email.";
  if (personal_email && !/^\S+@\S+\.\S+$/.test(personal_email)) fieldErrors.personal_email = "Enter a valid personal email.";
  if (!types.includes(employment_type)) fieldErrors.employment_type = "Select a valid employment type.";
  if (!statuses.includes(employment_status)) fieldErrors.employment_status = "Select a valid status.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hire_date)) fieldErrors.hire_date = "Hire date is required.";

  if (Object.keys(fieldErrors).length) return { state: { error: "Please correct the highlighted fields.", fieldErrors } };
  return { data: { employee_number, first_name, last_name, work_email, personal_email, phone, department_id, job_title_id, employment_type, employment_status, hire_date, work_location } };
}
