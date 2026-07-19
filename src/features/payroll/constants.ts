export const payrollScheduleTypeValues = [
  "weekly",
  "biweekly",
  "semi_monthly",
  "monthly",
] as const;
export type PayrollScheduleType = (typeof payrollScheduleTypeValues)[number];

export const payrollPeriodStatusValues = [
  "draft",
  "open",
  "under_review",
  "approved",
  "locked",
] as const;
export type PayrollPeriodStatus = (typeof payrollPeriodStatusValues)[number];

export const compensationTypeValues = ["monthly", "hourly"] as const;
export type CompensationType = (typeof compensationTypeValues)[number];

export const payrollRequestStatusValues = [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "superseded",
  "cancelled",
] as const;
export type PayrollRequestStatus = (typeof payrollRequestStatusValues)[number];

export const payrollBusinessDayAdjustmentValues = ["previous"] as const;
export type PayrollBusinessDayAdjustment =
  (typeof payrollBusinessDayAdjustmentValues)[number];

export const payrollPeriodEventTypeValues = [
  "generated",
  "opened",
  "submitted_for_review",
  "returned_to_open",
  "approved",
  "locked",
  "reopened",
  "date_adjusted",
] as const;
export type PayrollPeriodEventType = (typeof payrollPeriodEventTypeValues)[number];

export const compensationEventTypeValues = [
  "draft_created",
  "draft_updated",
  "submitted",
  "approved",
  "rejected",
  "superseded",
  "assignment_draft_created",
  "assignment_draft_updated",
  "assignment_submitted",
  "assignment_approved",
  "assignment_rejected",
  "assignment_superseded",
] as const;
export type CompensationEventType = (typeof compensationEventTypeValues)[number];

export const payrollCalculationRunStatusValues = [
  "queued",
  "running",
  "completed",
  "completed_with_exceptions",
  "failed",
] as const;
export type PayrollCalculationRunStatus =
  (typeof payrollCalculationRunStatusValues)[number];

export const payrollEmployeeEntryStatusValues = [
  "pending",
  "calculated",
  "stale",
  "recalculated",
  "exception",
  "excluded",
] as const;
export type PayrollEmployeeEntryStatus =
  (typeof payrollEmployeeEntryStatusValues)[number];

export const payrollExceptionSeverityValues = ["warning", "blocking"] as const;
export type PayrollExceptionSeverity =
  (typeof payrollExceptionSeverityValues)[number];

export const payrollExceptionStatusValues = ["open", "resolved", "ignored"] as const;
export type PayrollExceptionStatus =
  (typeof payrollExceptionStatusValues)[number];

export const payrollBasisRoundingModeValues = [
  "half_up",
  "half_even",
  "truncate",
] as const;
export type PayrollBasisRoundingMode =
  (typeof payrollBasisRoundingModeValues)[number];

export const payrollSourceTypeValues = [
  "employment",
  "compensation",
  "schedule_assignment",
  "work_schedule",
  "attendance",
  "leave",
  "overtime",
  "payroll_basis_rule",
  "holiday",
  "premium_rule",
  "attendance_deduction_rule",
  "day_type_resolution",
] as const;
export type PayrollSourceType = (typeof payrollSourceTypeValues)[number];


export const premiumRuleScopeTypeValues = [
  "company_default",
  "employment_type",
  "department",
  "position",
  "payroll_group",
] as const;
export type PremiumRuleScopeType = (typeof premiumRuleScopeTypeValues)[number];

export const premiumDayTypeValues = [
  "regular_workday",
  "rest_day",
  "special_non_working_day",
  "regular_holiday",
  "special_day_rest_day",
  "regular_holiday_rest_day",
  "double_regular_holiday",
  "double_regular_holiday_rest_day",
] as const;
export type PremiumDayType = (typeof premiumDayTypeValues)[number];

export const premiumTimeRoundingModeValues = [
  "exact_minutes",
  "round_down",
  "round_up",
  "nearest_increment",
] as const;
export type PremiumTimeRoundingMode =
  (typeof premiumTimeRoundingModeValues)[number];

export const premiumTypeValues = [
  "rest_day",
  "special_day",
  "regular_holiday",
  "special_day_rest_day",
  "regular_holiday_rest_day",
  "double_holiday",
  "double_holiday_rest_day",
  "regular_overtime",
  "rest_day_overtime",
  "special_day_overtime",
  "regular_holiday_overtime",
  "combined_day_overtime",
  "night_differential",
] as const;
export type PremiumType = (typeof premiumTypeValues)[number];

export const premiumRuleStatusValues = payrollRequestStatusValues;
