import Link from "next/link";
import {
  Bell,
  CalendarClock,
  FileWarning,
  TimerReset,
  UserCheck,
  UserPlus,
  Users,
  UserX,
} from "lucide-react";
import { AttendanceClockCard } from "@/components/attendance/attendance-clock-card";
import { DashboardActionList } from "@/components/dashboard/dashboard-action-list";
import { DashboardBreakdownChart } from "@/components/dashboard/dashboard-breakdown-chart";
import { DashboardMetricGrid, type DashboardMetricItem } from "@/components/dashboard/dashboard-metric-grid";
import { DashboardPeriodFilter } from "@/components/dashboard/dashboard-period-filter";
import { DashboardRecentPeople } from "@/components/dashboard/dashboard-recent-people";
import { DashboardTrendChart } from "@/components/dashboard/dashboard-trend-chart";
import { DashboardUpcomingLeave } from "@/components/dashboard/dashboard-upcoming-leave";
import { EmployeeDashboardDetails } from "@/components/dashboard/employee-dashboard-details";
import { PageHeader } from "@/components/page-header";
import { requireAttendanceEmployee } from "@/features/attendance/auth";
import { getTodayAttendanceContext } from "@/features/attendance/queries";
import { companyDateAt } from "@/features/attendance/time";
import { getDashboardAnalytics } from "@/features/dashboard/queries";
import { resolveDashboardRange } from "@/features/dashboard/range";
import type { DashboardAnalytics } from "@/features/dashboard/types";

function scalar(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

function metricItems(analytics: DashboardAnalytics): DashboardMetricItem[] {
  if (analytics.kind === "hr") return [
    { label: "Active workforce", value: analytics.metrics.activeEmployees, detail: "Active, probation, and on leave", icon: Users },
    { label: "New hires", value: analytics.metrics.newHires, detail: analytics.range.label, icon: UserPlus },
    { label: "Pending leave", value: analytics.metrics.pendingLeave, icon: CalendarClock, tone: analytics.metrics.pendingLeave ? "warning" : "default" },
    { label: "Pending overtime", value: analytics.metrics.pendingOvertime, icon: TimerReset, tone: analytics.metrics.pendingOvertime ? "warning" : "default" },
    { label: "Document issues", value: analytics.metrics.documentIssues, icon: FileWarning, tone: analytics.metrics.documentIssues ? "danger" : "default" },
  ];
  if (analytics.kind === "manager") return [
    { label: "Direct reports", value: analytics.directReportCount, icon: Users },
    { label: "Present days", value: analytics.metrics.presentDays, detail: analytics.range.label, icon: UserCheck },
    { label: "Absent days", value: analytics.metrics.absentDays, icon: UserX, tone: analytics.metrics.absentDays ? "danger" : "default" },
    { label: "Pending team leave", value: analytics.metrics.pendingLeave, icon: CalendarClock, tone: analytics.metrics.pendingLeave ? "warning" : "default" },
    { label: "Document issues", value: analytics.metrics.documentIssues, icon: FileWarning, tone: analytics.metrics.documentIssues ? "danger" : "default" },
  ];
  return [
    { label: "Present days", value: analytics.metrics.presentDays, detail: analytics.range.label, icon: UserCheck },
    { label: "Late days", value: analytics.metrics.lateDays, icon: TimerReset, tone: analytics.metrics.lateDays ? "warning" : "default" },
    { label: "Pending leave", value: analytics.metrics.pendingLeave, icon: CalendarClock, tone: analytics.metrics.pendingLeave ? "warning" : "default" },
    { label: "Document issues", value: analytics.metrics.documentIssues, icon: FileWarning, tone: analytics.metrics.documentIssues ? "danger" : "default" },
    { label: "Unread notifications", value: analytics.metrics.unreadNotifications, icon: Bell },
  ];
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const range = resolveDashboardRange({
    preset: scalar(query.preset),
    start: scalar(query.start),
    end: scalar(query.end),
  }, companyDateAt());
  const analytics = await getDashboardAnalytics(range);
  const attendanceContext = analytics.kind === "hr" ? null : await (async () => {
    const { employee } = await requireAttendanceEmployee();
    return getTodayAttendanceContext(employee);
  })();

  const description = analytics.kind === "hr"
    ? "Live workforce, attendance, leave, overtime, and compliance analytics."
    : analytics.kind === "manager"
      ? "Your attendance plus aggregate operational status for current direct reports."
      : "Your attendance, leave, documents, schedule, and notifications in one place.";

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={description}
        action={analytics.kind === "hr" ? <Link className="btn primary" href="/employees/new">+ Add employee</Link> : undefined}
      />
      <DashboardPeriodFilter range={range} />
      <DashboardMetricGrid items={metricItems(analytics)} />

      {attendanceContext ? <section className="dashboard-my-attendance"><AttendanceClockCard context={attendanceContext} /></section> : null}

      {analytics.kind === "hr" ? (
        <>
          <section className="dashboard-analytics-grid">
            <DashboardTrendChart points={analytics.attendance.trend} />
            <DashboardBreakdownChart items={analytics.workforceStatus} title="Workforce status" description="Current non-archived employees grouped by employment status." />
          </section>
          <section className="dashboard-analytics-grid">
            <DashboardActionList items={analytics.actions} />
            <DashboardUpcomingLeave items={analytics.upcomingLeave} />
          </section>
          <DashboardRecentPeople items={analytics.recentHires} />
        </>
      ) : analytics.kind === "manager" ? (
        <>
          <section className="dashboard-analytics-grid">
            <DashboardTrendChart points={analytics.attendance.trend} title="Team attendance trend" description="Aggregate direct-report attendance only; private notes and record details remain restricted." />
            <DashboardBreakdownChart items={analytics.teamStatus} title="Team status" description="Current direct reports grouped by employment status." />
          </section>
          <section className="dashboard-analytics-grid">
            <DashboardActionList items={analytics.actions} />
            <DashboardUpcomingLeave items={analytics.upcomingLeave} title="Team approved leave" />
          </section>
        </>
      ) : (
        <>
          <section className="dashboard-analytics-grid">
            <DashboardTrendChart points={analytics.attendance.trend} title="My attendance trend" description="Your calculated attendance status across the selected period." />
            <EmployeeDashboardDetails balances={analytics.leaveBalances} schedule={analytics.schedule} />
          </section>
          <section className="dashboard-analytics-grid">
            <DashboardActionList items={analytics.actions} />
            <DashboardUpcomingLeave items={analytics.recentLeave} title="My leave requests" description="Your leave requests overlapping the selected period." />
          </section>
        </>
      )}
    </>
  );
}
