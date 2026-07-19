import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { requireAttendanceAdmin } from "@/features/attendance/auth";
import { formatCompanyDate, formatCompanyDateTime } from "@/features/attendance/time";
import { getHolidayCalendarGroup } from "@/features/overtime/holidays/queries";
import { holidayTypeLabel } from "@/features/overtime/presentation";

export default async function HolidayDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ holidayGroupId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAttendanceAdmin();
  const [{ holidayGroupId }, query] = await Promise.all([params, searchParams]);
  const result = await getHolidayCalendarGroup(holidayGroupId);
  if (!result.group || !result.group.active_version) notFound();

  return (
    <>
      <PageHeader
        title={result.group.active_version.holiday_name}
        description="Review the current holiday and every immutable replacement version."
        action={(
          <div className="header-actions">
            <Link className="btn" href="/settings/holidays">Back to holidays</Link>
            <Link className="btn primary" href={`/settings/holidays/${holidayGroupId}/replace`}>Replace version</Link>
          </div>
        )}
      />
      {query.success === "created" && <p className="form-success">Holiday created.</p>}
      {query.success === "replaced" && <p className="form-success">Holiday replacement created.</p>}
      <div className="stack-list">
        {result.versions.map((version) => (
          <article className="card policy-card" key={version.id}>
            <div className="card-header-row">
              <div><span className="eyebrow">Revision {version.revision_number}</span><h2>{version.holiday_name}</h2></div>
              <span className={`badge ${version.id === result.group?.active_version_id ? "success" : "info"}`}>
                {version.id === result.group?.active_version_id ? "Current version" : "Historical version"}
              </span>
            </div>
            <dl className="detail-grid">
              <div><dt>Date</dt><dd>{formatCompanyDate(version.holiday_date)}</dd></div>
              <div>
                <dt>Type</dt>
                <dd>
                  {version.holiday_type === "regular_holiday" && version.holiday_count === 2
                    ? "Double regular holiday"
                    : holidayTypeLabel(version.holiday_type)}
                </dd>
              </div>
              <div><dt>Holiday count</dt><dd>{version.holiday_count === 2 ? "Two overlapping regular holidays" : "Single holiday"}</dd></div>
              <div><dt>Lifecycle</dt><dd>{version.is_active ? "Active" : "Deactivated"}</dd></div>
              <div><dt>Created</dt><dd>{formatCompanyDateTime(version.created_at)}</dd></div>
            </dl>
            {version.change_reason && <p className="private-reason"><strong>Change reason:</strong> {version.change_reason}</p>}
          </article>
        ))}
      </div>
    </>
  );
}
