import type { NotificationListItem } from "@/features/notifications/types";
import { NotificationStatusBadge } from "./notification-status-badge";
import { NotificationPriorityBadge } from "./notification-priority-badge";
export function NotificationCard({item}:{item:NotificationListItem}){return <article className="card notification-card"><div className="notification-badges"><NotificationPriorityBadge priority={item.priority}/><NotificationStatusBadge status={item.status}/></div><h3>{item.title}</h3><p>{item.body}</p></article>}
