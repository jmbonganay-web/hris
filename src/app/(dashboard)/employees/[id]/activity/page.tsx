import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityTimeline } from "@/components/employees/profile/activity-timeline";
import { ProfileTabs } from "@/components/employees/profile/profile-tabs";
import { PageHeader } from "@/components/page-header";
import { getEmployeeActivity } from "@/features/employees/audit/query";
import {
  activityFilters,
  type ActivityFilter,
} from "@/features/employees/audit/types";
import { requireEmployeeProfileManager } from "@/features/employees/auth";
import { getEmployee } from "@/features/employees/queries";

const filterLabels: Record<ActivityFilter, string> = {
  all: "All activity",
  profile: "Profile",
  employment: "Employment",
  emergency: "Emergency contacts",
  sensitive: "Sensitive data",
  hr_notes: "HR notes",
  system: "System",
};

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function pageHref(employeeId: string, filter: ActivityFilter, page: number) {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/employees/${employeeId}/activity${query ? `?${query}` : ""}`;
}

export default async function EmployeeActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  await requireEmployeeProfileManager(id);

  const requestedFilter = firstQueryValue(query.filter) ?? "all";
  const filter = activityFilters.includes(requestedFilter as ActivityFilter)
    ? requestedFilter as ActivityFilter
    : "all";
  const requestedPage = Number(firstQueryValue(query.page) ?? "1");

  const [employee, activity] = await Promise.all([
    getEmployee(id),
    getEmployeeActivity(id, filter, requestedPage),
  ]);
  if (!employee) notFound();

  return (
    <>
      <PageHeader
        title="Activity"
        description={`Immutable HR activity history for ${employee.first_name} ${employee.last_name}.`}
        action={(
          <Link className="btn" href={`/employees/${id}`}>
            Back to profile
          </Link>
        )}
      />

      <ProfileTabs employeeId={id} active="activity" canManage />

      <section className="card activity-toolbar" aria-label="Filter activity">
        {activityFilters.map((item) => (
          <Link
            key={item}
            className={`btn${filter === item ? " primary" : ""}`}
            href={pageHref(id, item, 1)}
          >
            {filterLabels[item]}
          </Link>
        ))}
      </section>

      {activity.entries.length === 0 ? (
        <div className="card empty">No activity has been recorded for this employee.</div>
      ) : (
        <section className="card">
          <ActivityTimeline entries={activity.entries} />
        </section>
      )}

      <nav className="pagination" aria-label="Activity pages">
        <Link
          className={`btn${activity.page <= 1 ? " disabled" : ""}`}
          aria-disabled={activity.page <= 1}
          href={pageHref(id, filter, Math.max(1, activity.page - 1))}
        >
          Previous
        </Link>
        <span>
          Page {activity.page} of {activity.totalPages} · {activity.total} entries
        </span>
        <Link
          className={`btn${activity.page >= activity.totalPages ? " disabled" : ""}`}
          aria-disabled={activity.page >= activity.totalPages}
          href={pageHref(id, filter, Math.min(activity.totalPages, activity.page + 1))}
        >
          Next
        </Link>
      </nav>
    </>
  );
}
