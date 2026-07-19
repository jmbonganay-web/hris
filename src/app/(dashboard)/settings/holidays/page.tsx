import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireAttendanceAdmin } from "@/features/attendance/auth";
import { formatCompanyDate } from "@/features/attendance/time";
import { getHolidayCalendarGroups } from "@/features/overtime/holidays/queries";
import { holidayTypeLabel } from "@/features/overtime/presentation";

export default async function HolidaysPage() {
  await requireAttendanceAdmin();
  const groups = await getHolidayCalendarGroups();
  const sorted = [...groups].sort((left, right) =>
    (left.active_version?.holiday_date ?? "9999-12-31").localeCompare(
      right.active_version?.holiday_date ?? "9999-12-31",
    ),
  );

  return (
    <>
      <PageHeader
        title="Holiday calendar"
        description="Manage immutable regular, special non-working, and company holidays."
        action={(
          <div className="header-actions">
            <Link className="btn" href="/settings">Back to settings</Link>
            <Link className="btn primary" href="/settings/holidays/new">Create holiday</Link>
          </div>
        )}
      />
      {sorted.length === 0 ? (
        <div className="card empty-state"><h2>No holidays yet</h2><p>Create the first holiday calendar entry.</p></div>
      ) : (
        <div className="stack-list">
          {sorted.map((group) => {
            const version = group.active_version;
            return (
              <article className="card holiday-card" key={group.id}>
                <div>
                  <span className={`badge ${version?.is_active ? "success" : "warning"}`}>
                    {version?.is_active ? "Active" : "Deactivated"}
                  </span>
                  <h2>{version?.holiday_name ?? "Unavailable holiday"}</h2>
                  <p className="muted">
                    {version
                      ? `${formatCompanyDate(version.holiday_date)} · ${
                          version.holiday_type === "regular_holiday" && version.holiday_count === 2
                            ? "Double regular holiday"
                            : holidayTypeLabel(version.holiday_type)
                        }`
                      : "No active version"}
                  </p>
                </div>
                <Link className="btn" href={`/settings/holidays/${group.id}`}>View history</Link>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
