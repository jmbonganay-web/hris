import type { DocumentPermissionCode } from "../types.ts";

type PermissionRow = {
  user_id: string;
  role: string;
  permission_code: string | null;
  revoked_at: string | null;
};

export function normalizeDocumentPermissionRows(rows: PermissionRow[]) {
  const users = new Map<string, { userId: string; role: string; permissions: DocumentPermissionCode[] }>();
  for (const row of rows) {
    const entry = users.get(row.user_id) ?? { userId: row.user_id, role: row.role, permissions: [] };
    if (row.role === "super_admin") {
      entry.permissions = ["documents.review", "documents.manage"];
    } else if (
      !row.revoked_at
      && (row.permission_code === "documents.review" || row.permission_code === "documents.manage")
      && !entry.permissions.includes(row.permission_code)
    ) {
      entry.permissions.push(row.permission_code);
    }
    users.set(row.user_id, entry);
  }
  return [...users.values()];
}

export async function listDocumentPermissionGrants() {
  const { createClient } = await import("../../../lib/supabase/server.ts");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_document_permission_grants");
  if (error) throw new Error(error.message);
  return normalizeDocumentPermissionRows((data ?? []) as PermissionRow[]);
}
