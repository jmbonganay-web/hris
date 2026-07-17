"use client";

import { useActionState } from "react";
import {
  resetNotificationRules,
  runNotificationCycleNow,
} from "@/app/(dashboard)/admin/notifications/settings/actions";
import type { NotificationActionState } from "@/features/notifications/types";

const initialState: NotificationActionState = {};

async function resetRulesState(
  _state: NotificationActionState,
  formData: FormData,
) {
  return resetNotificationRules(formData);
}

async function runCycleState(
  _state: NotificationActionState,
  formData: FormData,
) {
  return runNotificationCycleNow(formData);
}

export function NotificationSettingsActions() {
  const [resetState, resetAction, resetPending] = useActionState(
    resetRulesState,
    initialState,
  );
  const [cycleState, cycleAction, cyclePending] = useActionState(
    runCycleState,
    initialState,
  );

  return (
    <div className="card notification-settings-actions">
      <form className="notification-confirm-form" action={resetAction}>
        <label className="checkbox-row">
          <input
            type="checkbox"
            name="confirm"
            value="yes"
            required
            disabled={resetPending}
          />
          Confirm reset to approved defaults
        </label>
        {resetState.error ? (
          <div className="form-error" role="alert">
            {resetState.error}
          </div>
        ) : null}
        {resetState.success ? (
          <div className="form-success" role="status">
            {resetState.success}
          </div>
        ) : null}
        <button
          className="btn danger-outline"
          type="submit"
          disabled={resetPending}
        >
          {resetPending ? "Resetting…" : "Reset approved defaults"}
        </button>
      </form>

      <form className="notification-confirm-form" action={cycleAction}>
        <label className="checkbox-row">
          <input
            type="checkbox"
            name="confirm"
            value="yes"
            required
            disabled={cyclePending}
          />
          Confirm manual notification cycle
        </label>
        {cycleState.error ? (
          <div className="form-error" role="alert">
            {cycleState.error}
          </div>
        ) : null}
        {cycleState.success ? (
          <div className="form-success" role="status">
            {cycleState.success}
          </div>
        ) : null}
        <button className="btn primary" type="submit" disabled={cyclePending}>
          {cyclePending ? "Running…" : "Run cycle now"}
        </button>
      </form>
    </div>
  );
}
