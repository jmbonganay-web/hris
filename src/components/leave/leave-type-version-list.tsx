import { formatCompanyDate, formatCompanyDateTime } from "@/features/attendance/time";
import { formatLeaveUnits } from "@/features/leave/presentation";
import type { LeaveTypeVersion } from "@/features/leave/types";

export function LeaveTypeVersionList({ versions }: { versions: LeaveTypeVersion[] }) {
  const sorted = [...versions].sort((a, b) => b.effective_from.localeCompare(a.effective_from) || b.revision_number - a.revision_number);
  if (sorted.length === 0) return <p className="muted">No policy versions recorded.</p>;
  return (
    <div className="leave-policy-version-list">
      {sorted.map((version) => (
        <article className="card" key={version.id}>
          <div className="split-row"><div><h3>Revision {version.revision_number} · {version.name}</h3><p className="muted">Effective {formatCompanyDate(version.effective_from)} · created {formatCompanyDateTime(version.created_at)}</p></div><span className={`badge ${version.is_active ? "success" : "warning"}`}>{version.is_active ? "Active" : "Archived"}</span></div>
          <dl className="compact-definition-list">
            <div><dt>Payment</dt><dd>{version.is_paid ? "Paid" : "Unpaid"}</dd></div>
            <div><dt>Balance</dt><dd>{version.is_balance_tracked ? "Tracked" : "Exempt"}</dd></div>
            <div><dt>Annual allocation</dt><dd>{formatLeaveUnits(version.default_annual_units)}</dd></div>
            <div><dt>Carryover</dt><dd>{version.carryover_enabled ? `Enabled${version.carryover_cap_units === null ? "" : ` · cap ${formatLeaveUnits(version.carryover_cap_units)}`}` : "Disabled"}</dd></div>
            <div><dt>Employee note</dt><dd>{version.employee_note_required ? "Required" : "Optional"}</dd></div>
            <div><dt>Document</dt><dd>{version.document_required ? `Required${version.document_required_min_units === null ? "" : ` from ${formatLeaveUnits(version.document_required_min_units)}`}` : "Optional"}</dd></div>
          </dl>
          {version.description && <p>{version.description}</p>}
        </article>
      ))}
    </div>
  );
}
