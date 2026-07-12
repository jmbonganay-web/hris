import { Bell, Search } from "lucide-react";
import { LogoutButton } from "./logout-button";
import type { ShellUser } from "./app-shell";
import { initials } from "@/lib/utils";

function formatRole(role: string) {
  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function Topbar({ user }: { user: ShellUser }) {
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
        <button className="icon-button" type="button" aria-label="Notifications">
          <Bell size={19} />
        </button>
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
