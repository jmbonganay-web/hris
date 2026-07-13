"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAttendanceAdmin, requireAttendanceEmployee } from "@/features/attendance/auth";
import type { AttendanceActionState } from "@/features/attendance/types";
import { validateClockNote, validateCorrectionRequest, validateHrAttendance, validateReviewDecision } from "@/features/attendance/validation";

function clockError(message: string) {
  if (message.includes("ALREADY_CLOCKED_IN")) return "You already clocked in today.";
  if (message.includes("ALREADY_CLOCKED_OUT")) return "You already clocked out today.";
  if (message.includes("PREVIOUS_OPEN_ATTENDANCE")) {
    return "Resolve your previous missing clock-out before clocking in again.";
  }
  if (message.includes("NO_TODAY_ATTENDANCE")) {
    return "No active attendance record was found for today.";
  }
  if (message.includes("PRIVATE_TEXT_TOO_LONG")) {
    return "Note must be 1,000 characters or fewer.";
  }
  return "Attendance could not be saved. Please try again.";
}

function revalidateAttendance() {
  revalidatePath("/attendance");
  revalidatePath("/attendance/corrections");
  revalidatePath("/dashboard");
  revalidatePath("/admin/attendance");
}

export async function clockIn(
  _state: AttendanceActionState,
  formData: FormData,
): Promise<AttendanceActionState> {
  const { supabase } = await requireAttendanceEmployee();
  const validation = validateClockNote(formData);
  if (!validation.data) return validation.state ?? { error: "Invalid note." };

  const { error } = await supabase.rpc("clock_in_attendance", {
    p_note: validation.data.note,
  });
  if (error) return { error: clockError(error.message) };

  revalidateAttendance();
  redirect("/attendance?success=clocked_in");
}

export async function clockOut(
  _state: AttendanceActionState,
  formData: FormData,
): Promise<AttendanceActionState> {
  const { supabase } = await requireAttendanceEmployee();
  const validation = validateClockNote(formData);
  if (!validation.data) return validation.state ?? { error: "Invalid note." };

  const { error } = await supabase.rpc("clock_out_attendance", {
    p_note: validation.data.note,
  });
  if (error) return { error: clockError(error.message) };

  revalidateAttendance();
  redirect("/attendance?success=clocked_out");
}


function correctionError(message: string) {
  if (message.includes("REQUEST_DATE_OUT_OF_RANGE")) return "You can only request changes for the previous 30 calendar days.";
  if (message.includes("PENDING_REQUEST_EXISTS")) return "A pending request already exists for this attendance date.";
  if (message.includes("INVALID_CLOCK_ORDER")) return "The requested clock-out must be later than the clock-in.";
  if (message.includes("REQUEST_NOT_PENDING")) return "This correction request is no longer pending.";
  if (message.includes("ATTENDANCE_ALREADY_EXISTS")) return "Attendance already exists for this date.";
  if (message.includes("OPEN_ATTENDANCE_REQUIRED")) return "An open attendance record is required for this request.";
  if (message.includes("COMPLETED_ATTENDANCE_REQUIRED")) return "A completed attendance record is required for this request.";
  if (message.includes("CLOCK_IN_DATE_MISMATCH") || message.includes("CLOCK_OUT_DATE_MISMATCH")) {
    return "Requested times must fall on the selected attendance date in Asia/Manila.";
  }
  return "The correction request could not be saved. Please try again.";
}

export async function createCorrectionRequest(
  _state: AttendanceActionState,
  formData: FormData,
): Promise<AttendanceActionState> {
  const { supabase } = await requireAttendanceEmployee();
  const validation = validateCorrectionRequest(formData);
  if (!validation.data) return validation.state ?? { error: "Invalid correction request." };

  const { error } = await supabase.rpc("create_attendance_correction_request", {
    p_attendance_date: validation.data.attendanceDate,
    p_request_type: validation.data.requestType,
    p_requested_clock_in_local: validation.data.requestedClockInLocal,
    p_requested_clock_out_local: validation.data.requestedClockOutLocal,
    p_reason: validation.data.reason,
    p_employee_note: validation.data.employeeNote,
  });
  if (error) return { error: correctionError(error.message) };

  revalidateAttendance();
  redirect("/attendance/corrections?success=requested");
}

export async function cancelCorrectionRequest(requestId: string) {
  const { supabase } = await requireAttendanceEmployee();
  const { error } = await supabase.rpc("cancel_attendance_correction_request", {
    p_request_id: requestId,
  });
  if (error) redirect("/attendance/corrections?error=cancel_failed");
  revalidateAttendance();
  redirect("/attendance/corrections?success=cancelled");
}


function hrAttendanceError(message: string) {
  if (message.includes("ATTENDANCE_ALREADY_EXISTS")) {
    return "Attendance already exists for this employee and date.";
  }
  if (message.includes("INVALID_CLOCK_ORDER")) {
    return "Clock-out must be later than clock-in.";
  }
  if (
    message.includes("CLOCK_IN_DATE_MISMATCH")
    || message.includes("CLOCK_OUT_DATE_MISMATCH")
  ) {
    return "Both timestamps must belong to the selected Asia/Manila attendance date.";
  }
  if (message.includes("FUTURE_ATTENDANCE_NOT_ALLOWED")) {
    return "Future attendance dates are not allowed.";
  }
  if (message.includes("EMPLOYEE_NOT_FOUND")) {
    return "The selected employee could not be found.";
  }
  if (message.includes("ATTENDANCE_NOT_FOUND")) {
    return "The attendance record could not be found.";
  }
  if (message.includes("REQUIRED_PRIVATE_TEXT")) {
    return "A correction reason is required.";
  }
  if (message.includes("PRIVATE_TEXT_TOO_LONG")) {
    return "Correction reason must be 1,000 characters or fewer.";
  }
  return "Attendance could not be saved. Please try again.";
}

export async function createAttendanceByHr(
  employeeId: string,
  _state: AttendanceActionState,
  formData: FormData,
): Promise<AttendanceActionState> {
  const { supabase } = await requireAttendanceAdmin();
  const validation = validateHrAttendance(formData);
  if (!validation.data) {
    return validation.state ?? { error: "Invalid attendance record." };
  }

  const { error } = await supabase.rpc("hr_create_attendance", {
    p_employee_id: employeeId,
    p_attendance_date: validation.data.attendanceDate,
    p_clock_in_local: validation.data.clockInLocal,
    p_clock_out_local: validation.data.clockOutLocal,
    p_reason: validation.data.reason,
  });
  if (error) return { error: hrAttendanceError(error.message) };

  revalidateAttendance();
  revalidatePath(`/admin/attendance/${employeeId}`);
  redirect(`/admin/attendance/${employeeId}?success=created`);
}

export async function correctAttendanceByHr(
  employeeId: string,
  recordId: string,
  _state: AttendanceActionState,
  formData: FormData,
): Promise<AttendanceActionState> {
  const { supabase } = await requireAttendanceAdmin();
  const validation = validateHrAttendance(formData);
  if (!validation.data) {
    return validation.state ?? { error: "Invalid attendance record." };
  }

  const { error } = await supabase.rpc("hr_correct_attendance", {
    p_attendance_id: recordId,
    p_attendance_date: validation.data.attendanceDate,
    p_clock_in_local: validation.data.clockInLocal,
    p_clock_out_local: validation.data.clockOutLocal,
    p_reason: validation.data.reason,
  });
  if (error) return { error: hrAttendanceError(error.message) };

  revalidateAttendance();
  revalidatePath(`/admin/attendance/${employeeId}`);
  redirect(`/admin/attendance/${employeeId}?success=corrected`);
}


export async function reviewCorrectionRequest(
  requestId: string,
  _state: AttendanceActionState,
  formData: FormData,
): Promise<AttendanceActionState> {
  const { supabase } = await requireAttendanceAdmin();
  const validation = validateReviewDecision(formData);
  if (!validation.data) {
    return validation.state ?? { error: "Invalid review decision." };
  }

  const { error } = await supabase.rpc("review_attendance_correction_request", {
    p_request_id: requestId,
    p_decision: validation.data.decision,
    p_review_note: validation.data.reviewNote,
  });
  if (error) {
    if (error.message.includes("SELF_REVIEW_NOT_ALLOWED")) {
      return { error: "You cannot review your own correction request." };
    }
    if (error.message.includes("REQUEST_NOT_PENDING")) {
      return { error: "This correction request is no longer pending." };
    }
    if (error.message.includes("REQUEST_STATE_CHANGED")) {
      return {
        error: "Attendance changed after this request was submitted. Review the current record before deciding.",
      };
    }
    return { error: "The correction request could not be reviewed. Please try again." };
  }

  revalidateAttendance();
  revalidatePath("/admin/attendance/corrections");
  redirect(
    `/admin/attendance/corrections?success=${
      validation.data.decision === "approve" ? "approved" : "rejected"
    }`,
  );
}
