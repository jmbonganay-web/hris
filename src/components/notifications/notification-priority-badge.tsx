import { badgeClass } from "@/lib/utils";
import { notificationPriorityLabel } from "@/features/notifications/presentation";
import type { NotificationPriority } from "@/features/notifications/types";
export function NotificationPriorityBadge({ priority }: { priority: NotificationPriority }) {
  return <span className={`badge ${badgeClass(priority)}`}>{notificationPriorityLabel(priority)}</span>;
}
