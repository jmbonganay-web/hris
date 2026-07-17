import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { NotificationRule } from "../types";

export { normalizeNotificationRuleRows } from "./normalize";
import { normalizeNotificationRuleRows } from "./normalize";

export async function listNotificationRules(): Promise<NotificationRule[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_notification_rules");
  if (error) throw new Error(error.message);
  return normalizeNotificationRuleRows((data ?? []) as Array<Record<string, unknown>>);
}
