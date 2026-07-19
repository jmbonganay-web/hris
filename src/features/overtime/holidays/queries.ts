import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  HolidayCalendarGroup,
  HolidayCalendarVersion,
} from "./types";

const versionSelect = `
  id,holiday_group_id,revision_number,holiday_date,holiday_name,
  holiday_type,holiday_count,is_active,created_by,created_at,change_reason,
  creator:profiles!holiday_calendar_versions_created_by_fkey(
    id,display_name,first_name,last_name
  )
`;

export async function getHolidayCalendarGroups(): Promise<HolidayCalendarGroup[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("holiday_calendar_groups")
    .select(`
      id,active_version_id,created_by,created_at,updated_at,
      active_version:holiday_calendar_versions!holiday_calendar_groups_active_version_fkey(
        ${versionSelect}
      )
    `)
    .order("updated_at", { ascending: false });

  if (error) throw new Error("Unable to load holidays.");
  return (data ?? []) as unknown as HolidayCalendarGroup[];
}

export async function getHolidayCalendarGroup(
  holidayGroupId: string,
): Promise<{
  group: HolidayCalendarGroup | null;
  versions: HolidayCalendarVersion[];
}> {
  const supabase = await createClient();
  const { data: group, error: groupError } = await supabase
    .from("holiday_calendar_groups")
    .select(`
      id,active_version_id,created_by,created_at,updated_at,
      active_version:holiday_calendar_versions!holiday_calendar_groups_active_version_fkey(
        ${versionSelect}
      )
    `)
    .eq("id", holidayGroupId)
    .maybeSingle();

  if (groupError) throw new Error("Unable to load the holiday.");
  if (!group) return { group: null, versions: [] };

  const { data: versions, error: versionError } = await supabase
    .from("holiday_calendar_versions")
    .select(versionSelect)
    .eq("holiday_group_id", holidayGroupId)
    .order("revision_number", { ascending: false });

  if (versionError) throw new Error("Unable to load holiday history.");
  return {
    group: group as unknown as HolidayCalendarGroup,
    versions: (versions ?? []) as unknown as HolidayCalendarVersion[],
  };
}
