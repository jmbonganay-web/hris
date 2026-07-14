export const activityFilters = [
  "all",
  "profile",
  "employment",
  "emergency",
  "sensitive",
  "hr_notes",
  "attendance",
  "schedule",
  "system",
] as const;

export type ActivityFilter = typeof activityFilters[number];

export type AuditActor = {
  id: string;
  display_name: string | null;
  first_name: string;
  last_name: string;
};

export type EmployeeAuditEntry = {
  id: string;
  employee_id: string | null;
  actor_profile_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  changed_fields: string[];
  before_values: Record<string, unknown>;
  after_values: Record<string, unknown>;
  metadata: Record<string, unknown>;
  source: "application" | "database_trigger";
  created_at: string;
  actor: AuditActor | null;
};

export type PaginatedActivity = {
  entries: EmployeeAuditEntry[];
  page: number;
  pageSize: 20;
  total: number;
  totalPages: number;
};

export const activityEntityFilters: Record<
  Exclude<ActivityFilter, "all" | "system">,
  string[]
> = {
  profile: ["personal_details", "avatar"],
  employment: ["employment", "manager", "employee"],
  emergency: ["emergency_contact"],
  sensitive: ["sensitive_data"],
  hr_notes: ["hr_note"],
  attendance: ["attendance", "attendance_correction"],
  schedule: ["schedule_assignment"],
};
