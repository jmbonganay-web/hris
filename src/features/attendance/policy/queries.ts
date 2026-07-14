import "server-only";

import { createClient } from "@/lib/supabase/server";
import { companyDateAt } from "@/features/attendance/time";
import type { AttendancePolicyVersion } from "./types";

const policySelect = `
  id,effective_date,late_grace_minutes,created_by,created_at,change_reason,
  creator:profiles!attendance_policy_versions_created_by_fkey(
    id,display_name,first_name,last_name
  )
`;

export async function getAttendancePolicyVersions(): Promise<{
  current: AttendancePolicyVersion | null;
  upcoming: AttendancePolicyVersion[];
  history: AttendancePolicyVersion[];
}> {
  const supabase = await createClient();
  const companyDate = companyDateAt();
  const { data, error } = await supabase
    .from("attendance_policy_versions")
    .select(policySelect)
    .order("effective_date", { ascending: false });
  if (error) throw new Error("Unable to load attendance policies.");
  const rows = (data ?? []) as unknown as AttendancePolicyVersion[];
  return {
    current: rows.find((row) => row.effective_date <= companyDate) ?? null,
    upcoming: rows.filter((row) => row.effective_date > companyDate),
    history: rows.filter((row) => row.effective_date <= companyDate),
  };
}

export async function getEffectiveAttendancePolicy(
  attendanceDate: string,
): Promise<AttendancePolicyVersion | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_policy_versions")
    .select(policySelect)
    .lte("effective_date", attendanceDate)
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Unable to load the attendance policy.");
  return data as unknown as AttendancePolicyVersion | null;
}
