import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  activityEntityFilters,
  activityFilters,
  type ActivityFilter,
  type EmployeeAuditEntry,
  type PaginatedActivity,
} from "./types";

export async function getEmployeeActivity(
  employeeId: string,
  requestedFilter: string,
  requestedPage: number,
): Promise<PaginatedActivity> {
  const filter = activityFilters.includes(requestedFilter as ActivityFilter)
    ? requestedFilter as ActivityFilter
    : "all";
  const page = Number.isInteger(requestedPage) && requestedPage > 0
    ? requestedPage
    : 1;
  const pageSize = 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = await createClient();
  let query = supabase
    .from("employee_audit_logs")
    .select(`
      id,
      employee_id,
      actor_profile_id,
      action,
      entity_type,
      entity_id,
      changed_fields,
      before_values,
      after_values,
      metadata,
      source,
      created_at,
      actor:profiles!employee_audit_logs_actor_profile_id_fkey(
        id,display_name,first_name,last_name
      )
    `, { count: "exact" })
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  if (filter === "system") {
    query = query.is("actor_profile_id", null);
  } else if (filter !== "all") {
    query = query.in("entity_type", activityEntityFilters[filter]);
  }

  const { data, count, error } = await query;
  if (error) {
    console.error("Unable to load employee activity:", error.code, error.message);
    throw new Error("Unable to load employee activity.");
  }

  const total = count ?? 0;
  return {
    entries: (data ?? []) as unknown as EmployeeAuditEntry[],
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
