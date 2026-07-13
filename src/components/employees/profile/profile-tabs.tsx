import Link from "next/link";

const tabs = [
  { id: "overview", label: "Overview", sensitive: false },
  { id: "personal", label: "Personal", sensitive: false },
  { id: "employment", label: "Employment", sensitive: false },
  { id: "emergency", label: "Emergency Contacts", sensitive: false },
  { id: "sensitive", label: "Government & Payroll", sensitive: true },
] as const;

export type ProfileTab = typeof tabs[number]["id"];

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
        .filter((tab) => !tab.sensitive || canManage)
        .map((tab) => (
          <Link
            key={tab.id}
            href={
              tab.sensitive
                ? `/employees/${employeeId}/sensitive`
                : `/employees/${employeeId}?tab=${tab.id}`
            }
            className={active === tab.id ? "active" : ""}
            aria-current={active === tab.id ? "page" : undefined}
          >
            {tab.label}
          </Link>
        ))}
    </nav>
  );
}
