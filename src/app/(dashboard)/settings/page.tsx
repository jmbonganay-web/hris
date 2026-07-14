import Link from "next/link";
import { Building2, BriefcaseBusiness, CalendarRange, MapPin, ShieldCheck, UserRoundCog } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getCurrentRole } from "@/features/employees/auth";

const settings = [
  {
    href: "/settings/departments",
    title: "Departments",
    description: "Manage teams, department heads, employee counts, and availability.",
    icon: Building2,
    status: "Available",
    restricted: false,
  },
  {
    href: "/settings/job-titles",
    title: "Job titles",
    description: "Create department-scoped roles and control employee assignment options.",
    icon: BriefcaseBusiness,
    status: "Available",
    restricted: false,
  },
  {
    href: "/settings/work-schedules",
    title: "Work schedules",
    description: "Manage reusable schedules, versions, and employee assignments.",
    icon: CalendarRange,
    status: "Available",
    restricted: true,
  },
  {
    href: "#",
    title: "Work locations",
    description: "Configure offices, remote locations, and employee work sites.",
    icon: MapPin,
    status: "Planned",
    restricted: false,
  },
  {
    href: "#",
    title: "User roles and permissions",
    description: "Review Super Admin, HR Admin, and Employee access controls.",
    icon: UserRoundCog,
    status: "Planned",
    restricted: false,
  },
] as const;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [query, role] = await Promise.all([searchParams, getCurrentRole()]);
  const canManage = role === "hr_admin" || role === "super_admin";
  const visibleSettings = settings.filter((item) => !item.restricted || canManage);
  const unauthorized = query.error === "unauthorized";

  return <>
    <PageHeader title="Settings" description="Configure company structure, access, and HR preferences." />
    {unauthorized && <p className="form-error">You do not have permission to manage organization settings.</p>}

    <div className="settings-grid">
      {visibleSettings.map(({ href, title, description, icon: Icon, status }) => {
        const available = status === "Available";
        const content = <>
          <div className="settings-icon"><Icon size={20} /></div>
          <div className="settings-copy"><strong>{title}</strong><p>{description}</p></div>
          <span className={`badge ${available ? "success" : "info"}`}>{status}</span>
        </>;

        return available
          ? <Link className="card settings-card" href={href} key={title}>{content}</Link>
          : <div className="card settings-card settings-card-disabled" key={title} aria-disabled="true">{content}</div>;
      })}
    </div>

    <div className="card settings-status-card">
      <div className="settings-icon"><ShieldCheck size={20} /></div>
      <div><h2 className="card-title">Backend status</h2><p className="muted">Supabase authentication, employee management, departments, job titles, role checks, and soft-archive workflows are connected. Attendance and work schedules are connected. Leave, documents, and reports remain future phases.</p></div>
    </div>
  </>;
}
