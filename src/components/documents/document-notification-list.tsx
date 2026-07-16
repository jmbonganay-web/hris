import { markDocumentNotificationRead } from "@/app/(dashboard)/documents/actions";
export type DocumentNotification = { id: string; title: string; body: string; createdAt: string; isRead: boolean };
export function DocumentNotificationList({ notifications }: { notifications: DocumentNotification[] }) {
  return <section className="card"><div className="card-header-row"><div><h2>Notifications</h2><p>Document review and replacement updates.</p></div></div>
    {notifications.length === 0 ? <div className="empty-state"><strong>No document notifications</strong><span>New updates will appear here.</span></div> : <div className="document-version-list">{notifications.map((notification) => <article className={`notification-item${notification.isRead ? " read" : ""}`} key={notification.id}><strong>{notification.title}</strong><p>{notification.body}</p><span className="muted">{new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(notification.createdAt))}</span>{!notification.isRead && <form action={markDocumentNotificationRead.bind(null, notification.id)}><button className="text-link" type="submit">Mark as read</button></form>}</article>)}</div>}
  </section>;
}
