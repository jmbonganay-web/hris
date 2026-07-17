"use client";

import { useActionState, useState } from "react";
import { updateNotificationRule } from "@/app/(dashboard)/admin/notifications/settings/actions";
import { notificationRuleTypeLabel } from "@/features/notifications/presentation";
import type {
  NotificationActionState,
  NotificationRule,
} from "@/features/notifications/types";

const initialState: NotificationActionState = {};

async function updateRuleState(
  _state: NotificationActionState,
  formData: FormData,
) {
  return updateNotificationRule(formData);
}

export function NotificationRuleForm({
  rule,
  readOnly,
}: {
  rule: NotificationRule;
  readOnly: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    updateRuleState,
    initialState,
  );
  const [requestId] = useState(() => crypto.randomUUID());

  return (
    <form className="card notification-rule-form" action={formAction}>
      <div className="card-header-row">
        <div>
          <h2>{notificationRuleTypeLabel(rule.typeCode)}</h2>
          <p className="muted">
            Version {rule.version} · Updated{" "}
            {new Date(rule.updatedAt).toLocaleDateString("en-PH")}
          </p>
        </div>
        <label className="checkbox-row">
          <input
            name="enabled"
            type="checkbox"
            defaultChecked={rule.enabled}
            disabled={readOnly || pending}
          />
          Enabled
        </label>
      </div>

      <input type="hidden" name="typeCode" value={rule.typeCode} />
      <input type="hidden" name="expectedVersion" value={rule.version} />
      <input type="hidden" name="requestId" value={requestId} />

      <div className="form-grid">
        <label>
          Initial delay (days)
          <input
            className="field"
            name="initialDelayDays"
            type="number"
            min="0"
            defaultValue={rule.initialDelayDays ?? ""}
            disabled={readOnly || pending}
          />
        </label>
        <label>
          Repeat interval (days)
          <input
            className="field"
            name="repeatIntervalDays"
            type="number"
            min="1"
            defaultValue={rule.repeatIntervalDays}
            disabled={readOnly || pending}
          />
        </label>
        <label>
          Escalation after (days)
          <input
            className="field"
            name="escalationAfterDays"
            type="number"
            min="0"
            defaultValue={rule.escalationAfterDays ?? ""}
            disabled={readOnly || pending}
          />
        </label>
        <label>
          Lead time (days)
          <input
            className="field"
            name="leadTimeDays"
            type="number"
            min="0"
            defaultValue={rule.leadTimeDays ?? ""}
            disabled={readOnly || pending}
          />
        </label>
        <label>
          Retention (days)
          <input
            className="field"
            name="retentionDays"
            type="number"
            min="1"
            max="3650"
            defaultValue={rule.retentionDays}
            disabled={readOnly || pending}
          />
        </label>
      </div>

      {state.error ? (
        <div className="form-error" role="alert">
          {state.error}
        </div>
      ) : null}
      {state.success ? (
        <div className="form-success" role="status">
          {state.success}
        </div>
      ) : null}

      {readOnly ? (
        <p className="muted">Super Admin required to modify this rule.</p>
      ) : (
        <div className="form-actions">
          <button className="btn primary" type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save rule"}
          </button>
        </div>
      )}
    </form>
  );
}
