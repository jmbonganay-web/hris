import { companyDateAt } from "../time.ts";
import type { AttendancePolicyActionState } from "./types.ts";

export function validateAttendancePolicyVersion(
  formData: FormData,
  companyDate = companyDateAt(),
): {
  data?: { effectiveDate: string; lateGraceMinutes: number; changeReason: string | null };
  state?: AttendancePolicyActionState;
} {
  const effectiveDate = String(formData.get("effective_date") ?? "").trim();
  const graceText = String(formData.get("late_grace_minutes") ?? "").trim();
  const changeReason = String(formData.get("change_reason") ?? "").trim() || null;
  const grace = Number(graceText);
  const fieldErrors: Record<string, string> = {};

  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
    fieldErrors.effective_date = "Effective date is required.";
  }
  if (!Number.isInteger(grace) || grace < 0 || grace > 120) {
    fieldErrors.late_grace_minutes = "Late grace must be a whole number from 0 to 120.";
  }
  if (effectiveDate && effectiveDate < companyDate && !changeReason) {
    fieldErrors.change_reason = "A reason is required for a backdated policy.";
  }
  if (changeReason && changeReason.length > 1000) {
    fieldErrors.change_reason = "Reason must be 1,000 characters or fewer.";
  }

  if (Object.keys(fieldErrors).length) {
    return {
      state: {
        error: "Please correct the highlighted fields.",
        fieldErrors,
        values: { effectiveDate, lateGraceMinutes: graceText },
      },
    };
  }

  return { data: { effectiveDate, lateGraceMinutes: grace, changeReason } };
}
