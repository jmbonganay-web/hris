import Link from "next/link";

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "personal", label: "Personal" },
  { id: "employment", label: "Employment" },
  { id: "emergency", label: "Emergency Contacts" },
] as const;

export type ProfileTab = typeof tabs[number]["id"];

export function ProfileTabs({ employeeId, active }: { employeeId: string; active: ProfileTab }) {
  return (
    <nav className="profile-tabs" aria-label="Employee profile sections">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={`/employees/${employeeId}?tab=${tab.id}`}
          className={active === tab.id ? "active" : ""}
          aria-current={active === tab.id ? "page" : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
