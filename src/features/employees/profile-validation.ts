import type {
  EmployeeActionState,
  EmploymentStatus,
  EmploymentType,
} from "./types";

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const AVATAR_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function optional(formData: FormData, name: string) {
  return value(formData, name) || null;
}

function invalidState(fieldErrors: Record<string, string>): EmployeeActionState {
  return { error: "Please correct the highlighted fields.", fieldErrors };
}

export type PersonalDetailsInput = {
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
};

export function validatePersonalDetails(formData: FormData): {
  data?: PersonalDetailsInput;
  state?: EmployeeActionState;
} {
  const data: PersonalDetailsInput = {
    middle_name: optional(formData, "middle_name"),
    preferred_name: optional(formData, "preferred_name"),
    date_of_birth: optional(formData, "date_of_birth"),
    gender: optional(formData, "gender"),
    civil_status: optional(formData, "civil_status"),
    nationality: optional(formData, "nationality"),
    personal_email: optional(formData, "personal_email")?.toLowerCase() ?? null,
    phone: optional(formData, "phone"),
    address_line_1: optional(formData, "address_line_1"),
    address_line_2: optional(formData, "address_line_2"),
    city: optional(formData, "city"),
    state_province: optional(formData, "state_province"),
    postal_code: optional(formData, "postal_code"),
    country: optional(formData, "country"),
  };

  const fieldErrors: Record<string, string> = {};
  if (data.personal_email && !EMAIL_PATTERN.test(data.personal_email)) {
    fieldErrors.personal_email = "Enter a valid personal email.";
  }
  if (data.date_of_birth && !DATE_PATTERN.test(data.date_of_birth)) {
    fieldErrors.date_of_birth = "Enter a valid date of birth.";
  }
  if (data.preferred_name && data.preferred_name.length > 80) {
    fieldErrors.preferred_name = "Preferred name must be 80 characters or fewer.";
  }

  return Object.keys(fieldErrors).length ? { state: invalidState(fieldErrors) } : { data };
}

export type EmploymentDetailsInput = {
  employee_number: string;
  first_name: string;
  last_name: string;
  work_email: string;
  department_id: string | null;
  job_title_id: string | null;
  employment_type: EmploymentType;
  employment_status: EmploymentStatus;
  hire_date: string;
  probation_end_date: string | null;
  regularization_date: string | null;
  work_location: string | null;
  work_schedule: string | null;
};

const employmentTypes: EmploymentType[] = ["full_time", "part_time", "contract", "intern"];
const employmentStatuses: EmploymentStatus[] = ["active", "probation", "on_leave", "inactive", "terminated"];

export function validateEmploymentDetails(formData: FormData): {
  data?: EmploymentDetailsInput;
  state?: EmployeeActionState;
} {
  const data: EmploymentDetailsInput = {
    employee_number: value(formData, "employee_number"),
    first_name: value(formData, "first_name"),
    last_name: value(formData, "last_name"),
    work_email: value(formData, "work_email").toLowerCase(),
    department_id: optional(formData, "department_id"),
    job_title_id: optional(formData, "job_title_id"),
    employment_type: value(formData, "employment_type") as EmploymentType,
    employment_status: value(formData, "employment_status") as EmploymentStatus,
    hire_date: value(formData, "hire_date"),
    probation_end_date: optional(formData, "probation_end_date"),
    regularization_date: optional(formData, "regularization_date"),
    work_location: optional(formData, "work_location"),
    work_schedule: optional(formData, "work_schedule"),
  };

  const fieldErrors: Record<string, string> = {};
  if (!data.employee_number) fieldErrors.employee_number = "Employee ID is required.";
  if (!data.first_name) fieldErrors.first_name = "First name is required.";
  if (!data.last_name) fieldErrors.last_name = "Last name is required.";
  if (!EMAIL_PATTERN.test(data.work_email)) fieldErrors.work_email = "Enter a valid work email.";
  if (!employmentTypes.includes(data.employment_type)) fieldErrors.employment_type = "Select a valid employment type.";
  if (!employmentStatuses.includes(data.employment_status)) fieldErrors.employment_status = "Select a valid status.";
  if (!DATE_PATTERN.test(data.hire_date)) fieldErrors.hire_date = "Hire date is required.";
  if (data.probation_end_date && !DATE_PATTERN.test(data.probation_end_date)) fieldErrors.probation_end_date = "Enter a valid probation end date.";
  if (data.regularization_date && !DATE_PATTERN.test(data.regularization_date)) fieldErrors.regularization_date = "Enter a valid regularization date.";
  if (data.probation_end_date && data.probation_end_date < data.hire_date) fieldErrors.probation_end_date = "Probation end date cannot be before the hire date.";
  if (data.regularization_date && data.regularization_date < data.hire_date) fieldErrors.regularization_date = "Regularization date cannot be before the hire date.";

  return Object.keys(fieldErrors).length ? { state: invalidState(fieldErrors) } : { data };
}

export type EmergencyContactInput = {
  full_name: string;
  relationship: string;
  phone: string;
  email: string | null;
  is_primary: boolean;
};

export function validateEmergencyContact(formData: FormData): {
  data?: EmergencyContactInput;
  state?: EmployeeActionState;
} {
  const data: EmergencyContactInput = {
    full_name: value(formData, "full_name"),
    relationship: value(formData, "relationship"),
    phone: value(formData, "phone"),
    email: optional(formData, "email")?.toLowerCase() ?? null,
    is_primary: formData.get("is_primary") === "on",
  };
  const fieldErrors: Record<string, string> = {};
  if (!data.full_name) fieldErrors.full_name = "Contact name is required.";
  if (!data.relationship) fieldErrors.relationship = "Relationship is required.";
  if (!data.phone) fieldErrors.phone = "Phone number is required.";
  if (data.email && !EMAIL_PATTERN.test(data.email)) fieldErrors.email = "Enter a valid email address.";

  return Object.keys(fieldErrors).length ? { state: invalidState(fieldErrors) } : { data };
}

export function validateAvatarFile(file: File | null): { extension?: string; error?: string } {
  if (!file || file.size === 0) return { error: "Select an image to upload." };
  const extension = AVATAR_TYPES.get(file.type);
  if (!extension) return { error: "Upload a JPG, PNG, or WebP image." };
  if (file.size > MAX_AVATAR_SIZE) return { error: "Profile photos must be 5 MB or smaller." };
  return { extension };
}
