"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  hrNoteCategories,
  type HrNoteActionState,
  type HrNoteCategory,
} from "@/features/employees/hr-notes/types";

const initialState: HrNoteActionState = {};

const categoryLabels: Record<HrNoteCategory, string> = {
  general: "General",
  performance: "Performance",
  disciplinary: "Disciplinary",
  medical: "Medical",
  payroll: "Payroll",
};

export function HrNoteForm({
  employeeId,
  action,
  initialCategory = "general",
  initialContent = "",
  submitLabel,
}: {
  employeeId: string;
  action: (
    state: HrNoteActionState,
    formData: FormData,
  ) => Promise<HrNoteActionState>;
  initialCategory?: HrNoteCategory;
  initialContent?: string;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="card employee-form hr-note-form">
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}

      <section className="form-section">
        <div>
          <h2>HR note</h2>
          <p className="muted">
            Note content is encrypted before it is saved.
          </p>
        </div>

        <div className="form-grid one-column">
          <label>
            <span>Category</span>
            <select
              className="field"
              name="category"
              defaultValue={state.values?.category ?? initialCategory}
              aria-invalid={Boolean(errors.category)}
              aria-describedby={errors.category ? "category-error" : undefined}
            >
              {hrNoteCategories.map((category) => (
                <option key={category} value={category}>
                  {categoryLabels[category]}
                </option>
              ))}
            </select>
            {errors.category && (
              <span id="category-error" className="field-error">
                {errors.category}
              </span>
            )}
          </label>

          <label>
            <span>Note content</span>
            <textarea
              className="field"
              name="content"
              defaultValue={initialContent}
              maxLength={5000}
              required
              autoComplete="off"
              aria-invalid={Boolean(errors.content)}
              aria-describedby={`note-content-help${errors.content ? " note-content-error" : ""}`}
            />
            <small id="note-content-help" className="muted">
              Maximum 5,000 characters. This text is never copied into activity history.
            </small>
            {errors.content && (
              <span id="note-content-error" className="field-error">
                {errors.content}
              </span>
            )}
          </label>
        </div>
      </section>

      <div className="form-actions">
        <Link className="btn" href={`/employees/${employeeId}/hr-notes`}>
          Cancel
        </Link>
        <button className="btn primary" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
