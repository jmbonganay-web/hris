"use client";

import { useActionState } from "react";
import type { AttendanceActionState } from "@/features/attendance/types";

const initialState: AttendanceActionState = {};

export function CorrectionReviewForm({
  action,
}: {
  action: (
    state: AttendanceActionState,
    formData: FormData,
  ) => Promise<AttendanceActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="card correction-review-form">
      <div>
        <h2 className="card-title">Review decision</h2>
        <p className="muted">Approval immediately changes the official attendance record.</p>
      </div>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <label>
        <span>Review note</span>
        <textarea
          className="field organization-textarea"
          name="review_note"
          maxLength={1000}
          aria-invalid={Boolean(errors.review_note)}
        />
        <small className="muted">Optional, up to 1,000 characters.</small>
        {errors.review_note && <span className="field-error">{errors.review_note}</span>}
      </label>
      <div className="form-actions">
        <button
          className="btn"
          disabled={pending}
          name="decision"
          type="submit"
          value="reject"
        >
          {pending ? "Saving…" : "Reject request"}
        </button>
        <button
          className="btn primary"
          disabled={pending}
          name="decision"
          type="submit"
          value="approve"
          onClick={(event) => {
            if (!window.confirm("Approve this request and update official attendance?")) {
              event.preventDefault();
            }
          }}
        >
          {pending ? "Saving…" : "Approve and update attendance"}
        </button>
      </div>
    </form>
  );
}
