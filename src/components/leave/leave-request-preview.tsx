import type { LeavePreviewResult } from "@/features/leave/types";
import { formatLeaveUnits, leaveClassificationLabel } from "@/features/leave/presentation";

export function LeaveRequestPreview({ preview }: { preview: LeavePreviewResult | null }) {
  if (!preview) {
    return (
      <div className="card subtle-card">
        <p className="muted">Select a leave type and dates to calculate chargeable units.</p>
      </div>
    );
  }

  const postRequest = preview.availableUnits === null
    ? null
    : preview.availableUnits - preview.chargeableUnits;

  return (
    <section className="card">
      <div className="split-row">
        <h2>Date calculation</h2>
        <strong>{formatLeaveUnits(preview.chargeableUnits)} chargeable</strong>
      </div>
      <dl className="compact-definition-list">
        <div><dt>Requested</dt><dd>{formatLeaveUnits(preview.requestedUnits)}</dd></div>
        {preview.ledgerBalance !== null && <div><dt>Ledger balance</dt><dd>{formatLeaveUnits(preview.ledgerBalance)}</dd></div>}
        <div><dt>Pending reservations</dt><dd>{formatLeaveUnits(preview.pendingReservedUnits)}</dd></div>
        {preview.availableUnits !== null && <div><dt>Available now</dt><dd>{formatLeaveUnits(preview.availableUnits)}</dd></div>}
        {postRequest !== null && <div><dt>After this request</dt><dd>{formatLeaveUnits(postRequest)}</dd></div>}
      </dl>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Schedule</th><th>Classification</th><th>Units</th></tr></thead>
          <tbody>
            {preview.days.map((day) => (
              <tr key={day.leaveDate}>
                <td>{day.leaveDate}</td>
                <td>{day.scheduleName ?? "No schedule"}</td>
                <td>{leaveClassificationLabel(day.classification)}</td>
                <td>{formatLeaveUnits(day.chargeableUnits)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {preview.requiresDocument && <p className="muted">A supporting document is required before submission.</p>}
      {preview.chargeableUnits === 0 && <p className="form-error">This request has no chargeable workdays.</p>}
    </section>
  );
}
