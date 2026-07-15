import { companyDateAt } from "../../attendance/time.ts";
import {
  holidayTypes,
  type HolidayActionState,
  type HolidayType,
} from "./types.ts";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function common(formData: FormData) {
  const holidayDate = String(formData.get("holiday_date") ?? "").trim();
  const holidayName = String(formData.get("holiday_name") ?? "").trim();
  const holidayType = String(formData.get("holiday_type") ?? "").trim();
  const changeReason = String(formData.get("change_reason") ?? "").trim();
  const fieldErrors: Record<string, string> = {};

  if (!/^\d{4}-\d{2}-\d{2}$/.test(holidayDate)) {
    fieldErrors.holiday_date = "Holiday date is required.";
  }
  if (!holidayName || holidayName.length > 160) {
    fieldErrors.holiday_name = "Holiday name must be 1 to 160 characters.";
  }
  if (!holidayTypes.includes(holidayType as HolidayType)) {
    fieldErrors.holiday_type = "Choose a valid holiday type.";
  }
  if (changeReason.length > 1000) {
    fieldErrors.change_reason = "Reason must be 1,000 characters or fewer.";
  }

  return {
    holidayDate,
    holidayName,
    holidayType,
    changeReason,
    fieldErrors,
  };
}

export function validateHolidayCreate(
  formData: FormData,
  companyDate = companyDateAt(),
): {
  data?: {
    holidayDate: string;
    holidayName: string;
    holidayType: HolidayType;
    changeReason: string | null;
  };
  state?: HolidayActionState;
} {
  const input = common(formData);
  if (
    input.holidayDate
    && input.holidayDate <= companyDate
    && !input.changeReason
  ) {
    input.fieldErrors.change_reason =
      "A reason is required for a current or past holiday.";
  }

  if (Object.keys(input.fieldErrors).length > 0) {
    return {
      state: {
        error: "Please correct the highlighted fields.",
        fieldErrors: input.fieldErrors,
        values: {
          holidayDate: input.holidayDate,
          holidayName: input.holidayName,
          holidayType: holidayTypes.includes(input.holidayType as HolidayType)
            ? input.holidayType as HolidayType
            : undefined,
        },
      },
    };
  }

  return {
    data: {
      holidayDate: input.holidayDate,
      holidayName: input.holidayName,
      holidayType: input.holidayType as HolidayType,
      changeReason: input.changeReason || null,
    },
  };
}

export function validateHolidayReplacement(
  formData: FormData,
  companyDate = companyDateAt(),
): {
  data?: {
    expectedActiveVersionId: string;
    holidayDate: string;
    holidayName: string;
    holidayType: HolidayType;
    isActive: boolean;
    changeReason: string | null;
  };
  state?: HolidayActionState;
} {
  const input = common(formData);
  const expectedActiveVersionId = String(
    formData.get("expected_active_version_id") ?? "",
  ).trim();
  const isActiveText = String(formData.get("is_active") ?? "").trim();

  if (!uuid.test(expectedActiveVersionId)) {
    input.fieldErrors.expected_active_version_id =
      "The holiday version changed. Reload and try again.";
  }
  if (isActiveText !== "true" && isActiveText !== "false") {
    input.fieldErrors.is_active = "Choose active or deactivated.";
  }
  if (
    input.holidayDate
    && input.holidayDate <= companyDate
    && !input.changeReason
  ) {
    input.fieldErrors.change_reason =
      "A reason is required for a current or past holiday change.";
  }

  if (Object.keys(input.fieldErrors).length > 0) {
    return {
      state: {
        error: "Please correct the highlighted fields.",
        fieldErrors: input.fieldErrors,
        values: {
          holidayDate: input.holidayDate,
          holidayName: input.holidayName,
          holidayType: holidayTypes.includes(input.holidayType as HolidayType)
            ? input.holidayType as HolidayType
            : undefined,
          isActive: isActiveText === "false" ? "false" : "true",
        },
      },
    };
  }

  return {
    data: {
      expectedActiveVersionId,
      holidayDate: input.holidayDate,
      holidayName: input.holidayName,
      holidayType: input.holidayType as HolidayType,
      isActive: isActiveText === "true",
      changeReason: input.changeReason || null,
    },
  };
}
