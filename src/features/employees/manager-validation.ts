import type { SupabaseClient } from "@supabase/supabase-js";

export type ManagerHierarchyRecord = {
  id: string;
  manager_id: string | null;
};

export type ManagerSelectionRecord = {
  id: string;
  employment_status: string;
  archived_at: string | null;
};

export function wouldCreateManagerCycle(
  employeeId: string,
  proposedManagerId: string,
  records: ManagerHierarchyRecord[],
) {
  if (employeeId === proposedManagerId) return true;
  const byId = new Map(records.map((record) => [record.id, record.manager_id]));
  const visited = new Set<string>();
  let cursor: string | null = proposedManagerId;

  while (cursor) {
    if (cursor === employeeId) return true;
    if (visited.has(cursor)) return true;
    visited.add(cursor);
    cursor = byId.get(cursor) ?? null;
  }

  return false;
}

export function evaluateManagerSelection(input: {
  employeeId: string;
  proposedManagerId: string | null;
  currentManagerId: string | null;
  manager: ManagerSelectionRecord | null;
  hierarchy: ManagerHierarchyRecord[];
}) {
  if (!input.proposedManagerId) return null;
  if (input.employeeId === input.proposedManagerId) return "An employee cannot manage themselves.";
  if (!input.manager || input.manager.id !== input.proposedManagerId) return "Select a valid manager.";

  const retainsHistoricalManager = input.currentManagerId === input.proposedManagerId;
  if ((input.manager.archived_at || input.manager.employment_status !== "active") && !retainsHistoricalManager) {
    return "Select an active employee as manager.";
  }
  if (wouldCreateManagerCycle(input.employeeId, input.proposedManagerId, input.hierarchy)) {
    return "This manager assignment would create a circular reporting chain.";
  }
  return null;
}

export async function validateManagerAssignment(
  supabase: SupabaseClient,
  employeeId: string,
  proposedManagerId: string | null,
  currentManagerId: string | null = null,
) {
  if (!proposedManagerId) return null;
  const [{ data: manager, error: managerError }, { data: hierarchy, error: hierarchyError }] = await Promise.all([
    supabase
      .from("employees")
      .select("id,employment_status,archived_at")
      .eq("id", proposedManagerId)
      .maybeSingle(),
    supabase.from("employees").select("id,manager_id"),
  ]);

  if (managerError || hierarchyError) return "Unable to validate the selected manager.";
  return evaluateManagerSelection({
    employeeId,
    proposedManagerId,
    currentManagerId,
    manager,
    hierarchy: hierarchy ?? [],
  });
}
