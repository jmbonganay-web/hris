import {
  scheduleWeekdays,
  type ScheduleActionState,
  type ScheduleAssignmentInput,
  type ScheduleTemplateInput,
  type ScheduleVersionInput,
  type ScheduleWeekday,
} from "./types.ts";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function safeValues(values: Record<string, string>) {
  return values;
}

function invalid(
  fieldErrors: Record<string, string>,
  values: Record<string, string> = {},
) {
  return {
    state: {
      error: "Please correct the highlighted fields.",
      fieldErrors,
      values: safeValues(values),
    } satisfies ScheduleActionState,
  };
}

export function normalizeScheduleCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function minutes(value: string) {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function scheduledMinutes(
  startTime: string,
  endTime: string,
  breakMinutes: number,
) {
  const start = minutes(startTime);
  const end = minutes(endTime);
  if (start === null || end === null || end <= start || breakMinutes < 0) return 0;
  return end - start - breakMinutes;
}

export function validateScheduleTemplate(formData: FormData): {
  data?: ScheduleTemplateInput;
  state?: ScheduleActionState;
} {
  const code = normalizeScheduleCode(text(formData, "code"));
  const name = text(formData, "name");
  const description = text(formData, "description") || null;
  const fieldErrors: Record<string, string> = {};

  if (!code) fieldErrors.code = "Schedule code is required.";
  else if (code.length > 30) fieldErrors.code = "Schedule code must be 30 characters or fewer.";
  if (!name) fieldErrors.name = "Schedule name is required.";
  else if (name.length > 100) fieldErrors.name = "Schedule name must be 100 characters or fewer.";
  if (description && description.length > 1000) {
    fieldErrors.description = "Description must be 1,000 characters or fewer.";
  }

  if (Object.keys(fieldErrors).length) {
    return invalid(fieldErrors, { code, name });
  }
  return { data: { code, name, description } };
}

export function validateScheduleVersion(
  formData: FormData,
  companyDate: string,
): { data?: ScheduleVersionInput; state?: ScheduleActionState } {
  const effectiveDate = text(formData, "effective_date");
  const rawWorkingDays = formData.getAll("working_days").map(String);
  const workingDays = rawWorkingDays.filter((day): day is ScheduleWeekday =>
    scheduleWeekdays.includes(day as ScheduleWeekday),
  );
  const uniqueDays = [...new Set(workingDays)];
  const startTime = text(formData, "start_time");
  const endTime = text(formData, "end_time");
  const breakText = text(formData, "break_minutes");
  const breakMinutes = Number(breakText);
  const changeReason = text(formData, "change_reason") || null;
  const fieldErrors: Record<string, string> = {};
  const start = minutes(startTime);
  const end = minutes(endTime);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
    fieldErrors.effective_date = "Effective date is required.";
  }
  if (uniqueDays.length === 0 || workingDays.length !== rawWorkingDays.length) {
    fieldErrors.working_days = "Select at least one working day.";
  } else if (uniqueDays.length !== workingDays.length) {
    fieldErrors.working_days = "Each working day may be selected only once.";
  }
  if (!startTime || start === null) fieldErrors.start_time = "Start time is required.";
  if (!endTime || end === null) fieldErrors.end_time = "End time is required.";
  else if (start !== null && end <= start) {
    fieldErrors.end_time = "End time must be later than start time.";
  }
  if (!Number.isInteger(breakMinutes) || breakMinutes < 0) {
    fieldErrors.break_minutes = "Break duration must be zero or greater.";
  } else if (start !== null && end !== null && end > start && breakMinutes >= end - start) {
    fieldErrors.break_minutes = "Break duration must be shorter than the shift.";
  }
  if (effectiveDate && effectiveDate < companyDate && !changeReason) {
    fieldErrors.change_reason = "A reason is required for a backdated version.";
  }
  if (changeReason && changeReason.length > 1000) {
    fieldErrors.change_reason = "Reason must be 1,000 characters or fewer.";
  }

  if (Object.keys(fieldErrors).length) {
    return invalid(fieldErrors, {
      effective_date: effectiveDate,
      start_time: startTime,
      end_time: endTime,
      break_minutes: breakText,
    });
  }

  return {
    data: {
      effective_date: effectiveDate,
      working_days: uniqueDays,
      start_time: startTime,
      end_time: endTime,
      break_minutes: breakMinutes,
      change_reason: changeReason,
    },
  };
}

export function validateScheduleAssignment(
  formData: FormData,
  companyDate: string,
): { data?: ScheduleAssignmentInput; state?: ScheduleActionState } {
  const scheduleTemplateId = text(formData, "schedule_template_id");
  const rawEmployeeIds = formData.getAll("employee_ids").map(String).filter(Boolean);
  const employeeIds = [...new Set(rawEmployeeIds)];
  const startDate = text(formData, "effective_start_date");
  const endDate = text(formData, "effective_end_date") || null;
  const assignmentReason = text(formData, "assignment_reason") || null;
  const fieldErrors: Record<string, string> = {};

  if (!uuidPattern.test(scheduleTemplateId)) {
    fieldErrors.schedule_template_id = "Select a valid schedule.";
  }
  if (employeeIds.length === 0 || employeeIds.some((id) => !uuidPattern.test(id))) {
    fieldErrors.employee_ids = "Select at least one valid employee.";
  } else if (employeeIds.length !== rawEmployeeIds.length) {
    fieldErrors.employee_ids = "Each employee may be selected only once.";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    fieldErrors.effective_start_date = "Effective start date is required.";
  }
  if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    fieldErrors.effective_end_date = "Select a valid end date.";
  } else if (endDate && startDate && endDate < startDate) {
    fieldErrors.effective_end_date = "End date must be on or after the start date.";
  }
  if (startDate && startDate < companyDate && !assignmentReason) {
    fieldErrors.assignment_reason = "A reason is required for a backdated assignment.";
  }
  if (assignmentReason && assignmentReason.length > 1000) {
    fieldErrors.assignment_reason = "Reason must be 1,000 characters or fewer.";
  }

  if (Object.keys(fieldErrors).length) {
    return invalid(fieldErrors, {
      schedule_template_id: scheduleTemplateId,
      effective_start_date: startDate,
      effective_end_date: endDate ?? "",
    });
  }

  return {
    data: {
      employee_ids: employeeIds,
      schedule_template_id: scheduleTemplateId,
      effective_start_date: startDate,
      effective_end_date: endDate,
      assignment_reason: assignmentReason,
    },
  };
}
