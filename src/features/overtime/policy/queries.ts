import "server-only";

import { companyDateAt } from "@/features/attendance/time";
import { createClient } from "@/lib/supabase/server";
import type { OvertimePolicyVersion } from "./types";

const policySelect = `
  id,effective_date,minimum_qualifying_minutes,created_by,created_at,change_reason,
  creator:profiles!overtime_policy_versions_created_by_fkey(
    id,display_name,first_name,last_name
  )
`;

export async function getOvertimePolicyVersions(): Promise<{
  current: OvertimePolicyVersion | null;
  upcoming: OvertimePolicyVersion[];
  history: OvertimePolicyVersion[];
}> {
  const supabase = await createClient();
  const companyDate = companyDateAt();
  const { data, error } = await supabase
    .from("overtime_policy_versions")
    .select(policySelect)
    .order("effective_date", { ascending: false });

  if (error) throw new Error("Unable to load overtime policies.");
  const rows = (data ?? []) as unknown as OvertimePolicyVersion[];
  return {
    current: rows.find((row) => row.effective_date <= companyDate) ?? null,
    upcoming: rows.filter((row) => row.effective_date > companyDate),
    history: rows.filter((row) => row.effective_date <= companyDate),
  };
}
