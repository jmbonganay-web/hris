import Link from "next/link";
import { createLeaveBalanceAdjustment } from "@/app/(dashboard)/admin/leave/actions";
import { upsertEmployeeLeaveYearSetting } from "@/app/(dashboard)/settings/leave-types/actions";
import { EmployeeLeaveSettingForm } from "@/components/leave/employee-leave-setting-form";
import { LeaveBalanceAdjustmentForm } from "@/components/leave/leave-balance-adjustment-form";
import { PageHeader } from "@/components/page-header";
import { companyDateAt } from "@/features/attendance/time";
import { requireLeaveAdmin } from "@/features/leave/auth";
import { getAdminLeaveBalances } from "@/features/leave/balances/queries";
import { formatLeaveUnits } from "@/features/leave/presentation";
import { getActiveLeaveTypeOptions } from "@/features/leave/policy/queries";
import { getActiveEmployeeOptions } from "@/features/organization/queries";

function value(input: string | string[] | undefined) { return Array.isArray(input) ? input[0] : input ?? ""; }
export default async function LeaveBalancesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireLeaveAdmin();
  const query = await searchParams;
  const today = companyDateAt();
  const currentYear = Number(today.slice(0, 4));
  const yearValue = Number(value(query.year) || currentYear);
  const leaveYear = Number.isInteger(yearValue) && yearValue >= 2000 && yearValue <= 2200 ? yearValue : currentYear;
  const employeeId = value(query.employee);
  const leaveTypeId = value(query.leave_type);
  const [balances, employees, leaveTypes] = await Promise.all([
    getAdminLeaveBalances({ leaveYear, employeeId: employeeId || null, leaveTypeId: leaveTypeId || null }),
    getActiveEmployeeOptions(),
    getActiveLeaveTypeOptions(today),
  ]);
  return (
    <>
      <PageHeader title="Employee Leave Balances" description="Review allocation, carryover, adjustments, usage, reservations, and remaining units." action={<Link className="btn" href="/admin/leave">Back to leave</Link>} />
      <section className="card">
        <form className="toolbar" method="get"><select className="field" name="employee" defaultValue={employeeId}><option value="">All employees</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.last_name}, {employee.first_name}</option>)}</select><select className="field" name="leave_type" defaultValue={leaveTypeId}><option value="">All leave types</option>{leaveTypes.map((item) => <option key={item.leaveTypeId} value={item.leaveTypeId}>{item.name}</option>)}</select><input className="field" type="number" name="year" min="2000" max="2200" defaultValue={leaveYear} /><button className="btn" type="submit">Apply filters</button></form>
        <div className="table-wrap"><table><thead><tr><th>Employee</th><th>Leave type</th><th>Allocated</th><th>Carryover</th><th>Adjustments</th><th>Used</th><th>Pending</th><th>Available</th><th>Expiring</th></tr></thead><tbody>{balances.map((balance) => { const employee = employees.find((item) => item.id === balance.employeeId); return <tr key={`${balance.employeeId}-${balance.leaveTypeId}`}><td>{employee ? `${employee.last_name}, ${employee.first_name}` : balance.employeeId}</td><td>{balance.leaveTypeName}</td><td>{formatLeaveUnits(balance.allocatedUnits)}</td><td>{formatLeaveUnits(balance.carryoverUnits)}</td><td>{formatLeaveUnits(balance.adjustmentUnits)}</td><td>{formatLeaveUnits(balance.usedUnits)}</td><td>{formatLeaveUnits(balance.pendingUnits)}</td><td>{balance.availableUnits === null ? "Exempt" : formatLeaveUnits(balance.availableUnits)}</td><td>{formatLeaveUnits(balance.expiringUnits)}{balance.expiresOn ? ` · ${balance.expiresOn}` : ""}</td></tr>; })}</tbody></table></div>
      </section>
      <div className="leave-admin-form-grid"><LeaveBalanceAdjustmentForm employees={employees} leaveTypes={leaveTypes} balances={balances} defaultYear={leaveYear} action={createLeaveBalanceAdjustment} /><EmployeeLeaveSettingForm employees={employees} leaveTypes={leaveTypes} defaultYear={leaveYear} action={upsertEmployeeLeaveYearSetting} /></div>
    </>
  );
}
