export const scheduleWeekdays = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type ScheduleWeekday = typeof scheduleWeekdays[number];

export type ScheduleActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

export type ScheduleVersionRecord = {
  id: string;
  schedule_template_id: string;
  effective_date: string;
  working_days: ScheduleWeekday[];
  start_time: string;
  end_time: string;
  break_minutes: number;
  change_reason: string | null;
  created_by: string;
  created_at: string;
  creator?: {
    id: string;
    display_name: string | null;
    first_name: string;
    last_name: string;
  } | null;
};

export type ResolvedScheduleVersion = Pick<
  ScheduleVersionRecord,
  | "id"
  | "schedule_template_id"
  | "effective_date"
  | "working_days"
  | "start_time"
  | "end_time"
  | "break_minutes"
>;

export type ScheduleTemplateRecord = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_archived: boolean;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
  archived_by: string | null;
  archived_at: string | null;
  current_version?: ScheduleVersionRecord | null;
  upcoming_versions?: ScheduleVersionRecord[];
  version_history?: ScheduleVersionRecord[];
  assigned_employee_count?: number;
};

export type ScheduleEmployeeOption = {
  id: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  department_id: string | null;
  department: { id: string; name: string } | null;
};

export type EmployeeScheduleAssignment = {
  id: string;
  employee_id: string;
  schedule_template_id: string;
  effective_start_date: string;
  effective_end_date: string | null;
  assignment_reason: string | null;
  is_superseded: boolean;
  superseded_at: string | null;
  superseded_by_assignment_id: string | null;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
  template?: ScheduleTemplateRecord | null;
  employee?: ScheduleEmployeeOption | null;
  creator?: {
    id: string;
    display_name: string | null;
    first_name: string;
    last_name: string;
  } | null;
};

export type EmployeeScheduleAssignmentSummary = {
  id: string;
  employee_id: string;
  schedule_template_id: string;
  effective_start_date: string;
  effective_end_date: string | null;
  is_superseded: false;
  template: Pick<
    ScheduleTemplateRecord,
    "id" | "code" | "name" | "is_archived"
  >;
};

export type ScheduleResolutionState =
  | "scheduled_workday"
  | "rest_day"
  | "unassigned"
  | "unavailable";

export type ResolvedEmployeeSchedule = {
  companyDate: string;
  state: ScheduleResolutionState;
  assignment: EmployeeScheduleAssignmentSummary | null;
  template: Pick<ScheduleTemplateRecord, "id" | "code" | "name" | "is_archived"> | null;
  version: ResolvedScheduleVersion | null;
  weekday: ScheduleWeekday;
  upcomingAssignment: EmployeeScheduleAssignmentSummary | null;
};

export type ScheduleTemplateInput = {
  code: string;
  name: string;
  description: string | null;
};

export type ScheduleVersionInput = {
  effective_date: string;
  working_days: ScheduleWeekday[];
  start_time: string;
  end_time: string;
  break_minutes: number;
  change_reason: string | null;
};

export type ScheduleAssignmentInput = {
  employee_ids: string[];
  schedule_template_id: string;
  effective_start_date: string;
  effective_end_date: string | null;
  assignment_reason: string | null;
};
