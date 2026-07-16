import type { LeaveBalanceSummary } from "@/features/leave/types";
import { formatLeaveUnits } from "@/features/leave/presentation";

export function LeaveBalanceCards({ balances }: { balances: LeaveBalanceSummary[] }) {
  if (balances.length === 0) {
    return (
      <section className="card empty-state">
        <h2>No leave balances</h2>
        <p>No leave type is currently available for your account.</p>
      </section>
    );
  }

  return (
    <section className="leave-balance-grid" aria-label="Leave balances">
      {balances.map((balance) => (
        <article className="card leave-balance-card" key={balance.leaveTypeId}>
          <div className="split-row">
            <h2>{balance.leaveTypeName}</h2>
            <span className={`badge ${balance.isPaid ? "success" : "warning"}`}>
              {balance.isPaid ? "Paid" : "Unpaid"}
            </span>
          </div>
          {balance.isBalanceTracked ? (
            <>
              <strong className="metric-value">
                {formatLeaveUnits(balance.availableUnits ?? 0)}
              </strong>
              <p className="muted">
                Available after {formatLeaveUnits(balance.pendingUnits)} pending
              </p>
              <dl className="compact-definition-list">
                <div><dt>Allocated</dt><dd>{formatLeaveUnits(balance.allocatedUnits)}</dd></div>
                <div><dt>Used</dt><dd>{formatLeaveUnits(balance.usedUnits)}</dd></div>
                <div><dt>Carryover</dt><dd>{formatLeaveUnits(balance.carryoverUnits)}</dd></div>
              </dl>
              {balance.expiringUnits > 0 && balance.expiresOn && (
                <p className="muted">
                  {formatLeaveUnits(balance.expiringUnits)} expires on {balance.expiresOn}.
                </p>
              )}
            </>
          ) : (
            <>
              <strong className="metric-value">Balance exempt</strong>
              <p className="muted">
                {formatLeaveUnits(balance.usedUnits)} approved in {balance.leaveYear}
              </p>
            </>
          )}
        </article>
      ))}
    </section>
  );
}
