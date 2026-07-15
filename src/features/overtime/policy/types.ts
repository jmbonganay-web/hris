export type OvertimePolicyVersion = {
  id: string;
  effective_date: string;
  minimum_qualifying_minutes: number;
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

export type OvertimePolicyActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: {
    effectiveDate?: string;
    minimumQualifyingMinutes?: string;
  };
};
