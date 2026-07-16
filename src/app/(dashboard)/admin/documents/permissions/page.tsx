import { randomUUID } from "node:crypto";
import { DocumentPermissionForm } from "@/components/documents/document-permission-form";
import { PageHeader } from "@/components/page-header";
import { requireSuperAdmin } from "@/features/employees/auth";
import { listDocumentPermissionGrants } from "@/features/documents/permissions/queries";
import type { DocumentPermissionCode } from "@/features/documents/types";

export default async function DocumentPermissionsPage() {
  await requireSuperAdmin();
  const users = await listDocumentPermissionGrants();
  const requestIds: Record<string, string> = {};
  for (const user of users) for (const permission of ["documents.review", "documents.manage"] as DocumentPermissionCode[]) requestIds[`${user.userId}:${permission}`] = randomUUID();
  return <><PageHeader title="Document Permissions" description="Grant independent review and management permissions to HR Admin users." /><section className="card notice info"><strong>Super Admin access is implicit</strong><p>Only HR Admin users can receive explicit document permission grants. Employees are not eligible.</p></section><DocumentPermissionForm users={users} requestIds={requestIds} /></>;
}
