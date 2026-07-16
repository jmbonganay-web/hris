import test from "node:test";
import assert from "node:assert/strict";
import { access as fileAccess, readFile } from "node:fs/promises";

const page = await readFile(new URL("../../app/(dashboard)/documents/page.tsx", import.meta.url), "utf8");
const detail = await readFile(new URL("../../app/(dashboard)/documents/[documentId]/page.tsx", import.meta.url), "utf8");
const upload = await readFile(new URL("../../components/documents/document-upload-form.tsx", import.meta.url), "utf8");
const access = await readFile(new URL("../../components/documents/document-access-button.tsx", import.meta.url), "utf8");

test("employee document portal uses live compliance, document, category, and notification queries", () => {
  for (const symbol of ["getOwnDocumentCompliance", "listOwnDocuments", "listCurrentDocumentCategories", "listDocumentNotifications"]) assert.match(page, new RegExp(symbol));
  assert.match(page, /DocumentSummaryCards/);
  assert.match(page, /DocumentRequirementList/);
  assert.match(page, /DocumentUploadForm/);
  assert.match(page, /DocumentNotificationList/);
});

test("employee document detail uses safe detail and version history", () => {
  assert.match(detail, /getOwnDocumentDetail/);
  assert.match(detail, /DocumentDetailPanel/);
  assert.match(detail, /DocumentVersionHistory/);
  assert.match(detail, /replacement_requested/);
});

test("upload form prepares, uploads, finalizes, and displays progress", () => {
  assert.match(upload, /\/api\/documents\/uploads\/prepare/);
  assert.match(upload, /uploadDocumentBatch/);
  assert.match(upload, /DocumentUploadProgress/);
  assert.match(upload, /accept=/);
});

test("file access is issued on demand without storing signed URLs", () => {
  assert.match(access, /\/api\/documents\/versions\/\$\{versionId\}\/access/);
  assert.match(access, /window\.open/);
  assert.doesNotMatch(page, /signedUrl|storagePath/);
  assert.doesNotMatch(detail, /internalReason|storagePath/);
});

const adminDashboard = await readFile(new URL("../../app/(dashboard)/admin/documents/page.tsx", import.meta.url), "utf8");
const reviewPage = await readFile(new URL("../../app/(dashboard)/admin/documents/review/page.tsx", import.meta.url), "utf8");
const reviewDetail = await readFile(new URL("../../app/(dashboard)/admin/documents/review/[documentId]/page.tsx", import.meta.url), "utf8");
const employeeAdmin = await readFile(new URL("../../app/(dashboard)/admin/documents/employees/[employeeId]/page.tsx", import.meta.url), "utf8");

test("HR dashboard is live and permission-aware", () => {
  assert.match(adminDashboard, /requireDocumentAdminAccess/);
  assert.match(adminDashboard, /pendingReviewCount/);
  assert.match(adminDashboard, /missingDocumentCount/);
  assert.match(adminDashboard, /expiringSoonCount/);
  assert.match(adminDashboard, /recent/);
});

test("review routes require reviewer permission and expose review actions", () => {
  assert.match(reviewPage, /requireDocumentReviewer/);
  assert.match(reviewPage, /listDocumentReviewQueue/);
  assert.match(reviewDetail, /getDocumentReviewDetail/);
  assert.match(reviewDetail, /DocumentReviewForm/);
  assert.match(reviewDetail, /DocumentAccessButton/);
});

test("employee administration supports HR uploads and lifecycle controls", () => {
  assert.match(employeeAdmin, /listEmployeeDocumentsForHr/);
  assert.match(employeeAdmin, /getEmployeeDocumentCompliance/);
  assert.match(employeeAdmin, /DocumentUploadForm/);
  assert.match(employeeAdmin, /DocumentRestoreVersionForm/);
  assert.match(employeeAdmin, /DocumentArchiveForm/);
  assert.match(employeeAdmin, /DocumentDeleteForm/);
});

const categoriesPage = await readFile(new URL("../../app/(dashboard)/admin/documents/categories/page.tsx", import.meta.url), "utf8");
const categoryDetail = await readFile(new URL("../../app/(dashboard)/admin/documents/categories/[categoryId]/page.tsx", import.meta.url), "utf8");
const requirementsPage = await readFile(new URL("../../app/(dashboard)/admin/documents/requirements/page.tsx", import.meta.url), "utf8");
const permissionsPage = await readFile(new URL("../../app/(dashboard)/admin/documents/permissions/page.tsx", import.meta.url), "utf8");

test("configuration routes use independent authorization", () => {
  assert.match(categoriesPage, /requireDocumentManager/);
  assert.match(categoryDetail, /requireDocumentManager/);
  assert.match(requirementsPage, /requireDocumentManager/);
  assert.match(permissionsPage, /requireSuperAdmin/);
});

test("category detail preserves version history", () => {
  assert.match(categoryDetail, /getDocumentCategoryDetail/);
  assert.match(categoryDetail, /DocumentCategoryVersionList/);
  assert.match(categoryDetail, /createDocumentCategoryVersion/);
});

test("requirements and permission pages use protected actions", () => {
  assert.match(requirementsPage, /DocumentRequirementForm/);
  assert.match(permissionsPage, /DocumentPermissionForm/);
});

const sidebar = await readFile(new URL("../../components/sidebar.tsx", import.meta.url), "utf8");
const profileTabs = await readFile(new URL("../../components/employees/profile/profile-tabs.tsx", import.meta.url), "utf8");
const settings = await readFile(new URL("../../app/(dashboard)/settings/page.tsx", import.meta.url), "utf8");

test("navigation exposes employee and permission-aware admin document routes", () => {
  assert.match(sidebar, /"\/documents", "Documents"/);
  assert.match(sidebar, /"\/admin\/documents", "Document Administration"/);
  assert.match(sidebar, /documentPermissions/);
  assert.match(profileTabs, /documents/);
});

test("settings links document configuration without merging permissions", () => {
  assert.match(settings, /\/admin\/documents\/categories/);
  assert.match(settings, /\/admin\/documents\/requirements/);
  assert.match(settings, /\/admin\/documents\/permissions/);
});


const approvedDocumentRouteFiles = [
  "../../app/(dashboard)/documents/page.tsx",
  "../../app/(dashboard)/documents/[documentId]/page.tsx",
  "../../app/(dashboard)/admin/documents/page.tsx",
  "../../app/(dashboard)/admin/documents/review/page.tsx",
  "../../app/(dashboard)/admin/documents/review/[documentId]/page.tsx",
  "../../app/(dashboard)/admin/documents/employees/[employeeId]/page.tsx",
  "../../app/(dashboard)/admin/documents/categories/page.tsx",
  "../../app/(dashboard)/admin/documents/categories/[categoryId]/page.tsx",
  "../../app/(dashboard)/admin/documents/requirements/page.tsx",
  "../../app/(dashboard)/admin/documents/permissions/page.tsx",
] as const;

test("every approved document route exists", async () => {
  await Promise.all(approvedDocumentRouteFiles.map((path) => fileAccess(new URL(path, import.meta.url))));
});

test("employee documents route contains no placeholder mock records", () => {
  assert.doesNotMatch(page, /mockDocuments|const\s+documents\s*=\s*\[/i);
  for (const fakeName of ["Alex Johnson", "Sarah Williams", "Michael Brown"]) {
    assert.doesNotMatch(page, new RegExp(fakeName, "i"));
  }
});
