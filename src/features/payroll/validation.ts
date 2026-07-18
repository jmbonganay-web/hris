import {
  compensationTypeValues,
  payrollPeriodStatusValues,
  payrollScheduleTypeValues,
  payrollBasisRoundingModeValues,
  type CompensationType,
  type PayrollPeriodStatus,
  type PayrollScheduleType,
} from "./constants.ts";
import type {
  CompensationInput,
  PayrollActionState,
  PayrollPeriodFilters,
  PayrollScheduleInput,
  ScheduleAssignmentInput,
  PayrollBasisRuleInput,
  PayrollCalculationRunInput,
  PayrollReasonActionInput,
} from "./types.ts";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const codePattern = /^[A-Z0-9-]{2,16}$/;

type UnknownRecord = Record<string, unknown>;
export type ValidationResult<T> = { data?: T; state?: PayrollActionState };

function text(value: unknown) {
  return String(value ?? "").trim();
}
function optionalText(value: unknown) {
  const result = text(value);
  return result || null;
}
function numberValue(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : Number.NaN;
}
function booleanValue(value: unknown) {
  return value === true || ["true", "on", "1"].includes(text(value).toLowerCase());
}
function invalid(fieldErrors: Record<string, string>): ValidationResult<never> {
  return {
    state: {
      error: "Please correct the highlighted fields.",
      fieldErrors,
    },
  };
}
function currentIsoDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function formDataToRecord(formData: FormData): UnknownRecord {
  return Object.fromEntries(formData.entries());
}

export function validatePayrollScheduleInput(input: UnknownRecord): ValidationResult<PayrollScheduleInput> {
  const name = text(input.name);
  const code = text(input.code).toUpperCase().replace(/\s+/g, "-");
  const scheduleType = text(input.scheduleType ?? input.schedule_type) as PayrollScheduleType;
  const anchorDate = optionalText(input.anchorDate ?? input.anchor_date);
  const firstPeriodEndDay = numberValue(input.firstPeriodEndDay ?? input.first_period_end_day);
  const cutoffOffsetDays = numberValue(input.cutoffOffsetDays ?? input.cutoff_offset_days);
  const paymentOffsetDays = numberValue(input.paymentOffsetDays ?? input.payment_offset_days);
  const fieldErrors: Record<string, string> = {};

  if (name.length < 2 || name.length > 120) fieldErrors.name = "Name must be between 2 and 120 characters.";
  if (!codePattern.test(code)) fieldErrors.code = "Code must use 2–16 uppercase letters, numbers, or hyphens.";
  if (!payrollScheduleTypeValues.includes(scheduleType)) fieldErrors.schedule_type = "Choose a valid payroll frequency.";
  if (cutoffOffsetDays === null || !Number.isInteger(cutoffOffsetDays) || cutoffOffsetDays < -31 || cutoffOffsetDays > 31) {
    fieldErrors.cutoff_offset_days = "Cutoff offset must be a whole number from -31 to 31.";
  }
  if (paymentOffsetDays === null || !Number.isInteger(paymentOffsetDays) || paymentOffsetDays < -31 || paymentOffsetDays > 62) {
    fieldErrors.payment_offset_days = "Payment offset must be a whole number from -31 to 62.";
  }
  if (scheduleType === "weekly" || scheduleType === "biweekly") {
    if (!anchorDate || !datePattern.test(anchorDate)) fieldErrors.anchor_date = "Anchor date is required.";
    if (firstPeriodEndDay !== null) fieldErrors.first_period_end_day = "Weekly schedules do not use a semi-monthly cutoff day.";
  } else if (scheduleType === "semi_monthly") {
    if (anchorDate) fieldErrors.anchor_date = "Semi-monthly schedules do not use an anchor date.";
    if (!Number.isInteger(firstPeriodEndDay) || firstPeriodEndDay === null || firstPeriodEndDay < 1 || firstPeriodEndDay > 27) {
      fieldErrors.first_period_end_day = "Choose a first period end day from 1 to 27.";
    }
  } else if (scheduleType === "monthly") {
    if (anchorDate) fieldErrors.anchor_date = "Monthly schedules do not use an anchor date.";
    if (firstPeriodEndDay !== null) fieldErrors.first_period_end_day = "Monthly schedules do not use a semi-monthly cutoff day.";
  }

  if (Object.keys(fieldErrors).length) return invalid(fieldErrors);
  return {
    data: {
      name,
      code,
      scheduleType,
      anchorDate,
      firstPeriodEndDay,
      cutoffOffsetDays: cutoffOffsetDays as number,
      paymentOffsetDays: paymentOffsetDays as number,
    },
  };
}

export function validateCompensationInput(
  input: UnknownRecord,
  companyDate = currentIsoDate(),
): ValidationResult<CompensationInput> {
  const compensationType = text(input.compensationType ?? input.compensation_type) as CompensationType;
  const monthlySalary = numberValue(input.monthlySalary ?? input.monthly_salary);
  const hourlyRate = numberValue(input.hourlyRate ?? input.hourly_rate);
  const standardHoursPerDay = numberValue(input.standardHoursPerDay ?? input.standard_hours_per_day);
  const standardHoursPerWeek = numberValue(input.standardHoursPerWeek ?? input.standard_hours_per_week);
  const effectiveFrom = text(input.effectiveFrom ?? input.effective_from);
  const changeReason = text(input.changeReason ?? input.change_reason);
  const expectedVersionRaw = numberValue(input.expectedVersion ?? input.expected_version);
  const fieldErrors: Record<string, string> = {};

  if (!compensationTypeValues.includes(compensationType)) fieldErrors.compensation_type = "Choose monthly salary or hourly rate.";
  if (compensationType === "monthly") {
    if (monthlySalary === null || !Number.isFinite(monthlySalary) || monthlySalary <= 0) fieldErrors.monthly_salary = "Enter a monthly salary greater than zero.";
    if (hourlyRate !== null) fieldErrors.hourly_rate = "Hourly rate must be empty for monthly compensation.";
  } else if (compensationType === "hourly") {
    if (hourlyRate === null || !Number.isFinite(hourlyRate) || hourlyRate <= 0) fieldErrors.hourly_rate = "Enter an hourly rate greater than zero.";
    if (monthlySalary !== null) fieldErrors.monthly_salary = "Monthly salary must be empty for hourly compensation.";
  }
  if (standardHoursPerDay === null || !Number.isFinite(standardHoursPerDay) || standardHoursPerDay <= 0 || standardHoursPerDay > 24) {
    fieldErrors.standard_hours_per_day = "Daily hours must be greater than zero and no more than 24.";
  }
  if (standardHoursPerWeek === null || !Number.isFinite(standardHoursPerWeek) || standardHoursPerWeek > 168 || (standardHoursPerDay !== null && standardHoursPerWeek < standardHoursPerDay)) {
    fieldErrors.standard_hours_per_week = "Weekly hours must be at least the daily hours and no more than 168.";
  }
  if (!datePattern.test(effectiveFrom)) fieldErrors.effective_from = "Effective date is required.";
  if (effectiveFrom && effectiveFrom < companyDate && !changeReason) fieldErrors.change_reason = "A reason is required for a backdated change.";
  if (changeReason.length > 1000) fieldErrors.change_reason = "Reason must be 1,000 characters or fewer.";
  if (expectedVersionRaw !== null && (!Number.isInteger(expectedVersionRaw) || expectedVersionRaw < 1)) fieldErrors.expected_version = "Reload the current record before saving.";

  if (Object.keys(fieldErrors).length) return invalid(fieldErrors);
  return {
    data: {
      compensationType,
      monthlySalary,
      hourlyRate,
      standardHoursPerDay: standardHoursPerDay as number,
      standardHoursPerWeek: standardHoursPerWeek as number,
      effectiveFrom,
      changeReason,
      ...(expectedVersionRaw === null ? {} : { expectedVersion: expectedVersionRaw }),
    },
  };
}

export function validateScheduleAssignmentInput(
  input: UnknownRecord,
  companyDate = currentIsoDate(),
): ValidationResult<ScheduleAssignmentInput> {
  const payrollScheduleId = text(input.payrollScheduleId ?? input.payroll_schedule_id);
  const effectiveFrom = text(input.effectiveFrom ?? input.effective_from);
  const changeReason = text(input.changeReason ?? input.change_reason);
  const overrideMidPeriod = booleanValue(input.overrideMidPeriod ?? input.override_mid_period);
  const overrideReason = optionalText(input.overrideReason ?? input.override_reason);
  const expectedVersionRaw = numberValue(input.expectedVersion ?? input.expected_version);
  const fieldErrors: Record<string, string> = {};

  if (!uuidPattern.test(payrollScheduleId)) fieldErrors.payroll_schedule_id = "Choose a valid payroll schedule.";
  if (!datePattern.test(effectiveFrom)) fieldErrors.effective_from = "Effective date is required.";
  if (effectiveFrom && effectiveFrom < companyDate && !changeReason) fieldErrors.change_reason = "A reason is required for a backdated assignment.";
  if (changeReason.length > 1000) fieldErrors.change_reason = "Reason must be 1,000 characters or fewer.";
  if (overrideMidPeriod && !overrideReason) fieldErrors.override_reason = "A reason is required for a mid-period override.";
  if (overrideReason && overrideReason.length > 1000) fieldErrors.override_reason = "Override reason must be 1,000 characters or fewer.";
  if (expectedVersionRaw !== null && (!Number.isInteger(expectedVersionRaw) || expectedVersionRaw < 1)) fieldErrors.expected_version = "Reload the current assignment before saving.";

  if (Object.keys(fieldErrors).length) return invalid(fieldErrors);
  return {
    data: {
      payrollScheduleId,
      effectiveFrom,
      changeReason,
      overrideMidPeriod,
      overrideReason,
      ...(expectedVersionRaw === null ? {} : { expectedVersion: expectedVersionRaw }),
    },
  };
}

export function validateRecordVersion(
  id: unknown,
  version: unknown,
): ValidationResult<{ id: string; expectedVersion: number }> {
  const recordId = text(id);
  const expectedVersion = Number(version);
  const fieldErrors: Record<string, string> = {};
  if (!uuidPattern.test(recordId)) fieldErrors.id = "The selected payroll record is invalid.";
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) fieldErrors.expected_version = "Reload the current payroll record.";
  if (Object.keys(fieldErrors).length) return invalid(fieldErrors);
  return { data: { id: recordId, expectedVersion } };
}

export function validatePayrollPeriodFilters(input: UnknownRecord): PayrollPeriodFilters {
  const scheduleId = text(input.scheduleId ?? input.schedule_id);
  const status = text(input.status) as PayrollPeriodStatus;
  const year = Number(text(input.year));
  const from = text(input.from);
  const to = text(input.to);
  const page = Number(text(input.page));
  return {
    ...(uuidPattern.test(scheduleId) ? { scheduleId } : {}),
    ...(payrollPeriodStatusValues.includes(status) ? { status } : {}),
    ...(Number.isInteger(year) && year >= 2000 && year <= 2200 ? { year } : {}),
    ...(datePattern.test(from) ? { from } : {}),
    ...(datePattern.test(to) ? { to } : {}),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

export function validatePayrollBasisRuleInput(
  input: UnknownRecord,
): ValidationResult<PayrollBasisRuleInput> {
  const name = text(input.name);
  const annualDivisor = numberValue(input.annualDivisor ?? input.annual_divisor);
  const standardHoursPerDay = numberValue(
    input.standardHoursPerDay ?? input.standard_hours_per_day,
  );
  const roundingMode = text(
    input.roundingMode ?? input.rounding_mode,
  ) as PayrollBasisRuleInput["roundingMode"];
  const effectiveFrom = text(input.effectiveFrom ?? input.effective_from);
  const changeReason = text(input.changeReason ?? input.change_reason);
  const fieldErrors: Record<string, string> = {};

  if (name.length < 2 || name.length > 120) {
    fieldErrors.name = "Name must be between 2 and 120 characters.";
  }
  if (
    annualDivisor === null ||
    !Number.isFinite(annualDivisor) ||
    annualDivisor <= 0 ||
    annualDivisor > 1000
  ) {
    fieldErrors.annual_divisor = "Annual divisor must be greater than zero and no more than 1,000.";
  }
  if (
    standardHoursPerDay === null ||
    !Number.isFinite(standardHoursPerDay) ||
    standardHoursPerDay <= 0 ||
    standardHoursPerDay > 24
  ) {
    fieldErrors.standard_hours_per_day = "Daily hours must be greater than zero and no more than 24.";
  }
  if (!payrollBasisRoundingModeValues.includes(roundingMode)) {
    fieldErrors.rounding_mode = "Choose a valid rounding method.";
  }
  if (!datePattern.test(effectiveFrom)) {
    fieldErrors.effective_from = "Effective date is required.";
  }
  if (!changeReason || changeReason.length > 1000) {
    fieldErrors.change_reason = "Reason is required and must be 1,000 characters or fewer.";
  }

  if (Object.keys(fieldErrors).length) return invalid(fieldErrors);
  return {
    data: {
      name,
      annualDivisor: annualDivisor as number,
      standardHoursPerDay: standardHoursPerDay as number,
      roundingMode,
      effectiveFrom,
      changeReason,
    },
  };
}

export function validatePayrollCalculationRunInput(
  input: UnknownRecord,
): ValidationResult<PayrollCalculationRunInput> {
  const payrollPeriodId = text(input.payrollPeriodId ?? input.payroll_period_id);
  const mode = text(input.mode || "all") as PayrollCalculationRunInput["mode"];
  const rawEmployeeIds = input.employeeIds ?? input.employee_ids;
  const employeeIds = Array.isArray(rawEmployeeIds)
    ? rawEmployeeIds.map(text).filter(Boolean)
    : text(rawEmployeeIds)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
  const fieldErrors: Record<string, string> = {};

  if (!uuidPattern.test(payrollPeriodId)) {
    fieldErrors.payroll_period_id = "Choose a valid payroll period.";
  }
  if (!["all", "uncalculated", "selected", "recalculate"].includes(mode)) {
    fieldErrors.mode = "Choose a valid calculation mode.";
  }
  if (["selected", "recalculate"].includes(mode) && employeeIds.length === 0) {
    fieldErrors.employee_ids = "Select at least one employee.";
  }
  if (employeeIds.some((employeeId) => !uuidPattern.test(employeeId))) {
    fieldErrors.employee_ids = "One or more selected employees are invalid.";
  }

  if (Object.keys(fieldErrors).length) return invalid(fieldErrors);
  return { data: { payrollPeriodId, mode, employeeIds } };
}

export function validatePayrollReasonActionInput(
  input: UnknownRecord,
): ValidationResult<PayrollReasonActionInput> {
  const id = text(input.id);
  const reason = text(input.reason);
  const fieldErrors: Record<string, string> = {};
  if (!uuidPattern.test(id)) fieldErrors.id = "The selected payroll record is invalid.";
  if (!reason || reason.length > 1000) {
    fieldErrors.reason = "Reason is required and must be 1,000 characters or fewer.";
  }
  if (Object.keys(fieldErrors).length) return invalid(fieldErrors);
  return { data: { id, reason } };
}

