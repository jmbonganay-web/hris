import Link from "next/link";
import { CalendarClock, ClipboardCheck, Users } from "lucide-react";
import { AttendanceClockCard } from "@/components/attendance/attendance-clock-card";
import { DashboardAttendanceSummary } from "@/components/attendance/dashboard-attendance-summary";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { requireAttendanceEmployee } from "@/features/attendance/auth";
import {
  getAdminAttendanceSummary,
  getTodayAttendanceContext,
} from "@/features/attendance/queries";
import { getCurrentRole } from "@/features/employees/auth";
import { employees, leaveRequests } from "@/data/mock";
import { initials } from "@/lib/utils";

export default async function DashboardPage() {
  const role = await getCurrentRole();
  const isAdmin = role === "hr_admin" || role === "super_admin";
  const attendanceContent = isAdmin
    ? { summary: await getAdminAttendanceSummary(), context: null }
    : await (async () => {
        const { employee } = await requireAttendanceEmployee();
        return {
          summary: null,
          context: await getTodayAttendanceContext(employee),
        };
      })();

  const stats = isAdmin
    ? [
        ["Total employees", "128", Users],
        ["Pending leave", "7", CalendarClock],
        ["Onboarding", "4", ClipboardCheck],
      ] as const
    : [
        ["Pending leave", "7", CalendarClock],
        ["Onboarding", "4", ClipboardCheck],
      ] as const;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Overview of your workforce and daily HR activity."
        action={isAdmin ? <Link className="btn primary" href="/employees/new">+ Add employee</Link> : undefined}
      />

      <section className="grid stats">
        {stats.map(([label, value, Icon]) => (
          <div className="card stat" key={label}>
            <div><div className="stat-label">{label}</div><div className="stat-value">{value}</div></div>
            <div className="stat-icon"><Icon size={21} /></div>
          </div>
        ))}
      </section>

      {attendanceContent.summary ? (
        <DashboardAttendanceSummary summary={attendanceContent.summary} />
      ) : attendanceContent.context ? (
        <section className="dashboard-my-attendance">
          <AttendanceClockCard context={attendanceContent.context} />
        </section>
      ) : null}

      <section className="grid split">
        <div className="card">
          <h2 className="card-title">Leave requests</h2>
          <div className="list">
            {leaveRequests.map((request) => (
              <div className="list-item" key={request.id}>
                <div><strong>{request.employee}</strong><div className="muted">{request.type} · {request.dates}</div></div>
                <StatusBadge value={request.status} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card" style={{ marginTop: 18 }}>
        <h2 className="card-title">Recently added employees</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Employee</th><th>Department</th><th>Role</th><th>Status</th></tr></thead>
            <tbody>
              {employees.slice(0, 4).map((employee) => (
                <tr key={employee.id}>
                  <td><div className="person"><div className="avatar">{initials(employee.name)}</div><div><strong>{employee.name}</strong><div className="muted">{employee.email}</div></div></div></td>
                  <td>{employee.department}</td><td>{employee.role}</td><td><StatusBadge value={employee.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
