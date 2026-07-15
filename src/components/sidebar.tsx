"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  CalendarHeart,
  CalendarRange,
  ClipboardCheck,
  Clock3,
  FileText,
  LayoutDashboard,
  Megaphone,
  Settings,
  ShieldCheck,
  TimerReset,
  Users,
} from "lucide-react";

type NavigationItem = readonly [
  href: string,
  label: string,
  icon: typeof LayoutDashboard,
];

export function Sidebar({ role }: { role: string }) {
  const pathname = usePathname();
  const isHr = role === "hr_admin" || role === "super_admin";
  const attendanceItems: readonly NavigationItem[] =
    isHr
      ? [
          ["/attendance", "My Attendance", Clock3],
          ["/overtime", "My Overtime", TimerReset],
          ["/admin/attendance", "Attendance", Clock3],
          ["/admin/attendance/corrections", "Correction Requests", ClipboardCheck],
          ["/admin/attendance/recalculate", "Recalculate Attendance", CalendarRange],
          ["/admin/attendance/finalization", "Finalization Runs", CalendarDays],
          ["/admin/overtime", "Overtime Approvals", TimerReset],
          ["/admin/overtime/recalculate", "Recalculate Overtime", CalendarRange],
          ["/settings/attendance-policy", "Attendance Policy", Settings],
          ["/settings/overtime-policy", "Overtime Policy", TimerReset],
          ["/settings/holidays", "Holidays", CalendarHeart],
        ] as const
      : [
          ["/attendance", "My Attendance", Clock3],
          ["/overtime", "My Overtime", TimerReset],
        ] as const;
  const scheduleItems: readonly NavigationItem[] = isHr
    ? [
        ["/my-schedule", "My Schedule", CalendarRange],
        ["/settings/work-schedules", "Work Schedules", CalendarRange],
      ] as const
    : [["/my-schedule", "My Schedule", CalendarRange]] as const;
  const hrOnlyItems: readonly NavigationItem[] = isHr
    ? [["/reports", "Reports", BarChart3]] as const
    : [];

  const items: readonly NavigationItem[] = [
    ["/dashboard", "Dashboard", LayoutDashboard],
    ["/employees", "Employees", Users],
    ...attendanceItems,
    ...scheduleItems,
    ...hrOnlyItems,
    ["/leave", "Leave", CalendarDays],
    ["/documents", "Documents", FileText],
    ["/announcements", "Announcements", Megaphone],
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
