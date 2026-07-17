import "server-only";
import { createClient } from "@/lib/supabase/server";
import { NOTIFICATION_PAGE_SIZE } from "./constants";
import type { NotificationCenterFilters, NotificationDashboardSummary, NotificationListItem } from "./types";

export { normalizeNotificationDashboardSummary, normalizeNotificationRows } from "./normalize";
import { normalizeNotificationDashboardSummary, normalizeNotificationRows } from "./normalize";
export async function listNotifications(filters: NotificationCenterFilters): Promise<{items:NotificationListItem[];total:number;page:number;pageSize:number}> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_notification_center", {
    p_module: filters.module ?? null, p_status: filters.status ?? null, p_priority: filters.priority ?? null,
    p_query: filters.query ?? null, p_from: filters.from ?? null, p_to: filters.to ?? null, p_page: filters.page,
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return { items: normalizeNotificationRows(rows), total: rows.length ? Number(rows[0].total_count) : 0, page: filters.page, pageSize: NOTIFICATION_PAGE_SIZE };
}
export async function getUnreadNotificationCount(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_unread_notification_count");
  if (error) return 0;
  return Number(data ?? 0);
}
export async function getNotificationDashboardSummary(
  limit = 5,
): Promise<NotificationDashboardSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "get_notification_dashboard_summary",
    { p_limit: Math.min(Math.max(Math.trunc(limit), 1), 10) },
  );
  if (error) throw new Error(error.message);
  return normalizeNotificationDashboardSummary(
    (data ?? {}) as Record<string, unknown>,
  );
}
