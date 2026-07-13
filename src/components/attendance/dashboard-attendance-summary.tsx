import Link from "next/link";
import { ClipboardCheck, ClockAlert, UserCheck } from "lucide-react";

export function DashboardAttendanceSummary({
  summary,
}: {
  summary: {
    companyDate: string;
    presentToday: number;
    missingClockOut: number;
    pendingCorrections: number;
  };
}) {
  const items = [
    {
      label: "Present today",
      value: summary.presentToday,
      href: `/admin/attendance?date=${summary.companyDate}`,
      icon: UserCheck,
    },
    {
      label: "Missing clock-out",
      value: summary.missingClockOut,
      href: "/admin/attendance?status=missing_clock_out&date=",
      icon: ClockAlert,
    },
    {
      label: "Pending corrections",
      value: summary.pendingCorrections,
      href: "/admin/attendance/corrections",
      icon: ClipboardCheck,
    },
  ] as const;

  return (
    <section className="card dashboard-attendance-summary">
      <div className="section-heading-row">
        <div>
          <h2 className="card-title">Attendance overview</h2>
          <p className="muted">Company date: {summary.companyDate} · Asia/Manila</p>
        </div>
        <Link className="btn" href="/admin/attendance">Manage attendance</Link>
      </div>
      <div className="grid stats">
        {items.map(({ label, value, href, icon: Icon }) => (
          <Link className="card stat" href={href} key={label}>
            <div>
              <div className="stat-label">{label}</div>
              <div className="stat-value">{value}</div>
            </div>
            <div className="stat-icon"><Icon size={21} /></div>
          </Link>
        ))}
      </div>
    </section>
  );
}
