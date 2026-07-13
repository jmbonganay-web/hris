import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { requireOrganizationAdmin } from "@/features/organization/auth";
import { getActiveDepartmentOptions, getJobTitles } from "@/features/organization/queries";

function pageHref(params: Record<string, string | undefined>, page: number) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => value && search.set(key, value));
  search.set("page", String(page));
  return `/settings/job-titles?${search.toString()}`;
}

function statusLabel(item: { archived_at: string | null; is_active: boolean }) {
  if (item.archived_at) return "Archived";
  return item.is_active ? "Active" : "Inactive";
}

export default async function JobTitlesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireOrganizationAdmin();
  const raw = await searchParams;
  const query = typeof raw.query === "string" ? raw.query : "";
  const department = typeof raw.department === "string" ? raw.department : "";
  const status = typeof raw.status === "string" ? raw.status : "active";
  const page = Math.max(1, Number(typeof raw.page === "string" ? raw.page : 1) || 1);
  const success = typeof raw.success === "string" ? raw.success : "";

  const [result, departments] = await Promise.all([
    getJobTitles({ query, department, status, page }),
    getActiveDepartmentOptions(),
  ]);
  const filters = {
    query: query || undefined,
    department: department || undefined,
    status: result.status === "active" ? undefined : result.status,
  };

  return (
    <>
      <PageHeader
        title="Job titles"
        description="Manage reusable employee roles and their department relationships."
        action={<div className="header-actions"><Link className="btn" href="/settings">Back to settings</Link><Link className="btn primary" href="/settings/job-titles/new">+ Add job title</Link></div>}
      />

      {success === "archived" && <p className="form-success">Job title archived successfully. Existing employee assignments were preserved.</p>}

      <div className="card">
        <form className="toolbar" method="get">
          <input className="field employee-search" name="query" defaultValue={query} placeholder="Search job-title name" aria-label="Search job titles" />
          <select className="field" name="department" defaultValue={department} aria-label="Filter job titles by department">
            <option value="">All departments</option>
            {departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select className="field" name="status" defaultValue={result.status} aria-label="Filter job titles by status">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
            <option value="all">All statuses</option>
          </select>
          <button className="btn" type="submit">Apply filters</button>
          {(query || department || result.status !== "active") && <Link className="btn" href="/settings/job-titles">Clear</Link>}
        </form>

        {result.jobTitles.length === 0 ? (
          <div className="empty">
            <h3>No job titles found</h3>
            <p>{query || department || result.status !== "active" ? "Try adjusting your filters." : "Create your first job title to standardize employee roles."}</p>
            {!query && !department && result.status === "active" && <Link className="btn primary" href="/settings/job-titles/new">Add job title</Link>}
          </div>
        ) : (
          <>
            <div className="table-wrap organization-table-desktop">
              <table>
                <thead><tr><th>Job title</th><th>Department</th><th>Employees</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {result.jobTitles.map((jobTitle) => (
                    <tr key={jobTitle.id}>
                      <td><strong>{jobTitle.title}</strong><div className="muted organization-description">{jobTitle.description || "No description"}</div></td>
                      <td>{jobTitle.department?.name ?? "Organization-wide"}</td>
                      <td>{jobTitle.employee_count}</td>
                      <td><StatusBadge value={statusLabel(jobTitle)} /></td>
                      <td><Link className="table-link" href={`/settings/job-titles/${jobTitle.id}`}>View</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="organization-card-list">
              {result.jobTitles.map((jobTitle) => (
                <article className="organization-list-card" key={jobTitle.id}>
                  <div><strong>{jobTitle.title}</strong><span className="muted">{jobTitle.department?.name ?? "Organization-wide"}</span></div>
                  <StatusBadge value={statusLabel(jobTitle)} />
                  <dl><div><dt>Employees</dt><dd>{jobTitle.employee_count}</dd></div><div><dt>Scope</dt><dd>{jobTitle.department?.name ?? "All departments"}</dd></div></dl>
                  <Link className="btn" href={`/settings/job-titles/${jobTitle.id}`}>View job title</Link>
                </article>
              ))}
            </div>
          </>
        )}

        <div className="pagination">
          <span className="muted">Showing {result.count === 0 ? 0 : (result.page - 1) * result.pageSize + 1}–{Math.min(result.page * result.pageSize, result.count)} of {result.count}</span>
          <div className="pagination-actions">
            <Link aria-disabled={result.page <= 1} className={`btn ${result.page <= 1 ? "disabled" : ""}`} href={result.page <= 1 ? "#" : pageHref(filters, result.page - 1)}>Previous</Link>
            <span>Page {result.page} of {result.totalPages}</span>
            <Link aria-disabled={result.page >= result.totalPages} className={`btn ${result.page >= result.totalPages ? "disabled" : ""}`} href={result.page >= result.totalPages ? "#" : pageHref(filters, result.page + 1)}>Next</Link>
          </div>
        </div>
      </div>
    </>
  );
}
