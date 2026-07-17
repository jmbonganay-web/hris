export const NOTIFICATION_PAGE_SIZE = 25;
export const NOTIFICATION_MAX_BULK_COUNT = 100;
export const NOTIFICATION_DEFAULT_RETENTION_DAYS = 90;
export const NOTIFICATION_MAX_RETENTION_DAYS = 3650;
export const NOTIFICATION_ACTION_URL_PREFIXES = [
  "/attendance",
  "/admin/attendance",
  "/leave",
  "/employee/leave",
  "/admin/leave",
  "/overtime",
  "/admin/overtime",
  "/documents",
  "/admin/documents/review",
  "/notifications",
  "/admin/notifications/settings",
] as const;
export const NOTIFICATION_TITLE_MAX_LENGTH = 160;
export const NOTIFICATION_BODY_MAX_LENGTH = 500;
export const NOTIFICATION_SEARCH_MAX_LENGTH = 120;
