"use client";

import { useActionState } from "react";
import { grantDocumentPermission, revokeDocumentPermission } from "@/app/(dashboard)/admin/documents/actions";
import type { DocumentActionState, DocumentPermissionCode } from "@/features/documents/types";

type PermissionUser = { userId: string; role: string; permissions: DocumentPermissionCode[] };
function PermissionControl({ user, permission, requestId }: { user: PermissionUser; permission: DocumentPermissionCode; requestId: string }) {
  const active = user.permissions.includes(permission);
  const [grantState, grantAction, grantPending] = useActionState(grantDocumentPermission, {} as DocumentActionState);
  const [revokeState, revokeAction, revokePending] = useActionState(revokeDocumentPermission, {} as DocumentActionState);
  const label = permission === "documents.review" ? "Review documents" : "Manage documents";
  if (active) return <form action={revokeAction} className="permission-control"><input type="hidden" name="user_id" value={user.userId} /><input type="hidden" name="permission_code" value={permission} /><input type="hidden" name="request_id" value={requestId} /><strong>{label}</strong><span className="badge success">Granted</span><label className="checkbox-row"><input type="checkbox" name="confirm" required /> Confirm revocation</label>{revokeState.error && <p className="form-error">{revokeState.error}</p>}<button className="btn danger" type="submit" disabled={revokePending}>{revokePending ? "Revoking…" : "Revoke"}</button></form>;
  return <form action={grantAction} className="permission-control"><input type="hidden" name="user_id" value={user.userId} /><input type="hidden" name="permission_code" value={permission} /><input type="hidden" name="request_id" value={requestId} /><strong>{label}</strong><span className="badge info">Not granted</span>{grantState.error && <p className="form-error">{grantState.error}</p>}<button className="btn secondary" type="submit" disabled={grantPending}>{grantPending ? "Granting…" : "Grant"}</button></form>;
}
export function DocumentPermissionForm({ users, requestIds }: { users: PermissionUser[]; requestIds: Record<string, string> }) {
  return <div className="document-version-list">{users.map((user) => <article className="card" key={user.userId}><div className="card-header-row"><div><strong>{user.userId}</strong><span className="muted block">{user.role.replaceAll("_", " ")}</span></div>{user.role === "super_admin" && <span className="badge success">Implicit full access</span>}</div>{user.role === "hr_admin" && <div className="document-detail-grid">{(["documents.review", "documents.manage"] as DocumentPermissionCode[]).map((permission) => <PermissionControl key={permission} user={user} permission={permission} requestId={requestIds[`${user.userId}:${permission}`]} />)}</div>}</article>)}</div>;
}
