import "server-only";

import { requireHrAdmin } from "@/features/employees/auth";
import type { AppRole } from "@/features/employees/types";
import { createClient } from "@/lib/supabase/server";

export async function requireReportAdmin() {
  return requireHrAdmin();
}

export class ReportAccessError extends Error {
  constructor(message = "REPORT_UNAUTHORIZED") {
    super(message);
    this.name = "ReportAccessError";
  }
}

export async function requireReportApiAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new ReportAccessError();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw new ReportAccessError();

  const role = profile?.role as AppRole | undefined;
  if (role !== "hr_admin" && role !== "super_admin") {
    throw new ReportAccessError();
  }

  return { supabase, user, role };
}
