import { formatCompanyDateTime } from "../../attendance/time.ts";
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
  "attendance.clocked_in": "Clocked in",
  "attendance.clocked_out": "Clocked out",
  "attendance.created_by_hr": "Attendance created by HR",
  "attendance.corrected": "Attendance corrected",
  "attendance_correction.requested": "Attendance correction requested",
  "attendance_correction.approved": "Attendance correction approved",
  "attendance_correction.rejected": "Attendance correction rejected",
  "attendance_correction.cancelled": "Attendance correction cancelled",
  "schedule_template.created": "Schedule template created",
  "schedule_template.updated": "Schedule template updated",
  "schedule_template.archived": "Schedule template archived",
  "schedule_template.restored": "Schedule template restored",
  "schedule_version.created": "Schedule version created",
  "schedule_assignment.created": "Schedule assigned",
  "schedule_assignment.ended": "Previous schedule ended",
  "schedule_assignment.superseded": "Future schedule superseded",
  "attendance_policy.created": "Attendance policy created",
  "attendance_calculation.created": "Attendance calculation created",
  "attendance_calculation.recalculated": "Attendance recalculated",
  "attendance_calculation.finalized": "Attendance finalized",
  "attendance_finalization.started": "Attendance finalization started",
  "attendance_finalization.completed": "Attendance finalization completed",
  "attendance_finalization.failed": "Attendance finalization failed",
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
  attendance_date: "Attendance date",
  clock_in_at: "Clock in",
  clock_out_at: "Clock out",
  status: "Status",
  is_corrected: "Corrected",
  request_type: "Request type",
  request_status: "Request status",
  schedule_template_id: "Schedule",
  effective_date: "Effective date",
  working_days: "Working days",
  start_time: "Start time",
  end_time: "End time",
  break_minutes: "Break minutes",
  effective_start_date: "Effective start date",
  effective_end_date: "Effective end date",
  is_superseded: "Superseded",
  base_status: "Status",
  revision_number: "Revision",
  scheduled_minutes: "Scheduled minutes",
  worked_minutes: "Worked minutes",
  late_minutes: "Late minutes",
  undertime_minutes: "Undertime minutes",
  is_provisional: "Calculation state",
  policy_version_id: "Policy version",
  schedule_version_id: "Schedule version",
  calculation_source: "Calculation source",
  employees_processed: "Employees processed",
  absences_created: "Absences created",
  missing_clock_outs_finalized: "Missing clock-outs finalized",
  unchanged_results_skipped: "Unchanged results skipped",
  error_count: "Errors",
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
  "attendance_date",
  "clock_in_at",
  "clock_out_at",
  "status",
  "is_corrected",
  "request_type",
  "request_status",
  "schedule_template_id",
  "effective_date",
  "working_days",
  "start_time",
  "end_time",
  "break_minutes",
  "effective_start_date",
  "effective_end_date",
  "is_superseded",
  "base_status",
  "revision_number",
  "scheduled_minutes",
  "worked_minutes",
  "late_minutes",
  "undertime_minutes",
  "is_provisional",
  "policy_version_id",
  "schedule_version_id",
  "calculation_source",
  "employees_processed",
  "absences_created",
  "missing_clock_outs_finalized",
  "unchanged_results_skipped",
  "error_count",
]);

function actorName(entry: EmployeeAuditEntry) {
  if (!entry.actor_profile_id || !entry.actor) {
    return "System / database operation";
  }
  return entry.actor.display_name?.trim()
    || [entry.actor.first_name, entry.actor.last_name].filter(Boolean).join(" ")
    || "HR user";
}

function readableValue(field: string, value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "Not assigned";
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (typeof record.label === "string") return record.label;
  }
  if (typeof value === "string") {
    if (field === "clock_in_at" || field === "clock_out_at") {
      return formatCompanyDateTime(value);
    }
    return value.replaceAll("_", " ");
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function detailForSafeBeforeAfter(entry: EmployeeAuditEntry) {
  const details: string[] = [];
  for (const field of entry.changed_fields) {
    if (!beforeAfterAllowed.has(field)) continue;
    if (!(field in entry.before_values) && !(field in entry.after_values)) continue;
    const label = fieldLabels[field] ?? field.replaceAll("_", " ");
    const before = readableValue(field, entry.before_values[field]);
    const after = readableValue(field, entry.after_values[field]);
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

  const usesSafeBeforeAfter = [
    "employment",
    "manager",
    "attendance",
    "attendance_correction",
    "schedule_assignment",
    "attendance_policy",
    "attendance_calculation",
    "attendance_finalization",
  ].includes(entry.entity_type);
  const detail = usesSafeBeforeAfter
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
