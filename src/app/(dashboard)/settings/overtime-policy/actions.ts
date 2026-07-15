"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAttendanceAdmin } from "@/features/attendance/auth";
import type { OvertimePolicyActionState } from "@/features/overtime/policy/types";
import { validateOvertimePolicyVersion } from "@/features/overtime/policy/validation";

function policyError(message: string) {
  if (message.includes("OVERTIME_POLICY_EFFECTIVE_DATE_EXISTS")) {
    return "An overtime policy already exists for this effective date.";
  }
  if (message.includes("OVERTIME_POLICY_REASON_REQUIRED")) {
    return "A reason is required for a backdated policy.";
  }
  if (message.includes("OVERTIME_POLICY_MINIMUM_OUT_OF_RANGE")) {
    return "Minimum qualifying time must be a whole number from 1 to 480.";
  }
  if (message.includes("PRIVATE_TEXT_TOO_LONG")) {
    return "Reason must be 1,000 characters or fewer.";
  }
  return "The overtime policy could not be saved.";
}

export async function createOvertimePolicyVersion(
  _state: OvertimePolicyActionState,
  formData: FormData,
): Promise<OvertimePolicyActionState> {
  const { supabase } = await requireAttendanceAdmin();
  const validation = validateOvertimePolicyVersion(formData);
  if (!validation.data) {
    return validation.state ?? { error: "Invalid overtime policy." };
  }

  const { error } = await supabase.rpc("create_overtime_policy_version", {
    p_effective_date: validation.data.effectiveDate,
    p_minimum_qualifying_minutes:
      validation.data.minimumQualifyingMinutes,
    p_change_reason: validation.data.changeReason,
  });

  if (error) {
    return {
      error: policyError(error.message),
      values: {
        effectiveDate: validation.data.effectiveDate,
        minimumQualifyingMinutes: String(
          validation.data.minimumQualifyingMinutes,
        ),
      },
    };
  }

  revalidatePath("/settings/overtime-policy");
  revalidatePath("/admin/overtime");
  revalidatePath("/overtime");
  revalidatePath("/attendance");
  revalidatePath("/admin/attendance");
  redirect("/settings/overtime-policy?success=created");
}
