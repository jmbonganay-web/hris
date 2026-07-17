import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export type ShellUser = {
  name: string;
  email: string;
  role: string;
  documentPermissions: Array<"documents.review" | "documents.manage">;
  unreadNotificationCount: number;
};

export function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: ShellUser;
}) {
  return (
    <div className="app-shell">
      <Sidebar role={user.role} documentPermissions={user.documentPermissions} unreadNotificationCount={user.unreadNotificationCount} />
      <main className="main">
        <Topbar user={user} />
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
