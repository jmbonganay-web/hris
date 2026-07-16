"use client";

import { useActionState, useState, useTransition } from "react";
import { archiveEmployeeDocument, restoreEmployeeDocument } from "@/app/(dashboard)/admin/documents/actions";
import type { DocumentActionState } from "@/features/documents/types";

export function DocumentArchiveForm({ documentId, employeeId, archivedAt, requestId }: { documentId: string; employeeId: string; archivedAt: string | null; requestId: string }) {
  const [state, action, pending] = useActionState(archiveEmployeeDocument, {} as DocumentActionState);
  const [restoreState, setRestoreState] = useState<DocumentActionState>({});
  const [restoring, startRestore] = useTransition();
  if (archivedAt) return <div className="document-lifecycle-form"><button className="btn secondary" type="button" disabled={restoring} onClick={() => startRestore(async () => setRestoreState(await restoreEmployeeDocument(documentId, requestId as `${string}-${string}-${string}-${string}-${string}`)))}>{restoring ? "Restoring…" : "Restore document"}</button>{restoreState.error && <p className="form-error">{restoreState.error}</p>}{restoreState.success && <p className="form-success">{restoreState.success}</p>}</div>;
  return <form action={action} className="document-lifecycle-form"><input type="hidden" name="document_id" value={documentId} /><input type="hidden" name="employee_id" value={employeeId} /><input type="hidden" name="request_id" value={requestId} /><label><span>Archive reason</span><textarea className="field" name="reason" rows={2} maxLength={1000} required /></label>{state.error && <p className="form-error">{state.error}</p>}<button className="btn danger" type="submit" disabled={pending}>{pending ? "Archiving…" : "Archive document"}</button></form>;
}
