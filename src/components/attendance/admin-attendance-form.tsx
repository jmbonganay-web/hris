"use client";

import Link from "next/link";
import { useActionState } from "react";
import { toCompanyDateTimeLocal } from "@/features/attendance/time";
import type {
  AttendanceActionState,
  AttendanceRecord,
} from "@/features/attendance/types";

const initialState: AttendanceActionState = {};

function ErrorText({ message }: { message?: string }) {
  return message ? <span className="field-error">{message}</span> : null;
}

export function AdminAttendanceForm({
  employeeId,
  action,
  initialRecord,
  submitLabel,
}: {
  employeeId: string;
  action: (
    state: AttendanceActionState,
    formData: FormData,
  ) => Promise<AttendanceActionState>;
  initialRecord: AttendanceRecord | null;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const errors = state.fieldErrors ?? {};
  const values = state.values ?? {};

  return (
    <form action={formAction} className="card employee-form admin-attendance-form">
      {state.error && <p className="form-error" role="alert">{state.error}</p>}

      <section className="form-section">
        <div>
          <h2>Attendance times</h2>
          <p className="muted">Enter all dates and times in Asia/Manila.</p>
        </div>
        <div className="form-grid">
          <label>
            <span>Attendance date *</span>
            <input
              className="field"
              type="date"
              name="attendance_date"
              defaultValue={values.attendance_date ?? initialRecord?.attendance_date ?? ""}
              aria-invalid={Boolean(errors.attendance_date)}
              required
            />
            <ErrorText message={errors.attendance_date} />
          </label>
          <label>
            <span>Clock-in — Asia/Manila *</span>
            <input
              className="field"
              type="datetime-local"
              name="clock_in_local"
              defaultValue={values.clock_in_local ?? toCompanyDateTimeLocal(initialRecord?.clock_in_at ?? null)}
              aria-invalid={Boolean(errors.clock_in_local)}
              required
            />
            <ErrorText message={errors.clock_in_local} />
          </label>
          <label>
            <span>Clock-out — Asia/Manila</span>
            <input
              className="field"
              type="datetime-local"
              name="clock_out_local"
              defaultValue={values.clock_out_local ?? toCompanyDateTimeLocal(initialRecord?.clock_out_at ?? null)}
              aria-invalid={Boolean(errors.clock_out_local)}
            />
            <small className="muted">Leave blank only when the record should remain open.</small>
            <ErrorText message={errors.clock_out_local} />
          </label>
          <label className="form-field-wide">
            <span>Correction reason *</span>
            <textarea
              className="field organization-textarea"
              name="reason"
              maxLength={1000}
              aria-invalid={Boolean(errors.reason)}
              required
            />
            <small className="muted">Required for accountability. This text is excluded from audit JSON.</small>
            <ErrorText message={errors.reason} />
          </label>
        </div>
      </section>

      <div className="form-actions">
        <Link className="btn" href={`/admin/attendance/${employeeId}`}>Cancel</Link>
        <button className="btn primary" disabled={pending} type="submit">
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
