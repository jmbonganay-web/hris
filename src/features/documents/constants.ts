export const DOCUMENT_BUCKET = "employee-documents";
export const DOCUMENT_MAX_FILE_COUNT = 10;
export const DOCUMENT_MAX_FILE_BYTES = 15 * 1024 * 1024;
export const DOCUMENT_UPLOAD_SESSION_TTL_SECONDS = 10 * 60;
export const DOCUMENT_ACCESS_URL_TTL_SECONDS = 60;
export const DOCUMENT_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;
export const DOCUMENT_ALLOWED_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "docx"] as const;
export const DOCUMENT_PERMISSION_CODES = ["documents.review", "documents.manage"] as const;
export const DOCUMENT_INTERNAL_REASON_MAX_LENGTH = 1000;
export const DOCUMENT_EMPLOYEE_MESSAGE_MAX_LENGTH = 1000;
export const DOCUMENT_NOTES_MAX_LENGTH = 2000;
export const DOCUMENT_TITLE_MAX_LENGTH = 160;
export const DOCUMENT_REFERENCE_MAX_LENGTH = 160;
export const DOCUMENT_ISSUER_MAX_LENGTH = 200;
export const DOCUMENT_TAG_MAX_COUNT = 20;
export const DOCUMENT_TAG_MAX_LENGTH = 40;
