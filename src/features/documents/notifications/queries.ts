export function normalizeNotificationRows(rows: Array<Record<string, unknown>>) {
  return rows.map((row) => ({
    id: String(row.id),
    type: String(row.type),
    title: String(row.title),
    body: String(row.body),
    resourceType: row.resource_type ? String(row.resource_type) : null,
    resourceId: row.resource_id ? String(row.resource_id) : null,
    createdAt: String(row.created_at),
    isRead: Boolean(row.read_at),
  }));
}

export async function listDocumentNotifications(limit = 20) {
  const { createClient } = await import("../../../lib/supabase/server.ts");
  const supabase = await createClient();
  const { data, error } = await supabase.from("notifications")
    .select("id,type,title,body,resource_type,resource_id,created_at,read_at")
    .like("type", "document_%")
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(100, limit)));
  if (error) throw new Error(error.message);
  return normalizeNotificationRows((data ?? []) as Array<Record<string, unknown>>);
}

export async function getUnreadDocumentNotificationCount() {
  const { createClient } = await import("../../../lib/supabase/server.ts");
  const supabase = await createClient();
  const { count, error } = await supabase.from("notifications")
    .select("id", { count: "exact", head: true })
    .like("type", "document_%")
    .is("read_at", null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}
