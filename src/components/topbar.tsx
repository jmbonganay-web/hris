import Link from "next/link";
import { Bell, Search } from "lucide-react";
import { LogoutButton } from "./logout-button";
import type { ShellUser } from "./app-shell";
import { initials } from "@/lib/utils";
import { unreadCountLabel } from "@/features/notifications/presentation";

function formatRole(role: string) {
  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function Topbar({ user }: { user: ShellUser }) {
  const unread = unreadCountLabel(user.unreadNotificationCount);
  return (
    <header className="topbar">
      <div className="search">
        <Search size={18} color="#6b7280" />
        <input
          aria-label="Search"
          placeholder="Search employees, reports, requests..."
        />
      </div>
      <div className="user-chip">
        <Link className="icon-button notification-bell" href="/notifications" aria-label={unread.accessible}>
          <Bell size={19} />
          {unread.visual ? <span className="topbar-notification-badge" aria-hidden="true">{unread.visual}</span> : null}
        </Link>
        <div className="avatar">{initials(user.name)}</div>
        <div className="user-meta">
          <strong>{user.name}</strong>
          <div className="muted">{formatRole(user.role)}</div>
        </div>
        <LogoutButton />
      </div>
    </header>
  );
}
