import Link from "next/link";
import {
  Building2,
  BriefcaseBusiness,
  CalendarClock,
  CalendarHeart,
  CalendarRange,
  FileCheck2,
  Files,
  MapPin,
  ShieldCheck,
  TimerReset,
  UserRoundCog,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getDocumentPermissionContext } from "@/features/documents/auth";

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
    href: "/settings/attendance-policy",
    title: "Attendance policy",
    description: "Manage effective-dated grace periods and attendance calculation rules.",
    icon: CalendarClock,
    status: "Available",
    restricted: true,
  },
  {
    href: "/settings/overtime-policy",
    title: "Overtime policy",
    description: "Manage effective-dated minimum qualifying overtime minutes.",
    icon: TimerReset,
    status: "Available",
    restricted: true,
  },
  {
    href: "/settings/holidays",
    title: "Holiday calendar",
    description: "Create immutable regular, special non-working, and company holiday versions.",
    icon: CalendarHeart,
    status: "Available",
    restricted: true,
  },
  {
    href: "/settings/leave-types",
    title: "Leave types",
    description: "Configure effective-dated leave policies, balances, carryover, notes, and document rules.",
    icon: CalendarHeart,
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
  const [query, context] = await Promise.all([searchParams, getDocumentPermissionContext()]);
  const canManage = context.role === "hr_admin" || context.role === "super_admin";
  const canManageDocuments = context.role === "super_admin" || context.permissions.includes("documents.manage");
  const isSuperAdmin = context.role === "super_admin";
  const visibleSettings = [
    ...settings.filter((item) => !item.restricted || canManage),
    ...(canManageDocuments
      ? [
          {
            href: "/admin/documents/categories",
            title: "Document categories",
            description: "Configure versioned categories, visibility, file rules, expiration, and custom fields.",
            icon: Files,
            status: "Available" as const,
          },
          {
            href: "/admin/documents/requirements",
            title: "Document requirements",
            description: "Manage employee, job-title, department, employment-type, and organization-wide rules.",
            icon: FileCheck2,
            status: "Available" as const,
          },
        ]
      : []),
    ...(isSuperAdmin
      ? [
          {
            href: "/admin/documents/permissions",
            title: "Document permissions",
            description: "Grant or revoke independent document review and management permissions for HR Admins.",
            icon: ShieldCheck,
            status: "Available" as const,
          },
        ]
      : []),
  ];
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
      <div><h2 className="card-title">Backend status</h2><p className="muted">Supabase authentication, employee management, organization structure, work schedules, attendance calculations, holidays, overtime approvals, attendance reports, leave management, employee document management, and in-app document notifications are connected. Payroll and announcements remain future phases.</p></div>
    </div>
  </>;
}
