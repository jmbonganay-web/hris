import type {
  CompensationType,
  PayrollPeriodStatus,
  PayrollRequestStatus,
  PayrollScheduleType,
  PayrollCalculationRunStatus,
  PayrollEmployeeEntryStatus,
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

