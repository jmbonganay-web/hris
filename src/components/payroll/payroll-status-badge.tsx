import type { PayrollPeriodStatus, PayrollRequestStatus } from "@/features/payroll/constants";
import { payrollPeriodStatusLabel, payrollRequestStatusLabel } from "@/features/payroll/presentation";

export function PayrollStatusBadge({ status }: { status: PayrollPeriodStatus | PayrollRequestStatus }) {
  const label = ["draft", "open", "under_review", "approved", "locked"].includes(status)
    ? payrollPeriodStatusLabel(status as PayrollPeriodStatus)
    : payrollRequestStatusLabel(status as PayrollRequestStatus);
  const tone = status === "approved" || status === "locked" ? "success" : status === "under_review" || status === "pending_approval" ? "warning" : status === "rejected" || status === "cancelled" ? "danger" : "info";
  return <span className={`badge ${tone}`}>{label}</span>;
}
