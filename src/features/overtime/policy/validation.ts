import { companyDateAt } from "../../attendance/time.ts";
import type { OvertimePolicyActionState } from "./types.ts";

export function validateOvertimePolicyVersion(
  formData: FormData,
  companyDate = companyDateAt(),
): {
  data?: {
    effectiveDate: string;
    minimumQualifyingMinutes: number;
    changeReason: string | null;
  };
  state?: OvertimePolicyActionState;
} {
  const effectiveDate = String(formData.get("effective_date") ?? "").trim();
  const minutesText = String(
    formData.get("minimum_qualifying_minutes") ?? "",
  ).trim();
  const changeReason = String(formData.get("change_reason") ?? "").trim() || null;
  const minimumQualifyingMinutes = Number(minutesText);
  const fieldErrors: Record<string, string> = {};

  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
    fieldErrors.effective_date = "Effective date is required.";
  }
  if (
    !Number.isInteger(minimumQualifyingMinutes)
    || minimumQualifyingMinutes < 1
    || minimumQualifyingMinutes > 480
  ) {
    fieldErrors.minimum_qualifying_minutes =
      "Minimum qualifying time must be a whole number from 1 to 480.";
  }
  if (effectiveDate && effectiveDate < companyDate && !changeReason) {
    fieldErrors.change_reason = "A reason is required for a backdated policy.";
  }
  if (changeReason && changeReason.length > 1000) {
    fieldErrors.change_reason = "Reason must be 1,000 characters or fewer.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      state: {
        error: "Please correct the highlighted fields.",
        fieldErrors,
        values: {
          effectiveDate,
          minimumQualifyingMinutes: minutesText,
        },
      },
    };
  }

  return {
    data: {
      effectiveDate,
      minimumQualifyingMinutes,
      changeReason,
    },
  };
}
