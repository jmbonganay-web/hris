import Link from "next/link";
import { resolveLeaveAttendanceConflict } from "@/app/(dashboard)/admin/leave/actions";
import { LeaveConflictTable } from "@/components/leave/leave-conflict-table";
import { PageHeader } from "@/components/page-header";
import { requireLeaveAdmin } from "@/features/leave/auth";
import { getLeaveAttendanceConflicts } from "@/features/leave/conflicts/queries";
import { leaveConflictTypes, type LeaveConflictType } from "@/features/leave/types";
import { getActiveEmployeeOptions } from "@/features/organization/queries";

function value(input: string | string[] | undefined) { return Array.isArray(input) ? input[0] : input ?? ""; }
export default async function LeaveConflictsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase } = await requireLeaveAdmin();
  const query = await searchParams;
  const statusText = value(query.status);
  const status = statusText === "resolved" || statusText === "superseded" ? statusText : "open";
  const typeText = value(query.type);
  const conflictType = leaveConflictTypes.includes(typeText as LeaveConflictType) ? typeText as LeaveConflictType : undefined;
  const employeeId = value(query.employee) || undefined;
  const page = Math.max(1, Number(value(query.page) || "1") || 1);
  const [result, employees] = await Promise.all([getLeaveAttendanceConflicts(supabase, { status, conflictType, employeeId, page, pageSize: 50 }), getActiveEmployeeOptions()]);
  return <><PageHeader title="Leave-Attendance Conflicts" description="Review attendance recorded during leave and recalculation exceptions." action={<Link className="btn" href="/admin/leave">Back to leave</Link>} /><section className="card"><form className="toolbar" method="get"><select className="field" name="status" defaultValue={status}><option value="open">Open</option><option value="resolved">Resolved</option><option value="superseded">Superseded</option></select><select className="field" name="type" defaultValue={conflictType ?? ""}><option value="">All conflict types</option>{leaveConflictTypes.map((item) => <option key={item} value={item}>{item}</option>)}</select><select className="field" name="employee" defaultValue={employeeId ?? ""}><option value="">All employees</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.last_name}, {employee.first_name}</option>)}</select><button className="btn" type="submit">Apply filters</button></form><LeaveConflictTable conflicts={result.rows} resolveAction={resolveLeaveAttendanceConflict} /></section></>;
}
