"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { mapNotificationError } from "@/features/notifications/errors";
import { validateBulkNotificationIds } from "@/features/notifications/validation";
import type { NotificationActionState } from "@/features/notifications/types";

function refreshNotificationViews() {
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
  revalidatePath("/", "layout");
}

async function invoke(name: string, args: Record<string, unknown>): Promise<NotificationActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(name, args);
  if (error) return { error: mapNotificationError(error.message) };
  refreshNotificationViews();
  return { success: "Notification updated." };
}

export async function markNotificationRead(notificationId: string): Promise<NotificationActionState> {
  const checked = validateBulkNotificationIds([notificationId]);
  if (checked.error) return { error: checked.error };
  return invoke("mark_notification_read", { p_notification_id: notificationId });
}

export async function markNotificationUnread(notificationId: string): Promise<NotificationActionState> {
  const checked = validateBulkNotificationIds([notificationId]);
  if (checked.error) return { error: checked.error };
  return invoke("mark_notification_unread", { p_notification_id: notificationId, p_request_id: crypto.randomUUID() });
}

export async function dismissNotification(notificationId: string): Promise<NotificationActionState> {
  const checked = validateBulkNotificationIds([notificationId]);
  if (checked.error) return { error: checked.error };
  return invoke("dismiss_notification", { p_notification_id: notificationId, p_request_id: crypto.randomUUID() });
}

function idsFrom(formData: FormData) {
  return formData.getAll("notificationIds").map(String).filter(Boolean);
}

export async function bulkMarkNotificationsRead(formData: FormData): Promise<NotificationActionState> {
  const checked = validateBulkNotificationIds(idsFrom(formData));
  if (checked.error || !checked.data) return { error: checked.error };
  return invoke("bulk_mark_notifications_read", { p_notification_ids: checked.data, p_request_id: crypto.randomUUID() });
}

export async function bulkDismissNotifications(formData: FormData): Promise<NotificationActionState> {
  const checked = validateBulkNotificationIds(idsFrom(formData));
  if (checked.error || !checked.data) return { error: checked.error };
  return invoke("bulk_dismiss_notifications", { p_notification_ids: checked.data, p_request_id: crypto.randomUUID() });
}
