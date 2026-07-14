"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAttendanceAdmin } from "@/features/attendance/auth";
import type { AttendancePolicyActionState } from "@/features/attendance/policy/types";
import { validateAttendancePolicyVersion } from "@/features/attendance/policy/validation";

function policyError(message: string) {
  if (message.includes("POLICY_EFFECTIVE_DATE_EXISTS")) {
    return "A policy version already exists for this effective date.";
  }
  if (message.includes("POLICY_REASON_REQUIRED")) {
    return "A reason is required for a backdated policy.";
  }
  if (message.includes("POLICY_GRACE_OUT_OF_RANGE")) {
    return "Late grace must be a whole number from 0 to 120.";
  }
  if (message.includes("PRIVATE_TEXT_TOO_LONG")) {
    return "Reason must be 1,000 characters or fewer.";
  }
  return "The attendance policy could not be saved. Please try again.";
}

export async function createAttendancePolicyVersion(
  _state: AttendancePolicyActionState,
  formData: FormData,
): Promise<AttendancePolicyActionState> {
  const { supabase } = await requireAttendanceAdmin();
  const validation = validateAttendancePolicyVersion(formData);
  if (!validation.data) {
    return validation.state ?? { error: "Invalid attendance policy." };
  }

  const { error } = await supabase.rpc("create_attendance_policy_version", {
    p_effective_date: validation.data.effectiveDate,
    p_late_grace_minutes: validation.data.lateGraceMinutes,
    p_change_reason: validation.data.changeReason,
  });
  if (error) {
    return {
      error: policyError(error.message),
      values: {
        effectiveDate: validation.data.effectiveDate,
        lateGraceMinutes: String(validation.data.lateGraceMinutes),
      },
    };
  }

  revalidatePath("/settings/attendance-policy");
  revalidatePath("/admin/attendance");
  revalidatePath("/attendance");
  revalidatePath("/dashboard");
  redirect("/settings/attendance-policy?success=created");
}
