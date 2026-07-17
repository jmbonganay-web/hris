"use server";

import { revalidatePath } from "next/cache";
import { requireNotificationSettingsManager } from "@/features/notifications/auth";
import { mapNotificationError } from "@/features/notifications/errors";
import { validateNotificationRuleInput } from "@/features/notifications/validation";
import type { NotificationActionState, NotificationRuleType } from "@/features/notifications/types";

function numberOrNull(value: FormDataEntryValue | null) {
  if (value === null || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}
function refresh() {
  revalidatePath("/admin/notifications/settings");
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
  revalidatePath("/", "layout");
}

export async function updateNotificationRule(formData: FormData): Promise<NotificationActionState> {
  const { supabase } = await requireNotificationSettingsManager();
  const input = {
    typeCode: String(formData.get("typeCode")) as NotificationRuleType,
    enabled: formData.get("enabled") === "on",
    initialDelayDays: numberOrNull(formData.get("initialDelayDays")),
    repeatIntervalDays: Number(formData.get("repeatIntervalDays")),
    escalationAfterDays: numberOrNull(formData.get("escalationAfterDays")),
    leadTimeDays: numberOrNull(formData.get("leadTimeDays")),
    retentionDays: Number(formData.get("retentionDays")),
    expectedVersion: Number(formData.get("expectedVersion")),
    requestId: String(formData.get("requestId") || crypto.randomUUID()),
  };
  const checked = validateNotificationRuleInput(input);
  if (checked.error || !checked.data) return { error: checked.error };
  const { error } = await supabase.rpc("update_notification_rule", {
    p_type_code: checked.data.typeCode,
    p_enabled: checked.data.enabled,
    p_initial_delay_days: checked.data.initialDelayDays,
    p_repeat_interval_days: checked.data.repeatIntervalDays,
    p_escalation_after_days: checked.data.escalationAfterDays,
    p_lead_time_days: checked.data.leadTimeDays,
    p_retention_days: checked.data.retentionDays,
    p_expected_version: checked.data.expectedVersion,
    p_request_id: checked.data.requestId,
  });
  if (error) return { error: mapNotificationError(error.message) };
  refresh();
  return { success: "Notification rule updated." };
}

export async function resetNotificationRules(formData: FormData): Promise<NotificationActionState> {
  const { supabase } = await requireNotificationSettingsManager();
  if (formData.get("confirm") !== "yes") return { error: "Confirm the notification rule reset." };
  const { error } = await supabase.rpc("reset_notification_rules_to_defaults", { p_request_id: crypto.randomUUID() });
  if (error) return { error: mapNotificationError(error.message) };
  refresh();
  return { success: "Notification rules reset to approved defaults." };
}

export async function runNotificationCycleNow(formData: FormData): Promise<NotificationActionState> {
  const { supabase } = await requireNotificationSettingsManager();
  if (formData.get("confirm") !== "yes") return { error: "Confirm the manual notification cycle." };
  const { error } = await supabase.rpc("run_notification_cycle_now", { p_request_id: crypto.randomUUID() });
  if (error) return { error: mapNotificationError(error.message) };
  refresh();
  return { success: "Notification cycle finished. Review the latest run status below." };
}
