import type { EmployeeAuditEntry } from "./types";

export type AuditPresentation = {
  title: string;
  detail: string | null;
  actorLabel: string;
};

const actionTitles: Record<string, string> = {
  "hr_note.created": "HR note created",
  "hr_note.updated": "HR note updated",
  "hr_note.deleted": "HR note deleted",
  "hr_note.restored": "HR note restored",
  "personal_details.updated": "Personal details updated",
  "employment_details.updated": "Employment details updated",
  "manager.changed": "Manager changed",
  "emergency_contact.created": "Emergency contact added",
  "emergency_contact.updated": "Emergency contact updated",
  "emergency_contact.deleted": "Emergency contact deleted",
  "avatar.uploaded": "Profile photo uploaded",
  "avatar.replaced": "Profile photo replaced",
  "avatar.removed": "Profile photo removed",
  "employee.archived": "Employee archived",
  "employee.restored": "Employee restored",
  "sensitive_details.updated": "Sensitive details updated",
  "sensitive_details.cleared": "Sensitive details cleared",
  "sensitive_field.revealed": "Sensitive field revealed",
};

const fieldLabels: Record<string, string> = {
  middle_name: "Middle name",
  preferred_name: "Preferred name",
  date_of_birth: "Date of birth",
  gender: "Gender",
  civil_status: "Civil status",
  nationality: "Nationality",
  personal_email: "Personal email",
  phone: "Phone",
  address_line_1: "Address line 1",
  address_line_2: "Address line 2",
  city: "City",
  state_province: "State/province",
  postal_code: "Postal code",
  country: "Country",
  department_id: "Department",
  job_title_id: "Job title",
  manager_id: "Manager",
  employment_type: "Employment type",
  employment_status: "Employment status",
  hire_date: "Hire date",
  probation_end_date: "Probation end date",
  regularization_date: "Regularization date",
  work_location: "Work location",
  work_schedule: "Work schedule",
  full_name: "Contact name",
  relationship: "Relationship",
  email: "Email",
  is_primary: "Primary contact",
  sss_number: "SSS number",
  philhealth_number: "PhilHealth number",
  pagibig_number: "Pag-IBIG number",
  tin: "TIN",
  bank_name: "Bank name",
  account_name: "Account name",
  account_number: "Account number",
  payroll_account_type: "Payroll account type",
  category: "Category",
  content: "Content",
  avatar: "Profile photo",
  archived_at: "Archive status",
};

const beforeAfterAllowed = new Set([
  "department_id",
  "job_title_id",
  "manager_id",
  "employment_type",
  "employment_status",
  "hire_date",
  "probation_end_date",
  "regularization_date",
  "work_location",
  "work_schedule",
]);

function actorName(entry: EmployeeAuditEntry) {
  if (!entry.actor_profile_id || !entry.actor) {
    return "System / database operation";
  }
  return entry.actor.display_name?.trim()
    || [entry.actor.first_name, entry.actor.last_name].filter(Boolean).join(" ")
    || "HR user";
}

function readableValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "Not assigned";
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (typeof record.label === "string") return record.label;
  }
  if (typeof value === "string") return value.replaceAll("_", " ");
  return String(value);
}

function detailForSafeBeforeAfter(entry: EmployeeAuditEntry) {
  const details: string[] = [];
  for (const field of entry.changed_fields) {
    if (!beforeAfterAllowed.has(field)) continue;
    if (!(field in entry.before_values) && !(field in entry.after_values)) continue;
    const label = fieldLabels[field] ?? field.replaceAll("_", " ");
    const before = readableValue(entry.before_values[field]);
    const after = readableValue(entry.after_values[field]);
    details.push(`${label}: ${before} → ${after}`);
  }
  return details.length > 0 ? details.join("; ") : null;
}

function changedFieldDetail(entry: EmployeeAuditEntry) {
  if (entry.changed_fields.length === 0) return null;
  return entry.changed_fields
    .map((field) => fieldLabels[field] ?? field.replaceAll("_", " "))
    .join(", ");
}

export function describeAuditEntry(
  entry: EmployeeAuditEntry,
): AuditPresentation {
  const title = actionTitles[entry.action]
    ?? entry.action.replaceAll(".", " ").replaceAll("_", " ");

  const detail = entry.entity_type === "employment"
    || entry.entity_type === "manager"
    ? detailForSafeBeforeAfter(entry)
    : changedFieldDetail(entry);

  return {
    title,
    detail,
    actorLabel: actorName(entry),
  };
}

export function auditFieldLabel(field: string) {
  return fieldLabels[field] ?? field.replaceAll("_", " ");
}
