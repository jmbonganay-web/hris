import {
  correctionRequestTypes,
  type AttendanceActionState,
  type CorrectionRequestType,
} from "./types.ts";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function optionalText(value: string) {
  return value || null;
}

function privateTextError(value: string, required: boolean, requiredMessage: string) {
  if (required && !value) return requiredMessage;
  if (value.length > 1000) return "Must be 1,000 characters or fewer.";
  return null;
}

export function validateClockNote(formData: FormData): {
  data?: { note: string | null };
  state?: AttendanceActionState;
} {
  const note = text(formData, "note");
  if (note.length > 1000) {
    return { state: { fieldErrors: { note: "Note must be 1,000 characters or fewer." } } };
  }
  return { data: { note: optionalText(note) } };
}

export function validateHrAttendance(formData: FormData): {
  data?: {
    attendanceDate: string;
    clockInLocal: string;
    clockOutLocal: string | null;
    reason: string;
  };
  state?: AttendanceActionState;
} {
  const attendanceDate = text(formData, "attendance_date");
  const clockInLocal = text(formData, "clock_in_local");
  const clockOutLocal = text(formData, "clock_out_local");
  const reason = text(formData, "reason");
  const fieldErrors: Record<string, string> = {};

  if (!/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate)) {
    fieldErrors.attendance_date = "Attendance date is required.";
  }
  if (!clockInLocal) fieldErrors.clock_in_local = "Clock-in time is required.";
  const reasonError = privateTextError(reason, true, "A correction reason is required.");
  if (reasonError) {
    fieldErrors.reason = reasonError === "Must be 1,000 characters or fewer."
      ? "Correction reason must be 1,000 characters or fewer."
      : reasonError;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      state: {
        error: "Please correct the highlighted fields.",
        fieldErrors,
        values: { attendance_date: attendanceDate, clock_in_local: clockInLocal, clock_out_local: clockOutLocal },
      },
    };
  }

  return {
    data: {
      attendanceDate,
      clockInLocal,
      clockOutLocal: optionalText(clockOutLocal),
      reason,
    },
  };
}

export function validateCorrectionRequest(formData: FormData): {
  data?: {
    attendanceDate: string;
    requestType: CorrectionRequestType;
    requestedClockInLocal: string | null;
    requestedClockOutLocal: string | null;
    reason: string;
    employeeNote: string | null;
  };
  state?: AttendanceActionState;
} {
  const attendanceDate = text(formData, "attendance_date");
  const requestType = text(formData, "request_type");
  const requestedClockInLocal = text(formData, "requested_clock_in_local");
  const requestedClockOutLocal = text(formData, "requested_clock_out_local");
  const reason = text(formData, "reason");
  const employeeNote = text(formData, "employee_note");
  const fieldErrors: Record<string, string> = {};

  if (!/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate)) {
    fieldErrors.attendance_date = "Attendance date is required.";
  }
  if (!correctionRequestTypes.includes(requestType as CorrectionRequestType)) {
    fieldErrors.request_type = "Choose a valid correction type.";
  }
  if (["add_missing_clock_in", "change_clock_in"].includes(requestType) && !requestedClockInLocal) {
    fieldErrors.requested_clock_in_local = "Requested clock-in time is required.";
  }
  if (["add_missing_clock_out", "change_clock_out"].includes(requestType) && !requestedClockOutLocal) {
    fieldErrors.requested_clock_out_local = "Requested clock-out time is required.";
  }
  const reasonError = privateTextError(reason, true, "A reason is required.");
  if (reasonError) fieldErrors.reason = reasonError;
  const noteError = privateTextError(employeeNote, false, "");
  if (noteError) fieldErrors.employee_note = noteError;

  if (Object.keys(fieldErrors).length > 0) {
    return {
      state: {
        error: "Please correct the highlighted fields.",
        fieldErrors,
        values: {
          attendance_date: attendanceDate,
          request_type: requestType,
          requested_clock_in_local: requestedClockInLocal,
          requested_clock_out_local: requestedClockOutLocal,
        },
      },
    };
  }

  return {
    data: {
      attendanceDate,
      requestType: requestType as CorrectionRequestType,
      requestedClockInLocal: optionalText(requestedClockInLocal),
      requestedClockOutLocal: optionalText(requestedClockOutLocal),
      reason,
      employeeNote: optionalText(employeeNote),
    },
  };
}

export function validateReviewDecision(formData: FormData): {
  data?: { decision: "approve" | "reject"; reviewNote: string | null };
  state?: AttendanceActionState;
} {
  const decision = text(formData, "decision");
  const reviewNote = text(formData, "review_note");
  const fieldErrors: Record<string, string> = {};

  if (decision !== "approve" && decision !== "reject") {
    fieldErrors.decision = "Choose approve or reject.";
  }
  if (reviewNote.length > 1000) {
    fieldErrors.review_note = "Review note must be 1,000 characters or fewer.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { state: { error: "Unable to review this request.", fieldErrors } };
  }
  return {
    data: {
      decision: decision as "approve" | "reject",
      reviewNote: optionalText(reviewNote),
    },
  };
}
