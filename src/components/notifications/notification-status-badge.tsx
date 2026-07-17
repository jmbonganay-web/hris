import { badgeClass } from "@/lib/utils";
import { notificationStatusLabel } from "@/features/notifications/presentation";
import type { NotificationStatus } from "@/features/notifications/types";
export function NotificationStatusBadge({ status }: { status: NotificationStatus }) {
  return <span className={`badge ${badgeClass(status)}`}>{notificationStatusLabel(status)}</span>;
}
