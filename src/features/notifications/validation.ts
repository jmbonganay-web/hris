import {
  NOTIFICATION_ACTION_URL_PREFIXES,
  NOTIFICATION_MAX_BULK_COUNT,
  NOTIFICATION_MAX_RETENTION_DAYS,
  NOTIFICATION_SEARCH_MAX_LENGTH,
} from "./constants.ts";
import {
  notificationModuleValues,
  notificationPriorityValues,
  notificationRuleTypeValues,
  notificationStatusValues,
  type NotificationCenterFilters,
  type NotificationRuleInput,
} from "./types.ts";

type ValidationResult<T> = { data?: T; error?: string };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function scalar(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export function parseNotificationFilters(input: Record<string, string | string[] | undefined>): NotificationCenterFilters {
  const moduleValue = scalar(input.module);
  const statusValue = scalar(input.status);
  const priorityValue = scalar(input.priority);
  const rawPage = Number(scalar(input.page) ?? "1");
  const query = (scalar(input.query) ?? "").trim().slice(0, NOTIFICATION_SEARCH_MAX_LENGTH);
  const from = scalar(input.from);
  const to = scalar(input.to);
  const result: NotificationCenterFilters = {
    page: Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1,
  };
  if (moduleValue && notificationModuleValues.includes(moduleValue as (typeof notificationModuleValues)[number])) result.module = moduleValue as NotificationCenterFilters["module"];
  if (statusValue === "active" || notificationStatusValues.includes(statusValue as (typeof notificationStatusValues)[number])) result.status = statusValue as NotificationCenterFilters["status"];
  if (priorityValue && notificationPriorityValues.includes(priorityValue as (typeof notificationPriorityValues)[number])) result.priority = priorityValue as NotificationCenterFilters["priority"];
  if (query) result.query = query;
  if (from && datePattern.test(from)) result.from = from;
  if (to && datePattern.test(to)) result.to = to;
  if (result.from && result.to && result.from > result.to) delete result.to;
  return result;
}

export function validateNotificationActionUrl(value: string | null): ValidationResult<string | null> {
  if (value === null || value === "") return { data: null };
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) {
    return { error: "Notification links must use an approved application route." };
  }
  const allowed = NOTIFICATION_ACTION_URL_PREFIXES.some((prefix) => value === prefix || value.startsWith(`${prefix}/`) || value.startsWith(`${prefix}?`));
  return allowed ? { data: value } : { error: "Notification links must use an approved application route." };
}

function isNonnegativeInteger(value: number | null) {
  return value === null || (Number.isInteger(value) && value >= 0);
}

export function validateNotificationRuleInput(input: NotificationRuleInput): ValidationResult<NotificationRuleInput> {
  if (!notificationRuleTypeValues.includes(input.typeCode)) return { error: "The notification rule type is invalid." };
  if (!input.requestId || !uuidPattern.test(input.requestId)) return { error: "A valid notification request ID is required." };
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) return { error: "The notification rule version is invalid." };
  if (!Number.isInteger(input.repeatIntervalDays) || input.repeatIntervalDays < 1) return { error: "Repeat interval must be at least one day." };
  if (!Number.isInteger(input.retentionDays) || input.retentionDays < 1 || input.retentionDays > NOTIFICATION_MAX_RETENTION_DAYS) return { error: "Retention must be between 1 and 3650 days." };
  if (![input.initialDelayDays, input.escalationAfterDays, input.leadTimeDays].every(isNonnegativeInteger)) return { error: "Notification timing values must be nonnegative whole numbers." };
  if (["attendance_exception", "leave_approval_pending", "overtime_approval_pending", "document_review_pending"].includes(input.typeCode)) {
    if (input.initialDelayDays === null) return { error: "This notification rule requires an initial-delay value." };
    if (input.escalationAfterDays === null) return { error: "This notification rule requires an escalation threshold." };
  }
  if (input.typeCode === "document_expiring") {
    if (input.leadTimeDays === null) return { error: "Expiring-document rules require a lead-time value." };
    if (input.escalationAfterDays === null) return { error: "Expiring-document rules require an escalation threshold." };
  }
  if (input.typeCode === "document_expired" && input.escalationAfterDays === null) return { error: "Expired-document rules require an escalation threshold." };
  return { data: input };
}

export function validateBulkNotificationIds(ids: string[]): ValidationResult<string[]> {
  if (ids.length < 1) return { error: "Select at least one notification." };
  if (ids.length > NOTIFICATION_MAX_BULK_COUNT) return { error: "Select no more than 100 notifications at a time." };
  if (new Set(ids).size !== ids.length) return { error: "Each selected notification must be unique." };
  if (ids.some((id) => !uuidPattern.test(id))) return { error: "One or more selected notifications are invalid." };
  return { data: ids };
}
