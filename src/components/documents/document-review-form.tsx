"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { reviewDocumentSubmission } from "@/app/(dashboard)/admin/documents/actions";
import type { DocumentActionState } from "@/features/documents/types";

const initialState: DocumentActionState = {};

export function DocumentReviewForm({
  documentId,
  versionId,
  employeeId,
  expectedUpdatedAt,
  requestId,
}: {
  documentId: string;
  versionId: string;
  employeeId: string;
  expectedUpdatedAt: string;
  requestId: string;
}) {
  const [decision, setDecision] = useState<"approved" | "rejected" | "replacement_requested">("approved");
  const [state, action, pending] = useActionState(reviewDocumentSubmission, initialState);
  const needsReason = decision !== "approved";
  const needsEmployeeMessage = decision === "replacement_requested";
  const concurrent = state.error?.includes("Another reviewer") || state.error?.includes("changed while you were working");
  return (
    <form action={action} className="card document-review-form">
      <div className="card-header-row"><div><h2>Review submission</h2><p>Choose one final decision for this immutable submitted version.</p></div></div>
      <input type="hidden" name="document_id" value={documentId} />
      <input type="hidden" name="version_id" value={versionId} />
      <input type="hidden" name="employee_id" value={employeeId} />
      <input type="hidden" name="expected_version_updated_at" value={expectedUpdatedAt} />
      <input type="hidden" name="request_id" value={requestId} />
      <fieldset disabled={pending}>
        <legend>Decision</legend>
        <div className="radio-group">
          <label className="radio-row"><input type="radio" name="decision" value="approved" checked={decision === "approved"} onChange={() => setDecision("approved")} /> Approve</label>
          <label className="radio-row"><input type="radio" name="decision" value="rejected" checked={decision === "rejected"} onChange={() => setDecision("rejected")} /> Reject</label>
          <label className="radio-row"><input type="radio" name="decision" value="replacement_requested" checked={decision === "replacement_requested"} onChange={() => setDecision("replacement_requested")} /> Request replacement</label>
        </div>
        {needsReason && <label><span>Internal reason <span className="muted">(private, required)</span></span><textarea className="field" name="internal_reason" rows={4} maxLength={1000} required /></label>}
        {needsEmployeeMessage && <label><span>Employee replacement instructions</span><textarea className="field" name="employee_message" rows={4} maxLength={1000} required /></label>}
      </fieldset>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      {concurrent && <Link className="text-link" href="/admin/documents/review">Another reviewer has already processed this submission. Reload the queue.</Link>}
      {state.success && <p className="form-success">{state.success}</p>}
      <button className="btn primary" type="submit" disabled={pending}>{pending ? "Submitting decision…" : "Submit decision"}</button>
    </form>
  );
}
