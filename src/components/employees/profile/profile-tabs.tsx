import Link from "next/link";

const tabs = [
  { id: "overview", label: "Overview", restricted: false, route: false },
  { id: "personal", label: "Personal", restricted: false, route: false },
  { id: "employment", label: "Employment", restricted: false, route: false },
  { id: "emergency", label: "Emergency Contacts", restricted: false, route: false },
  { id: "sensitive", label: "Government & Payroll", restricted: true, route: true },
  { id: "hr_notes", label: "HR Notes", restricted: true, route: true },
  { id: "activity", label: "Activity", restricted: true, route: true },
] as const;

export type ProfileTab = typeof tabs[number]["id"];

function tabHref(employeeId: string, tab: typeof tabs[number]) {
  if (tab.id === "sensitive") return `/employees/${employeeId}/sensitive`;
  if (tab.id === "hr_notes") return `/employees/${employeeId}/hr-notes`;
  if (tab.id === "activity") return `/employees/${employeeId}/activity`;
  return `/employees/${employeeId}?tab=${tab.id}`;
}

export function ProfileTabs({
  employeeId,
  active,
  canManage = false,
}: {
  employeeId: string;
  active: ProfileTab;
  canManage?: boolean;
}) {
  return (
    <nav className="profile-tabs" aria-label="Employee profile sections">
      {tabs
        .filter((tab) => !tab.restricted || canManage)
        .map((tab) => (
          <Link
            key={tab.id}
            href={tabHref(employeeId, tab)}
            className={active === tab.id ? "active" : ""}
            aria-current={active === tab.id ? "page" : undefined}
          >
            {tab.label}
          </Link>
        ))}
    </nav>
  );
}
