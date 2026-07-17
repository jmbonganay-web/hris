import type {
  CompensationType,
  PayrollPeriodStatus,
  PayrollRequestStatus,
  PayrollScheduleType,
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
