"use client";

import { useActionState } from "react";
import { restoreApprovedDocumentVersion } from "@/app/(dashboard)/admin/documents/actions";
import type { DocumentActionState } from "@/features/documents/types";

export function DocumentRestoreVersionForm({ documentId, employeeId, activeVersionId, versions, requestId }: { documentId: string; employeeId: string; activeVersionId: string | null; versions: Array<{ id: string; versionNumber: number; reviewStatus: string }>; requestId: string }) {
  const options = versions.filter((version) => version.reviewStatus === "approved" && version.id !== activeVersionId);
  const [state, action, pending] = useActionState(restoreApprovedDocumentVersion, {} as DocumentActionState);
  if (options.length === 0) return null;
  return <form action={action} className="document-lifecycle-form"><input type="hidden" name="document_id" value={documentId} /><input type="hidden" name="employee_id" value={employeeId} /><input type="hidden" name="expected_active_version_id" value={activeVersionId ?? ""} /><input type="hidden" name="request_id" value={requestId} /><label><span>Approved version</span><select className="field" name="version_id" required>{options.map((version) => <option key={version.id} value={version.id}>Version {version.versionNumber}</option>)}</select></label><label><span>Restoration reason</span><textarea className="field" name="reason" rows={2} maxLength={1000} required /></label>{state.error && <p className="form-error">{state.error}</p>}<button className="btn secondary" type="submit" disabled={pending}>{pending ? "Restoring…" : "Restore approved version"}</button></form>;
}
