"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  Clock3,
  FileText,
  LayoutDashboard,
  Megaphone,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";

type NavigationItem = readonly [
  href: string,
  label: string,
  icon: typeof LayoutDashboard,
];

export function Sidebar({ role }: { role: string }) {
  const pathname = usePathname();
  const attendanceItems: readonly NavigationItem[] = role === "hr_admin" || role === "super_admin"
    ? [
        ["/attendance", "My Attendance", Clock3],
        ["/admin/attendance", "Attendance", Clock3],
        ["/admin/attendance/corrections", "Correction Requests", ClipboardCheck],
      ] as const
    : [["/attendance", "My Attendance", Clock3]] as const;
  const scheduleItems: readonly NavigationItem[] = role === "hr_admin" || role === "super_admin"
    ? [
        ["/my-schedule", "My Schedule", CalendarRange],
        ["/settings/work-schedules", "Work Schedules", CalendarRange],
      ] as const
    : [["/my-schedule", "My Schedule", CalendarRange]] as const;

  const items: readonly NavigationItem[] = [
    ["/dashboard", "Dashboard", LayoutDashboard],
    ["/employees", "Employees", Users],
    ...attendanceItems,
    ...scheduleItems,
    ["/leave", "Leave", CalendarDays],
    ["/documents", "Documents", FileText],
    ["/announcements", "Announcements", Megaphone],
    ["/reports", "Reports", BarChart3],
    ["/settings", "Settings", Settings],
  ];

  const activeHref = items
    .filter(([href]) => pathname === href || pathname.startsWith(`${href}/`))
    .sort(([left], [right]) => right.length - left.length)[0]?.[0];

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark"><ShieldCheck size={20} /></span>
        <span>Northstar HR</span>
      </div>
      <nav className="nav">
        {items.map(([href, label, Icon]) => (
          <Link key={href} href={href} className={activeHref === href ? "active" : ""}>
            <Icon size={18} /> {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
