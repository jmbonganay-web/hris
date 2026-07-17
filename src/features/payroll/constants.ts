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
