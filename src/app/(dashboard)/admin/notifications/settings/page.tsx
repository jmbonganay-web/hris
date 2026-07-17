import { PageHeader } from "@/components/page-header";
import { NotificationRuleList } from "@/components/notifications/notification-rule-list";
import { NotificationRunSummary } from "@/components/notifications/notification-run-summary";
import { NotificationSettingsActions } from "@/components/notifications/notification-settings-actions";
import { requireNotificationSettingsViewer } from "@/features/notifications/auth";
import { getNotificationCycleStatus } from "@/features/notifications/cycle/queries";
import { listNotificationRules } from "@/features/notifications/rules/queries";

export default async function NotificationSettingsPage() {
  const context = await requireNotificationSettingsViewer();
  const [rules, runs] = await Promise.all([
    listNotificationRules(),
    getNotificationCycleStatus(10),
  ]);

  return (
    <div className="notification-center-layout">
      <PageHeader
        title="Notification settings"
        description={
          context.canManage
            ? "Configure in-app reminder and escalation timing."
            : "View the active reminder rules and notification cycle status."
        }
      />

      {!context.canManage ? (
        <div className="card form-error">
          Super Admin access is required to change rules or run the cycle
          manually.
        </div>
      ) : (
        <NotificationSettingsActions />
      )}

      <section className="content-stack">
        <div className="section-heading">
          <div>
            <h2>Rules</h2>
            <p>
              Each notification type has independent timing and retention
              settings.
            </p>
          </div>
        </div>
        <NotificationRuleList rules={rules} readOnly={!context.canManage} />
      </section>

      <section className="content-stack">
        <div className="section-heading">
          <div>
            <h2>Cycle history</h2>
            <p>Daily processing runs at 8:00 AM Asia/Manila.</p>
          </div>
        </div>
        <NotificationRunSummary runs={runs} />
      </section>
    </div>
  );
}
