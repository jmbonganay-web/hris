export type AttendancePolicyVersion = {
  id: string;
  effective_date: string;
  late_grace_minutes: number;
  created_by: string;
  created_at: string;
  change_reason: string | null;
  creator: {
    id: string;
    display_name: string | null;
    first_name: string;
    last_name: string;
  } | null;
};

export type AttendancePolicyActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: {
    effectiveDate?: string;
    lateGraceMinutes?: string;
  };
};
