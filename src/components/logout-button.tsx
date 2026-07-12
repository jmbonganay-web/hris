import { LogOut } from "lucide-react";
import { logout } from "@/app/(dashboard)/actions";

export function LogoutButton() {
  return (
    <form action={logout}>
      <button className="icon-button" type="submit" aria-label="Sign out" title="Sign out">
        <LogOut size={18} />
      </button>
    </form>
  );
}
