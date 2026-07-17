"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  bulkDismissNotifications,
  bulkMarkNotificationsRead,
  dismissNotification,
  markNotificationRead,
  markNotificationUnread,
} from "@/app/(dashboard)/notifications/actions";
import { notificationModuleLabel } from "@/features/notifications/presentation";
import type {
  NotificationActionState,
  NotificationListItem,
} from "@/features/notifications/types";
import { NotificationPriorityBadge } from "./notification-priority-badge";
import { NotificationStatusBadge } from "./notification-status-badge";

function when(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en-PH", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Manila",
      }).format(new Date(value))
    : "—";
}

export function NotificationList({ items }: { items: NotificationListItem[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const visibleIds = useMemo(() => items.map((item) => item.id), [items]);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id].slice(0, 100),
    );
  }

  function run(action: () => Promise<NotificationActionState>) {
    startTransition(async () => {
      setActionError(null);
      const result = await action();
      if (result.error) {
        setActionError(result.error);
        return;
      }
      setSelected([]);
      router.refresh();
    });
  }

  if (!items.length) {
    return (
      <div className="card empty-state">
        <strong>No notifications found</strong>
        <span>Try changing the filters or check again later.</span>
      </div>
    );
  }

  return (
    <section className="notification-list" aria-label="Notifications">
      <div className="card notification-bulk-actions">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={() =>
              setSelected(allVisibleSelected ? [] : visibleIds.slice(0, 100))
            }
          />
          Select visible
        </label>
        <span className="muted" aria-live="polite">
          {selected.length} selected
        </span>
        <button
          className="btn"
          type="button"
          disabled={pending || !selected.length}
          onClick={() =>
            run(async () => {
              const formData = new FormData();
              selected.forEach((id) => formData.append("notificationIds", id));
              return bulkMarkNotificationsRead(formData);
            })
          }
        >
          Mark read
        </button>
        <button
          className="btn danger-outline"
          type="button"
          disabled={pending || !selected.length}
          onClick={() =>
            run(async () => {
              const formData = new FormData();
              selected.forEach((id) => formData.append("notificationIds", id));
              return bulkDismissNotifications(formData);
            })
          }
        >
          Dismiss
        </button>
      </div>

      {actionError ? (
        <div className="form-error" role="alert">
          {actionError}
        </div>
      ) : null}

      {items.map((item) => {
        const mutable = !["resolved", "archived"].includes(item.status);
        return (
          <article className="card notification-card" key={item.id}>
            <div className="card-header-row">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={selected.includes(item.id)}
                  onChange={() => toggle(item.id)}
                />
                <span className="sr-only">Select {item.title}</span>
              </label>
              <div className="notification-badges">
                <span className="badge info">
                  {notificationModuleLabel(item.module)}
                </span>
                <NotificationPriorityBadge priority={item.priority} />
                <NotificationStatusBadge status={item.status} />
              </div>
            </div>

            <div>
              <h2>{item.title}</h2>
              <p>{item.body}</p>
            </div>

            <div className="notification-meta">
              <span>Created {when(item.createdAt)}</span>
              {item.reminderCount > 0 ? (
                <span>
                  Reminded {item.reminderCount} time
                  {item.reminderCount === 1 ? "" : "s"} · Last{" "}
                  {when(item.lastRemindedAt)}
                </span>
              ) : null}
            </div>

            <div className="form-actions">
              {item.actionUrl ? (
                <Link className="btn primary" href={item.actionUrl}>
                  Open
                </Link>
              ) : null}
              {mutable ? (
                <>
                  {item.status === "unread" ? (
                    <button
                      className="btn"
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => markNotificationRead(item.id))}
                    >
                      Mark read
                    </button>
                  ) : (
                    <button
                      className="btn"
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => markNotificationUnread(item.id))}
                    >
                      Mark unread
                    </button>
                  )}
                  <button
                    className="btn danger-outline"
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => dismissNotification(item.id))}
                  >
                    Dismiss
                  </button>
                </>
              ) : null}
            </div>
          </article>
        );
      })}
    </section>
  );
}
