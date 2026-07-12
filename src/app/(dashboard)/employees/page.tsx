import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { employees } from "@/data/mock";
import { initials } from "@/lib/utils";

export default function EmployeesPage() {
  return <><PageHeader title="Employees" description="Manage employee records, roles, departments, and status." action={<button className="btn primary">+ Add employee</button>} />
  <div className="card"><div className="toolbar"><input className="field" placeholder="Search employees" /><select className="field"><option>All departments</option><option>Design</option><option>Engineering</option><option>People</option></select><select className="field"><option>All statuses</option><option>Active</option><option>On Leave</option><option>Inactive</option></select></div>
  <div className="table-wrap"><table><thead><tr><th>Employee</th><th>ID</th><th>Role</th><th>Department</th><th>Type</th><th>Hire date</th><th>Status</th></tr></thead><tbody>{employees.map(e => <tr key={e.id}><td><div className="person"><div className="avatar">{initials(e.name)}</div><div><strong>{e.name}</strong><div className="muted">{e.email}</div></div></div></td><td>{e.employeeId}</td><td>{e.role}</td><td>{e.department}</td><td>{e.type}</td><td>{e.hireDate}</td><td><StatusBadge value={e.status} /></td></tr>)}</tbody></table></div></div></>;
}
