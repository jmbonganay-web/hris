import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireAttendanceAdmin } from "@/features/attendance/auth";
import {
  formatCompanyDate,
  formatCompanyDateTime,
} from "@/features/attendance/time";
import { getOvertimePolicyVersions } from "@/features/overtime/policy/queries";
import type { OvertimePolicyVersion } from "@/features/overtime/policy/types";

function creatorName(policy: OvertimePolicyVersion) {
  return policy.creator?.display_name
    || [policy.creator?.first_name, policy.creator?.last_name]
      .filter(Boolean)
      .join(" ")
    || "System";
}

function PolicyCard({
  policy,
  label,
}: {
  policy: OvertimePolicyVersion;
  label: string;
}) {
  return (
    <article className="card policy-card">
      <div className="card-header-row">
        <div>
          <span className="eyebrow">{label}</span>
          <h2>{policy.minimum_qualifying_minutes}-minute threshold</h2>
        </div>
        <span className="badge info">
          Effective {formatCompanyDate(policy.effective_date)}
        </span>
      </div>
      <dl className="detail-grid">
        <div><dt>Created by</dt><dd>{creatorName(policy)}</dd></div>
        <div><dt>Created</dt><dd>{formatCompanyDateTime(policy.created_at)}</dd></div>
      </dl>
      {policy.change_reason && (
        <p className="private-reason">
          <strong>Change reason:</strong> {policy.change_reason}
        </p>
      )}
    </article>
  );
}

export default async function OvertimePolicyPage() {
  await requireAttendanceAdmin();
  const policies = await getOvertimePolicyVersions();

  return (
    <>
      <PageHeader
        title="Overtime policy"
        description="Manage immutable, effective-dated overtime qualification rules."
        action={(
          <div className="header-actions">
            <Link className="btn" href="/settings">Back to settings</Link>
            <Link className="btn primary" href="/settings/overtime-policy/new">
              Create policy version
            </Link>
          </div>
        )}
      />
      {policies.current ? (
        <PolicyCard policy={policies.current} label="Current policy" />
      ) : (
        <div className="card empty-state">
          <h2>Implicit default policy</h2>
          <p>Minimum qualifying minutes: 30</p>
        </div>
      )}
      {policies.upcoming.length > 0 && (
        <section>
          <h2 className="section-title">Upcoming versions</h2>
          <div className="stack-list">
            {policies.upcoming.map((policy) => (
              <PolicyCard key={policy.id} policy={policy} label="Upcoming" />
            ))}
          </div>
        </section>
      )}
      <section>
        <h2 className="section-title">Policy history</h2>
        {policies.history.length > 0 ? (
          <div className="stack-list">
            {policies.history.map((policy) => (
              <PolicyCard key={policy.id} policy={policy} label="Historical version" />
            ))}
          </div>
        ) : (
          <p className="muted">No explicit policy versions yet.</p>
        )}
      </section>
    </>
  );
}
