import { redirect } from "next/navigation";
import { getCurrentRole } from "@/features/employees/auth";

export default async function LeaveRedirectPage() {
  const role = await getCurrentRole();
  if (role === "hr_admin" || role === "super_admin") {
    redirect("/admin/leave");
  }
  redirect("/employee/leave");
}
