"use client";

import { useActionState, useRef } from "react";
import type { OvertimeReviewActionState } from "@/features/overtime/types";

const initialState: OvertimeReviewActionState = {};

export function OvertimeReviewForm({
  approvalItemId,
  action,
}: {
  approvalItemId: string;
  action: (
    state: OvertimeReviewActionState,
    formData: FormData,
  ) => Promise<OvertimeReviewActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const reviewText = useRef<HTMLTextAreaElement>(null);

  return (
    <form action={formAction} className="card correction-review-form">
      <input type="hidden" name="approval_item_id" value={approvalItemId} />
      <input type="hidden" name="expected_status" value="pending" />
      <div>
        <h2 className="card-title">Review decision</h2>
        <p className="muted">
          Approval accepts every detected minute. Rejection accepts zero minutes and requires a reason.
        </p>
      </div>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <label>
        <span>Approval note or rejection reason</span>
        <textarea
          ref={reviewText}
          className="field organization-textarea"
          name="review_text"
          maxLength={1000}
          aria-invalid={Boolean(state.fieldErrors?.review_text)}
        />
        <small className="muted">Optional for approval; required for rejection. Maximum 1,000 characters.</small>
        {state.fieldErrors?.review_text && <span className="field-error">{state.fieldErrors.review_text}</span>}
      </label>
      <div className="form-actions">
        <button
          className="btn"
          disabled={pending}
          name="decision"
          type="submit"
          value="reject"
          onClick={(event) => {
            if (!reviewText.current?.value.trim()) {
              event.preventDefault();
              reviewText.current?.focus();
              return;
            }
            if (!window.confirm("Reject all detected overtime minutes?")) {
              event.preventDefault();
            }
          }}
        >
          {pending ? "Saving…" : "Reject all minutes"}
        </button>
        <button
          className="btn primary"
          disabled={pending}
          name="decision"
          type="submit"
          value="approve"
          onClick={(event) => {
            if (!window.confirm("Approve all detected overtime minutes?")) {
              event.preventDefault();
            }
          }}
        >
          {pending ? "Saving…" : "Approve all minutes"}
        </button>
      </div>
    </form>
  );
}
