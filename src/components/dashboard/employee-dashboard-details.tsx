import type { DashboardLeaveBalance, DashboardScheduleSummary } from "@/features/dashboard/types";

function compactTime(value: string | null) {
  return value ? value.slice(0, 5) : "—";
}

export function EmployeeDashboardDetails({
  balances,
  schedule,
}: {
  balances: DashboardLeaveBalance[];
  schedule: DashboardScheduleSummary | null;
}) {
  return (
    <article className="card employee-dashboard-details">
      <div className="section-heading"><div><h2>My HR snapshot</h2><p>Current schedule and leave balances available to your employee profile.</p></div></div>
      <section className="dashboard-schedule-summary">
        <span className="eyebrow">Current schedule</span>
        {schedule ? (
          <dl className="profile-summary-list compact">
            <div><dt>Schedule</dt><dd>{schedule.scheduleName ?? "Assigned schedule"}</dd></div>
            <div><dt>Today</dt><dd>{schedule.state.replaceAll("_", " ")}</dd></div>
            <div><dt>Hours</dt><dd>{compactTime(schedule.startTime)}–{compactTime(schedule.endTime)}</dd></div>
            <div><dt>Upcoming change</dt><dd>{schedule.nextEffectiveDate ?? "None"}</dd></div>
          </dl>
        ) : <div className="empty-state compact"><strong>No current schedule</strong><span>Contact HR if a schedule assignment is expected.</span></div>}
      </section>
      <section className="dashboard-balance-section">
        <span className="eyebrow">Leave balances</span>
        {balances.length === 0 ? <p className="muted">No tracked leave balances are available.</p> : (
          <div className="dashboard-balance-grid">
            {balances.map((balance) => (
              <div className="dashboard-balance-item" key={balance.leaveType}>
                <span>{balance.leaveType}</span><strong>{balance.availableUnits ?? "—"}</strong><small>{balance.pendingUnits} pending · {balance.usedUnits} used</small>
              </div>
            ))}
          </div>
        )}
      </section>
    </article>
  );
}
