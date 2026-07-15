"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAttendanceAdmin } from "@/features/attendance/auth";
import type { OvertimeRecalculationActionState } from "@/features/overtime/types";
import { validateOvertimeRecalculation } from "@/features/overtime/validation";

function recalculationError(message: string) {
  if (message.includes("OVERTIME_RECALCULATION_REASON_REQUIRED")) {
    return "A recalculation reason is required.";
  }
  if (message.includes("OVERTIME_RECALCULATION_FUTURE_DATE")) {
    return "The selected date range contains future dates.";
  }
  if (message.includes("OVERTIME_RECALCULATION_DATE_RANGE_INVALID")) {
    return "End date must be on or after the start date.";
  }
  if (message.includes("OVERTIME_RECALCULATION_EMPLOYEE_INPUT_INVALID")) {
    return "One or more selected employees are no longer eligible.";
  }
  if (message.includes("PRIVATE_TEXT_TOO_LONG")) {
    return "Reason must be 1,000 characters or fewer.";
  }
  return "Overtime recalculation could not be completed.";
}

export async function recalculateOvertime(
  _state: OvertimeRecalculationActionState,
  formData: FormData,
): Promise<OvertimeRecalculationActionState> {
  const { supabase } = await requireAttendanceAdmin();
  const validation = validateOvertimeRecalculation(formData);
  if (!validation.data) {
    return validation.state ?? { error: "Invalid overtime recalculation request." };
  }

  const { error } = await supabase.rpc("recalculate_overtime_range", {
    p_employee_ids: validation.data.employeeIds,
    p_start_date: validation.data.startDate,
    p_end_date: validation.data.endDate,
    p_reason: validation.data.reason,
  });
  if (error) {
    return {
      error: recalculationError(error.message),
      values: {
        scope: validation.data.scope,
        employeeId: validation.data.employeeIds?.[0] ?? "",
        startDate: validation.data.startDate,
        endDate: validation.data.endDate,
      },
    };
  }

  revalidatePath("/admin/overtime");
  revalidatePath("/attendance");
  revalidatePath("/admin/attendance");
  revalidatePath("/overtime");
  redirect("/admin/overtime/recalculate?success=completed");
}
