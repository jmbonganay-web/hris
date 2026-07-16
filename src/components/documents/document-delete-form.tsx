"use client";

import { useActionState, useState } from "react";
import { permanentlyDeleteEmployeeDocument } from "@/app/(dashboard)/admin/documents/actions";
import type { DocumentActionState } from "@/features/documents/types";

export function DocumentDeleteForm({ documentId, employeeId, requestId }: { documentId: string; employeeId: string; requestId: string }) {
  const [confirmation, setConfirmation] = useState("");
  const [state, action, pending] = useActionState(permanentlyDeleteEmployeeDocument, {} as DocumentActionState);
  return <form action={action} className="document-lifecycle-form danger-zone-form"><input type="hidden" name="document_id" value={documentId} /><input type="hidden" name="employee_id" value={employeeId} /><input type="hidden" name="request_id" value={requestId} /><label><span>Classification</span><select className="field" name="classification" required><option value="">Select</option><option value="invalid">Invalid</option><option value="duplicate">Duplicate</option><option value="mistaken_upload">Mistaken upload</option></select></label><label><span>Permanent deletion reason</span><textarea className="field" name="deletion_reason" rows={3} maxLength={1000} required /></label><label><span>Type DELETE to confirm</span><input className="field" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></label>{state.error && <p className="form-error">{state.error}</p>}{state.correlationId && <p className="muted">Reference: {state.correlationId}</p>}<button className="btn danger" type="submit" disabled={pending || confirmation !== "DELETE"}>{pending ? "Deleting…" : "Permanently delete"}</button></form>;
}
