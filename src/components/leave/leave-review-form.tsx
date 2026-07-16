"use client";

import { useActionState } from "react";
import type { LeaveActionState } from "@/features/leave/types";

const initialState: LeaveActionState = {};

type ReviewAction = (state: LeaveActionState, formData: FormData) => Promise<LeaveActionState>;

function ReviewFields({
  requestGroupId,
  expectedRevisionId,
  expectedChargeableUnits,
  expectedDayFingerprint,
}: {
  requestGroupId: string;
  expectedRevisionId: string;
  expectedChargeableUnits: number;
  expectedDayFingerprint: string;
}) {
  return (
    <>
      <input type="hidden" name="request_group_id" value={requestGroupId} />
      <input type="hidden" name="expected_request_revision_id" value={expectedRevisionId} />
      <input type="hidden" name="expected_status" value="pending" />
      <input type="hidden" name="expected_chargeable_units" value={expectedChargeableUnits} />
      <input type="hidden" name="expected_day_fingerprint" value={expectedDayFingerprint} />
    </>
  );
}

export function LeaveReviewForm({
  requestGroupId,
  expectedRevisionId,
  expectedStatus,
  expectedChargeableUnits,
  expectedDayFingerprint,
  action,
}: {
  requestGroupId: string;
  expectedRevisionId: string;
  expectedStatus: "pending";
  expectedChargeableUnits: number;
  expectedDayFingerprint: string;
  action: ReviewAction;
}) {
  const [approveState, approveAction, approving] = useActionState(action, initialState);
  const [rejectState, rejectAction, rejecting] = useActionState(action, initialState);
  const stale = [approveState.error, rejectState.error].some((message) => message?.includes("reload") || message?.includes("changed"));

  return (
    <section className="card leave-review-panel">
      <h2 className="card-title">HR review</h2>
      {expectedStatus !== "pending" && <p className="form-error">Reload this request before reviewing it.</p>}
      {stale && <p className="form-error">This request changed. Reload the page and review the current version.</p>}
      <div className="leave-review-grid">
        <form action={approveAction} className="form-card">
          <ReviewFields requestGroupId={requestGroupId} expectedRevisionId={expectedRevisionId} expectedChargeableUnits={expectedChargeableUnits} expectedDayFingerprint={expectedDayFingerprint} />
          <input type="hidden" name="decision" value="approve" />
          <label>
            <span>Approval note <span className="muted">(optional, private)</span></span>
            <textarea className="field" name="review_text" rows={4} maxLength={1000} />
          </label>
          {approveState.error && <p className="form-error">{approveState.error}</p>}
          <button className="btn primary" type="submit" disabled={approving || expectedStatus !== "pending"}>
            {approving ? "Approving…" : "Approve request"}
          </button>
        </form>
        <form action={rejectAction} className="form-card">
          <ReviewFields requestGroupId={requestGroupId} expectedRevisionId={expectedRevisionId} expectedChargeableUnits={expectedChargeableUnits} expectedDayFingerprint={expectedDayFingerprint} />
          <input type="hidden" name="decision" value="reject" />
          <label>
            <span>Rejection reason <span className="muted">(required, private)</span></span>
            <textarea className="field" name="review_text" rows={4} maxLength={1000} required />
          </label>
          {rejectState.error && <p className="form-error">{rejectState.error}</p>}
          <button className="btn danger" type="submit" disabled={rejecting || expectedStatus !== "pending"}>
            {rejecting ? "Rejecting…" : "Reject request"}
          </button>
        </form>
      </div>
    </section>
  );
}
