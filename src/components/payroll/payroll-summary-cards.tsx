import type { PayrollOverview } from "@/features/payroll/types";

type Summary = { label: string; value: number; detail: string };

export function PayrollSummaryCards({ overview }: { overview: PayrollOverview }) {
  const items: Summary[] = [
    { label: "Active schedules", value: overview.activeScheduleCount, detail: "Payroll schedules currently available" },
    { label: "Upcoming draft periods", value: overview.upcomingDraftPeriodCount, detail: "Draft periods in the next 90 days" },
    { label: "Periods requiring review", value: overview.periodsRequiringReviewCount, detail: "Open or under-review periods" },
    { label: "Pending approvals", value: overview.pendingApprovalCount, detail: "Compensation and schedule requests" },
    { label: "Missing compensation", value: overview.employeesMissingCompensationCount, detail: "Active employees without current compensation" },
    { label: "Missing payroll schedule", value: overview.employeesMissingScheduleCount, detail: "Active employees without a current assignment" },
  ];
  if (overview.role === "super_admin") {
    items.push(
      { label: "Backdated warnings", value: overview.backdatedWarningCount, detail: "Pending requests effective in the past" },
      { label: "Recently reopened", value: overview.recentlyReopenedCount, detail: "Locked periods reopened in 30 days" },
    );
  }
  return <div className="payroll-summary-grid">{items.map((item) => <article className="card payroll-summary-card" key={item.label}><span>{item.label}</span><strong>{item.value}</strong><p>{item.detail}</p></article>)}</div>;
}
