import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { getCurrentRole } from "@/features/employees/auth";
import { getEmployeeOptions, getEmployees } from "@/features/employees/queries";
import { initials } from "@/lib/utils";

function buildPageHref(params: Record<string, string | undefined>, page: number) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => value && search.set(key, value));
  search.set("page", String(page));
  return `/employees?${search.toString()}`;
}

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const query = typeof raw.query === "string" ? raw.query : "";
  const department = typeof raw.department === "string" ? raw.department : "";
  const status = typeof raw.status === "string" ? raw.status : "";
  const page = Math.max(1, Number(typeof raw.page === "string" ? raw.page : 1) || 1);
  const success = typeof raw.success === "string" ? raw.success : "";
  const error = typeof raw.error === "string" ? raw.error : "";

  const [role, options, result] = await Promise.all([
    getCurrentRole(),
    getEmployeeOptions(),
    getEmployees({ query, department, status, page }),
  ]);
  const canManage = role === "super_admin" || role === "hr_admin";
  const activeFilters = { query: query || undefined, department: department || undefined, status: status || undefined };

  return <>
    <PageHeader
      title="Employees"
      description="Manage employee records, roles, departments, and status."
      action={canManage ? <Link href="/employees/new" className="btn primary">+ Add employee</Link> : undefined}
    />

    {success === "archived" && <p className="form-success">Employee archived successfully.</p>}
    {error === "unauthorized" && <p className="form-error">You do not have permission to manage employee records.</p>}

    <div className="card">
      <form className="toolbar" method="get">
        <input className="field employee-search" name="query" defaultValue={query} placeholder="Search name, email, or employee ID" aria-label="Search employees" />
        <select className="field" name="department" defaultValue={department} aria-label="Filter by department">
          <option value="">All departments</option>
          {options.departments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <select className="field" name="status" defaultValue={status} aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="probation">Probation</option>
          <option value="on_leave">On leave</option>
          <option value="inactive">Inactive</option>
          <option value="terminated">Terminated</option>
        </select>
        <button className="btn" type="submit">Apply filters</button>
        {(query || department || status) && <Link className="btn" href="/employees">Clear</Link>}
      </form>

      {result.employees.length === 0 ? (
        <div className="empty"><h3>No employees found</h3><p>{query || department || status ? "Try adjusting your filters." : "Add your first employee to begin building the directory."}</p>{canManage && !query && !department && !status && <Link className="btn primary" href="/employees/new">Add employee</Link>}</div>
      ) : (
        <div className="table-wrap"><table><thead><tr><th>Employee</th><th>ID</th><th>Role</th><th>Department</th><th>Type</th><th>Hire date</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
          {result.employees.map(employee => {
            const name = `${employee.first_name} ${employee.last_name}`.trim();
            return <tr key={employee.id}>
              <td><div className="person"><div className="avatar">{initials(name)}</div><div><strong>{name}</strong><div className="muted">{employee.work_email}</div></div></div></td>
              <td>{employee.employee_number}</td>
              <td>{employee.job_title?.title ?? "Unassigned"}</td>
              <td>{employee.department?.name ?? "Unassigned"}</td>
              <td>{employee.employment_type.replace("_", " ")}</td>
              <td>{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(`${employee.hire_date}T00:00:00`))}</td>
              <td><StatusBadge value={employee.employment_status.replace("_", " ")} /></td>
              <td><Link className="table-link" href={`/employees/${employee.id}`}>View</Link></td>
            </tr>;
          })}
        </tbody></table></div>
      )}

      <div className="pagination"><span className="muted">Showing {result.count === 0 ? 0 : (result.page - 1) * result.pageSize + 1}–{Math.min(result.page * result.pageSize, result.count)} of {result.count}</span><div className="pagination-actions"><Link aria-disabled={result.page <= 1} className={`btn ${result.page <= 1 ? "disabled" : ""}`} href={result.page <= 1 ? "#" : buildPageHref(activeFilters, result.page - 1)}>Previous</Link><span>Page {result.page} of {result.totalPages}</span><Link aria-disabled={result.page >= result.totalPages} className={`btn ${result.page >= result.totalPages ? "disabled" : ""}`} href={result.page >= result.totalPages ? "#" : buildPageHref(activeFilters, result.page + 1)}>Next</Link></div></div>
    </div>
  </>;
}
