import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { requireOrganizationAdmin } from "@/features/organization/auth";
import { getDepartments } from "@/features/organization/queries";

function pageHref(params: Record<string, string | undefined>, page: number) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => value && search.set(key, value));
  search.set("page", String(page));
  return `/settings/departments?${search.toString()}`;
}

function statusLabel(item: { archived_at: string | null; is_active: boolean }) {
  if (item.archived_at) return "Archived";
  return item.is_active ? "Active" : "Inactive";
}

export default async function DepartmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireOrganizationAdmin();
  const raw = await searchParams;
  const query = typeof raw.query === "string" ? raw.query : "";
  const status = typeof raw.status === "string" ? raw.status : "active";
  const page = Math.max(1, Number(typeof raw.page === "string" ? raw.page : 1) || 1);
  const success = typeof raw.success === "string" ? raw.success : "";
  const result = await getDepartments({ query, status, page });
  const filters = { query: query || undefined, status: result.status === "active" ? undefined : result.status };

  return (
    <>
      <PageHeader
        title="Departments"
        description="Manage teams, department heads, employee assignments, and availability."
        action={<div className="header-actions"><Link className="btn" href="/settings">Back to settings</Link><Link className="btn primary" href="/settings/departments/new">+ Add department</Link></div>}
      />

      {success === "archived" && <p className="form-success">Department archived successfully. Existing employee assignments were preserved.</p>}

      <div className="card">
        <form className="toolbar" method="get">
          <input className="field employee-search" name="query" defaultValue={query} placeholder="Search department name or code" aria-label="Search departments" />
          <select className="field" name="status" defaultValue={result.status} aria-label="Filter departments by status">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
            <option value="all">All statuses</option>
          </select>
          <button className="btn" type="submit">Apply filters</button>
          {(query || result.status !== "active") && <Link className="btn" href="/settings/departments">Clear</Link>}
        </form>

        {result.departments.length === 0 ? (
          <div className="empty">
            <h3>No departments found</h3>
            <p>{query || result.status !== "active" ? "Try adjusting your search or status filter." : "Create your first department to organize employee records."}</p>
            {!query && result.status === "active" && <Link className="btn primary" href="/settings/departments/new">Add department</Link>}
          </div>
        ) : (
          <>
            <div className="table-wrap organization-table-desktop">
              <table>
                <thead><tr><th>Department</th><th>Code</th><th>Department head</th><th>Employees</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {result.departments.map((department) => (
                    <tr key={department.id}>
                      <td><strong>{department.name}</strong><div className="muted organization-description">{department.description || "No description"}</div></td>
                      <td>{department.code || "—"}</td>
                      <td>{department.department_head ? `${department.department_head.first_name} ${department.department_head.last_name}` : "Not assigned"}</td>
                      <td>{department.employee_count}</td>
                      <td><StatusBadge value={statusLabel(department)} /></td>
                      <td><Link className="table-link" href={`/settings/departments/${department.id}`}>View</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="organization-card-list">
              {result.departments.map((department) => (
                <article className="organization-list-card" key={department.id}>
                  <div><strong>{department.name}</strong><span className="muted">{department.code || "No code"}</span></div>
                  <StatusBadge value={statusLabel(department)} />
                  <dl><div><dt>Department head</dt><dd>{department.department_head ? `${department.department_head.first_name} ${department.department_head.last_name}` : "Not assigned"}</dd></div><div><dt>Employees</dt><dd>{department.employee_count}</dd></div></dl>
                  <Link className="btn" href={`/settings/departments/${department.id}`}>View department</Link>
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
