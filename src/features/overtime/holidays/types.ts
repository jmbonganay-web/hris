export const holidayTypes = [
  "regular_holiday",
  "special_non_working_holiday",
  "company_holiday",
] as const;

export type HolidayType = (typeof holidayTypes)[number];

export type HolidayCalendarVersion = {
  id: string;
  holiday_group_id: string;
  revision_number: number;
  holiday_date: string;
  holiday_name: string;
  holiday_type: HolidayType;
  is_active: boolean;
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

export type HolidayCalendarGroup = {
  id: string;
  active_version_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  active_version: HolidayCalendarVersion | null;
};

export type HolidayActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: {
    holidayDate?: string;
    holidayName?: string;
    holidayType?: HolidayType;
    isActive?: "true" | "false";
  };
};
