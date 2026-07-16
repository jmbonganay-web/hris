export const COMPANY_TIME_ZONE = "Asia/Manila";
export const EMPLOYEE_BACKDATE_DAYS = 30;
export const EMPLOYEE_FUTURE_DAYS = 365;
export const LEAVE_NOTE_MAX_LENGTH = 1000;
export const LEAVE_ATTACHMENT_MAX_COUNT = 5;
export const LEAVE_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const LEAVE_ATTACHMENT_BUCKET = "leave-documents";
export const LEAVE_ATTACHMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;
export const LEAVE_ATTACHMENT_EXTENSIONS = ["pdf", "jpg", "jpeg", "png"] as const;
