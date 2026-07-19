import type {
  CompensationType,
  PayrollPeriodStatus,
  PayrollRequestStatus,
  PayrollScheduleType,
  PayrollCalculationRunStatus,
  PayrollEmployeeEntryStatus,
  PremiumDayType,
  PremiumRuleScopeType,
  PremiumTimeRoundingMode,
  PremiumType,
} from "./constants.ts";

const scheduleTypeLabels: Record<PayrollScheduleType, string> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  semi_monthly: "Semi-monthly",
  monthly: "Monthly",
};
const periodStatusLabels: Record<PayrollPeriodStatus, string> = {
  draft: "Draft",
  open: "Open",
  under_review: "Under review",
  approved: "Approved",
  locked: "Locked",
};
const requestStatusLabels: Record<PayrollRequestStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  approved: "Approved",
  rejected: "Rejected",
  superseded: "Superseded",
  cancelled: "Cancelled",
};
const compensationTypeLabels: Record<CompensationType, string> = {
  monthly: "Monthly salary",
  hourly: "Hourly rate",
};

export function payrollScheduleTypeLabel(value: PayrollScheduleType) {
  return scheduleTypeLabels[value];
}
export function payrollPeriodStatusLabel(value: PayrollPeriodStatus) {
  return periodStatusLabels[value];
}
export function payrollRequestStatusLabel(value: PayrollRequestStatus) {
  return requestStatusLabels[value];
}
export function compensationTypeLabel(value: CompensationType) {
  return compensationTypeLabels[value];
}
export function formatPayrollMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
export function formatPayrollDate(value: string | null) {
  if (!value) return "Not available";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.valueOf())) return "Not available";
  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  }).format(date);
}
export function formatPayrollDateTime(value: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Not available";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(date);
}

const calculationRunStatusLabels: Record<PayrollCalculationRunStatus, string> = {
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  completed_with_exceptions: "Completed with exceptions",
  failed: "Failed",
};

const employeeEntryStatusLabels: Record<PayrollEmployeeEntryStatus, string> = {
  pending: "Pending",
  calculated: "Calculated",
  stale: "Needs recalculation",
  recalculated: "Recalculated",
  exception: "Exception",
  excluded: "Excluded",
};

export function payrollCalculationRunStatusLabel(value: PayrollCalculationRunStatus) {
  return calculationRunStatusLabels[value];
}

export function payrollEmployeeEntryStatusLabel(value: PayrollEmployeeEntryStatus) {
  return employeeEntryStatusLabels[value];
}

export function formatPayrollMinutes(value: number) {
  const minutes = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder}m`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}



const premiumRuleScopeLabels: Record<PremiumRuleScopeType, string> = {
  company_default: "Company default",
  employment_type: "Employment type",
  department: "Department",
  position: "Position",
  payroll_group: "Payroll group",
};

const premiumDayTypeLabels: Record<PremiumDayType, string> = {
  regular_workday: "Regular workday",
  rest_day: "Rest day",
  special_non_working_day: "Special non-working day",
  regular_holiday: "Regular holiday",
  special_day_rest_day: "Special day + rest day",
  regular_holiday_rest_day: "Regular holiday + rest day",
  double_regular_holiday: "Double regular holiday",
  double_regular_holiday_rest_day: "Double regular holiday + rest day",
};

const premiumTypeLabels: Record<PremiumType, string> = {
  rest_day: "Rest-day premium",
  special_day: "Special-day premium",
  regular_holiday: "Regular-holiday premium",
  special_day_rest_day: "Special day + rest-day premium",
  regular_holiday_rest_day: "Regular holiday + rest-day premium",
  double_holiday: "Double-holiday premium",
  double_holiday_rest_day: "Double holiday + rest-day premium",
  regular_overtime: "Regular overtime",
  rest_day_overtime: "Rest-day overtime",
  special_day_overtime: "Special-day overtime",
  regular_holiday_overtime: "Regular-holiday overtime",
  combined_day_overtime: "Combined-day overtime",
  night_differential: "Night differential",
};

const premiumRoundingLabels: Record<PremiumTimeRoundingMode, string> = {
  exact_minutes: "Exact minutes",
  round_down: "Round down",
  round_up: "Round up",
  nearest_increment: "Nearest increment",
};

export function premiumRuleScopeLabel(value: PremiumRuleScopeType) {
  return premiumRuleScopeLabels[value];
}
export function premiumDayTypeLabel(value: PremiumDayType) {
  return premiumDayTypeLabels[value];
}
export function premiumTypeLabel(value: PremiumType) {
  return premiumTypeLabels[value];
}
export function premiumTimeRoundingModeLabel(value: PremiumTimeRoundingMode) {
  return premiumRoundingLabels[value];
}
export function premiumStatusLabel(value: PayrollRequestStatus) {
  return requestStatusLabels[value];
}
