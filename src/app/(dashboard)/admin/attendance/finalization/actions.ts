"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAttendanceAdmin } from "@/features/attendance/auth";
import { companyDateAt } from "@/features/attendance/time";

type FinalizationActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: { targetDate?: string };
};

export async function runAttendanceFinalization(
  _state: FinalizationActionState,
  formData: FormData,
): Promise<FinalizationActionState> {
  const { supabase } = await requireAttendanceAdmin();
  const targetDate = String(formData.get("target_date") ?? "").trim();
  const reason = String(formData.get("manual_reason") ?? "").trim();
  const fieldErrors: Record<string, string> = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || targetDate >= companyDateAt()) {
    fieldErrors.target_date = "Select a past attendance date.";
  }
  if (!reason) fieldErrors.manual_reason = "A manual finalization reason is required.";
  else if (reason.length > 1000) fieldErrors.manual_reason = "Reason must be 1,000 characters or fewer.";
  if (Object.keys(fieldErrors).length) {
    return { error: "Please correct the highlighted fields.", fieldErrors, values: { targetDate } };
  }

  const { error } = await supabase.rpc("finalize_attendance_date", {
    p_target_date: targetDate,
    p_run_source: "manual",
    p_manual_reason: reason,
  });
  if (error) {
    if (error.message.includes("FINALIZATION_ALREADY_RUNNING")) return { error: "Finalization is already running for this date.", values: { targetDate } };
    return { error: "Attendance finalization could not be completed.", values: { targetDate } };
  }

  revalidatePath("/admin/attendance/finalization");
  revalidatePath("/admin/attendance");
  revalidatePath("/attendance");
  redirect("/admin/attendance/finalization?success=completed");
}
