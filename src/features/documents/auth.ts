import type { DocumentPermissionContext, DocumentVisibility } from "./types.ts";

export function canReviewDocuments(context: DocumentPermissionContext) {
  return context.role === "super_admin" || context.permissions.includes("documents.review");
}

export function canManageDocuments(context: DocumentPermissionContext) {
  return context.role === "super_admin" || context.permissions.includes("documents.manage");
}

export function canAccessDocumentAdmin(context: DocumentPermissionContext) {
  return context.role === "super_admin" || context.role === "hr_admin";
}

export function canUseVisibility(context: DocumentPermissionContext, visibility: DocumentVisibility) {
  if (visibility === "employee_hr") return true;
  if (visibility === "hr_only") return context.role === "hr_admin" || context.role === "super_admin";
  return context.role === "super_admin";
}

export async function getDocumentPermissionContext(): Promise<DocumentPermissionContext> {
  const { requireUser } = await import("../employees/auth.ts");
  const { supabase, user } = await requireUser();
  const [{ data: profile }, { data: employee }, { data: grants }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    supabase.from("employees").select("id").eq("profile_id", user.id).is("archived_at", null).maybeSingle(),
    supabase.from("document_permission_grants").select("permission_code").eq("user_id", user.id).is("revoked_at", null),
  ]);
  return {
    userId: user.id,
    role: (profile?.role ?? "employee") as DocumentPermissionContext["role"],
    employeeId: employee?.id ?? null,
    permissions: (grants ?? [])
      .map((row) => row.permission_code)
      .filter((value): value is DocumentPermissionContext["permissions"][number] =>
        value === "documents.review" || value === "documents.manage"),
  };
}

async function redirectTo(path: string): Promise<never> {
  const { redirect } = await import("next/navigation");
  return redirect(path);
}

export async function requireDocumentReviewer() {
  const context = await getDocumentPermissionContext();
  if (!canReviewDocuments(context)) return redirectTo("/documents?error=unauthorized");
  return context;
}

export async function requireDocumentManager() {
  const context = await getDocumentPermissionContext();
  if (!canManageDocuments(context)) return redirectTo("/admin/documents?error=unauthorized");
  return context;
}

export async function requireDocumentEmployeeAccess(employeeId: string) {
  const context = await getDocumentPermissionContext();
  if (context.employeeId !== employeeId && context.role === "employee") {
    return redirectTo("/documents?error=unauthorized");
  }
  return context;
}

export async function requireDocumentAdminAccess() {
  const context = await getDocumentPermissionContext();
  if (!canAccessDocumentAdmin(context)) return redirectTo("/documents?error=unauthorized");
  return context;
}
