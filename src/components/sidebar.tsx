"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Clock3, CalendarDays, FileText, Megaphone, BarChart3, Settings, ShieldCheck } from "lucide-react";

const items = [
  ["/dashboard", "Dashboard", LayoutDashboard],
  ["/employees", "Employees", Users],
  ["/attendance", "Attendance", Clock3],
  ["/leave", "Leave", CalendarDays],
  ["/documents", "Documents", FileText],
  ["/announcements", "Announcements", Megaphone],
  ["/reports", "Reports", BarChart3],
  ["/settings", "Settings", Settings]
] as const;

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><ShieldCheck size={20} /></span><span>Northstar HR</span></div>
      <nav className="nav">
        {items.map(([href, label, Icon]) => (
          <Link key={href} href={href} className={pathname.startsWith(href) ? "active" : ""}>
            <Icon size={18} /> {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
