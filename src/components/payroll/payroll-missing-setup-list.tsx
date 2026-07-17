import Link from "next/link";
import type { EmployeeIdentity } from "@/features/payroll/types";

export function PayrollMissingSetupList({ employees }: { employees: EmployeeIdentity[] }) {
  return <section className="card content-stack"><div className="section-heading"><div><h2>Employees needing setup</h2><p>Complete current compensation and payroll schedule assignments before calculation work begins.</p></div></div>{employees.length === 0 ? <div className="empty">All active employees have payroll setup.</div> : <div className="payroll-missing-list">{employees.map((employee) => <Link key={employee.id} href={`/employees/${employee.id}/compensation`} className="payroll-missing-item"><span><strong>{employee.fullName}</strong><small>{employee.employeeNumber}</small></span><span className="btn">Review setup</span></Link>)}</div>}</section>;
}
