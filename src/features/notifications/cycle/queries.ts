import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { NotificationCycleSummary } from "../types";

export { normalizeNotificationCycleRows } from "./normalize";
import { normalizeNotificationCycleRows } from "./normalize";
export async function getNotificationCycleStatus(limit = 10): Promise<NotificationCycleSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_notification_cycle_status", { p_limit: Math.min(Math.max(Math.trunc(limit),1),50) });
  if (error) throw new Error(error.message);
  return normalizeNotificationCycleRows((data ?? []) as Array<Record<string, unknown>>);
}
