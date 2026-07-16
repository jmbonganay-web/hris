import Link from "next/link";
import { LeaveCalendar } from "@/components/leave/leave-calendar";
import { LeaveRequestTable } from "@/components/leave/leave-request-table";
import { PageHeader } from "@/components/page-header";
import { companyDateAt } from "@/features/attendance/time";
import { requireLeaveAdmin } from "@/features/leave/auth";
import { getLeaveAttendanceConflicts } from "@/features/leave/conflicts/queries";
import { getActiveLeaveTypeOptions } from "@/features/leave/policy/queries";
import { getAdminLeaveRequests } from "@/features/leave/requests/queries";
import { getActiveDepartmentOptions, getActiveEmployeeOptions } from "@/features/organization/queries";

function value(input: string | string[] | undefined) { return Array.isArray(input) ? input[0] : input ?? ""; }
function int(input: string, fallback: number, min: number, max: number) { const parsed = Number(input); return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback; }

export default async function AdminLeavePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase } = await requireLeaveAdmin();
  const query = await searchParams;
  const today = companyDateAt();
  const year = int(value(query.year), Number(today.slice(0, 4)), 2000, 2200);
  const month = int(value(query.month), Number(today.slice(5, 7)), 1, 12);
  const page = int(value(query.page), 1, 1, 100000);
  const employeeId = value(query.employee);
  const departmentId = value(query.department);
  const leaveTypeId = value(query.leave_type);
  const status = value(query.status);
  const paidState = value(query.paid);
  const conflictState = value(query.conflict);
  const startDate = value(query.start);
  const endDate = value(query.end);

  const conflictRequestGroupsPromise = conflictState
    ? supabase
        .from("leave_attendance_conflicts")
        .select("request_group_id")
        .eq("status", "open")
    : Promise.resolve({ data: [], error: null });

  const [requestPage, pendingPage, conflictResult, conflictRequestGroups, employees, departments, leaveTypes] = await Promise.all([
    getAdminLeaveRequests({ leaveYear: year, status: status || null, employeeId: employeeId || null, departmentId: departmentId || null, leaveTypeId: leaveTypeId || null, startDate: startDate || null, endDate: endDate || null, page, pageSize: 100 }),
    getAdminLeaveRequests({ leaveYear: year, status: "pending", page: 1, pageSize: 1 }),
    getLeaveAttendanceConflicts(supabase, { status: "open", page: 1, pageSize: 1 }),
    conflictRequestGroupsPromise,
    getActiveEmployeeOptions(),
    getActiveDepartmentOptions(),
    getActiveLeaveTypeOptions(today),
  ]);

  if (conflictRequestGroups.error) throw new Error("Unable to load request conflict state.");
  const conflictRequestGroupIds = new Set((conflictRequestGroups.data ?? []).map((row) => String(row.request_group_id)));
  const requests = requestPage.items.filter((request) => {
    const paidMatches = !paidState || (paidState === "paid" ? request.isPaid : !request.isPaid);
    const hasOpenConflict = conflictRequestGroupIds.has(request.requestGroupId);
    const conflictMatches = !conflictState
      || (conflictState === "open" ? hasOpenConflict : !hasOpenConflict);
    return paidMatches && conflictMatches;
  });

  return (
    <>
      <PageHeader title="Leave Administration" description="Review requests, manage balances, and resolve leave-attendance conflicts." action={<Link className="btn primary" href="/admin/leave/new">Create on behalf</Link>} />
      <section className="leave-admin-quick-links">
        <Link className="card" href="/admin/leave/conflicts"><strong>Conflicts</strong><span>{conflictResult.total} open</span></Link>
        <Link className="card" href="/admin/leave/balances"><strong>Balances</strong><span>Allocations and adjustments</span></Link>
        <Link className="card" href="/admin/leave/year-opening"><strong>Year opening</strong><span>Generate allocations and carryover</span></Link>
        <Link className="card" href="/settings/leave-types"><strong>Leave types</strong><span>Effective-dated policies</span></Link>
      </section>
      <section className="card">
        <div className="section-heading-row"><div><h2 className="card-title">Request queue</h2><p className="muted">{pendingPage.total} pending request{pendingPage.total === 1 ? "" : "s"} in {year}.</p></div></div>
        <form className="toolbar leave-admin-filters" method="get">
          <select className="field" name="employee" defaultValue={employeeId}><option value="">All employees</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.last_name}, {employee.first_name}</option>)}</select>
          <select className="field" name="department" defaultValue={departmentId}><option value="">All departments</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select>
          <select className="field" name="leave_type" defaultValue={leaveTypeId}><option value="">All leave types</option>{leaveTypes.map((leaveType) => <option key={leaveType.leaveTypeId} value={leaveType.leaveTypeId}>{leaveType.name}</option>)}</select>
          <select className="field" name="status" defaultValue={status}><option value="">All statuses</option>{["draft","pending","approved","rejected","withdrawn","cancelled","superseded"].map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <select className="field" name="paid" defaultValue={paidState}><option value="">Paid and unpaid</option><option value="paid">Paid</option><option value="unpaid">Unpaid</option></select>
          <select className="field" name="conflict" defaultValue={conflictState}><option value="">Any conflict state</option><option value="open">Open conflict</option><option value="none">No open conflict</option></select>
          <input className="field" type="date" name="start" defaultValue={startDate} aria-label="Start date" />
          <input className="field" type="date" name="end" defaultValue={endDate} aria-label="End date" />
          <input className="field" type="number" name="year" min="2000" max="2200" defaultValue={year} aria-label="Leave year" />
          <input type="hidden" name="month" value={month} />
          <button className="btn" type="submit">Apply filters</button>
          <Link className="btn" href="/admin/leave">Clear</Link>
        </form>
        <LeaveRequestTable requests={requests} baseHref="/admin/leave" />
      </section>
      <LeaveCalendar year={year} month={month} requests={requests} baseHref="/admin/leave" />
    </>
  );
}
