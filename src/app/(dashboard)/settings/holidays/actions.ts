"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAttendanceAdmin } from "@/features/attendance/auth";
import type { HolidayActionState } from "@/features/overtime/holidays/types";
import {
  validateHolidayCreate,
  validateHolidayReplacement,
} from "@/features/overtime/holidays/validation";

function holidayError(message: string) {
  if (message.includes("HOLIDAY_DATE_EXISTS")) {
    return "An active holiday already exists for this date.";
  }
  if (message.includes("HOLIDAY_VERSION_STALE")) {
    return "This holiday changed while you were reviewing it.";
  }
  if (message.includes("HOLIDAY_REASON_REQUIRED")) {
    return "A reason is required for this holiday change.";
  }
  if (message.includes("HOLIDAY_NOT_FOUND")) {
    return "The holiday could not be found.";
  }
  if (message.includes("PRIVATE_TEXT_TOO_LONG")) {
    return "Reason must be 1,000 characters or fewer.";
  }
  return "The holiday could not be saved.";
}

function revalidateHolidayPaths(groupId?: string) {
  revalidatePath("/settings/holidays");
  if (groupId) revalidatePath(`/settings/holidays/${groupId}`);
  revalidatePath("/admin/overtime");
  revalidatePath("/overtime");
  revalidatePath("/attendance");
  revalidatePath("/admin/attendance");
}

export async function createHoliday(
  _state: HolidayActionState,
  formData: FormData,
): Promise<HolidayActionState> {
  const { supabase } = await requireAttendanceAdmin();
  const validation = validateHolidayCreate(formData);
  if (!validation.data) {
    return validation.state ?? { error: "Invalid holiday." };
  }

  const { data, error } = await supabase.rpc("create_holiday", {
    p_holiday_date: validation.data.holidayDate,
    p_holiday_name: validation.data.holidayName,
    p_holiday_type: validation.data.holidayType,
    p_holiday_count: validation.data.holidayCount,
    p_change_reason: validation.data.changeReason,
  });

  if (error) {
    return {
      error: holidayError(error.message),
      values: {
        holidayDate: validation.data.holidayDate,
        holidayName: validation.data.holidayName,
        holidayType: validation.data.holidayType,
        holidayCount: String(validation.data.holidayCount) as "1" | "2",
      },
    };
  }

  revalidateHolidayPaths(String(data));
  redirect(`/settings/holidays/${data}?success=created`);
}

export async function replaceHoliday(
  holidayGroupId: string,
  _state: HolidayActionState,
  formData: FormData,
): Promise<HolidayActionState> {
  const { supabase } = await requireAttendanceAdmin();
  const validation = validateHolidayReplacement(formData);
  if (!validation.data) {
    return validation.state ?? { error: "Invalid holiday replacement." };
  }

  const { error } = await supabase.rpc("replace_holiday_version", {
    p_holiday_group_id: holidayGroupId,
    p_expected_active_version_id: validation.data.expectedActiveVersionId,
    p_holiday_date: validation.data.holidayDate,
    p_holiday_name: validation.data.holidayName,
    p_holiday_type: validation.data.holidayType,
    p_holiday_count: validation.data.holidayCount,
    p_is_active: validation.data.isActive,
    p_change_reason: validation.data.changeReason,
  });

  if (error) {
    return {
      error: holidayError(error.message),
      values: {
        holidayDate: validation.data.holidayDate,
        holidayName: validation.data.holidayName,
        holidayType: validation.data.holidayType,
        holidayCount: String(validation.data.holidayCount) as "1" | "2",
        isActive: validation.data.isActive ? "true" : "false",
      },
    };
  }

  revalidateHolidayPaths(holidayGroupId);
  redirect(`/settings/holidays/${holidayGroupId}?success=replaced`);
}
