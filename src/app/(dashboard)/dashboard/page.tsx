import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { attendance, employees, leaveRequests } from "@/data/mock";
import { Users, UserCheck, CalendarClock, ClipboardCheck } from "lucide-react";
import { initials } from "@/lib/utils";

export default function DashboardPage() {
  const stats = [
    ["Total employees", "128", Users], ["Present today", "109", UserCheck], ["Pending leave", "7", CalendarClock], ["Onboarding", "4", ClipboardCheck]
  ] as const;
  return <>
    <PageHeader title="Dashboard" description="Overview of your workforce and daily HR activity." action={<button className="btn primary">+ Add employee</button>} />
    <section className="grid stats">{stats.map(([label, value, Icon]) => <div className="card stat" key={label}><div><div className="stat-label">{label}</div><div className="stat-value">{value}</div></div><div className="stat-icon"><Icon size={21} /></div></div>)}</section>
    <section className="grid split">
      <div className="card"><h2 className="card-title">Today’s attendance</h2><div className="table-wrap"><table><thead><tr><th>Employee</th><th>Clock in</th><th>Status</th></tr></thead><tbody>{attendance.map(a => <tr key={a.name}><td><div className="person"><div className="avatar">{initials(a.name)}</div><strong>{a.name}</strong></div></td><td>{a.time}</td><td><StatusBadge value={a.status} /></td></tr>)}</tbody></table></div></div>
      <div className="card"><h2 className="card-title">Leave requests</h2><div className="list">{leaveRequests.map(r => <div className="list-item" key={r.id}><div><strong>{r.employee}</strong><div className="muted">{r.type} · {r.dates}</div></div><StatusBadge value={r.status} /></div>)}</div></div>
    </section>
    <section className="card" style={{marginTop: 18}}><h2 className="card-title">Recently added employees</h2><div className="table-wrap"><table><thead><tr><th>Employee</th><th>Department</th><th>Role</th><th>Status</th></tr></thead><tbody>{employees.slice(0,4).map(e => <tr key={e.id}><td><div className="person"><div className="avatar">{initials(e.name)}</div><div><strong>{e.name}</strong><div className="muted">{e.email}</div></div></div></td><td>{e.department}</td><td>{e.role}</td><td><StatusBadge value={e.status} /></td></tr>)}</tbody></table></div></section>
  </>;
}
