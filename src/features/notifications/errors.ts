const safeNotificationErrors: ReadonlyArray<readonly [string, string]> = [
  ["NOTIFICATION_PERMISSION_DENIED", "You do not have permission to perform this notification action."],
  ["NOTIFICATION_NOT_FOUND", "The requested notification could not be found."],
  ["NOTIFICATION_INVALID_STATUS", "This notification action is not allowed for the current status."],
  ["NOTIFICATION_INVALID_RULE", "Review the notification rule settings and try again."],
  ["NOTIFICATION_INVALID_ACTION_URL", "The notification link is not allowed."],
  ["NOTIFICATION_INVALID_PAYLOAD", "The notification content is not allowed."],
  ["NOTIFICATION_BULK_SELECTION_INVALID", "Review the selected notifications and try again."],
  ["NOTIFICATION_CYCLE_ALREADY_RUNNING", "The notification cycle is already running."],
  ["NOTIFICATION_CYCLE_FAILED", "The notification cycle could not be completed."],
  ["NOTIFICATION_RULE_PROCESSING_FAILED", "One or more notification rules could not be processed."],
];

export function mapNotificationError(message: string, fallback = "The notification action could not be completed.") {
  return safeNotificationErrors.find(([code]) => message.includes(code))?.[1] ?? fallback;
}
